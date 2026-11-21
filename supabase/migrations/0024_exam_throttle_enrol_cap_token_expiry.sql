-- 0024 — تصليب أمني (POST-WAVE-REVIEW مرحلة 3):
-- SEC-2: حد معدل + تأخير على exam_start_attempt (جدول خنق جديد).
-- SEC-6: سقف يومي 150/24h لطلبات صفحة الحجز العامة فوق الحدين القائمين.
-- SEC-L1: online_exam_tokens.expires_at تصبح NOT NULL (لا صفوف NULL حالياً،
-- والعميل صار يرسل قيمة دائماً: ends_at أو +30 يوماً).
-- جدول الخنق بلا سياسات: الوصول عبر دوال security definer فقط.

create table if not exists public.exam_start_throttle (
  id bigint generated always as identity primary key,
  exam_id uuid not null,
  code_norm text not null,
  created_at timestamptz not null default now()
);
create index if not exists exam_start_throttle_lookup
  on public.exam_start_throttle (exam_id, code_norm, created_at);
alter table public.exam_start_throttle enable row level security;

CREATE OR REPLACE FUNCTION public.exam_start_attempt(p_token text, p_student_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  r record;
  ex public.online_exams;
  a  public.assessments;
  st public.students;
  open_att public.exam_attempts;
  used int;
  total_att int;
  v_seed text;
  v_presentation jsonb;
  v_deadline timestamptz;
  new_att public.exam_attempts;
  grace interval := interval '60 seconds';
begin
  select * into r from public.exam_resolve_token(p_token);
  select * into ex from public.online_exams where id = r.exam_id;
  select * into a from public.assessments where id = r.assessment_id;

  if ex.status <> 'published' then
    raise exception 'exam not published';
  end if;
  if ex.starts_at is not null and now() < ex.starts_at then
    raise exception 'exam not started yet';
  end if;
  if ex.ends_at is not null and now() > ex.ends_at then
    raise exception 'exam window closed';
  end if;

  -- حد معدل لكل (امتحان + كود) — SEC-2: تخمين الكود المطبوع على بطاقة
  -- الطالب يُبطأ هنا؛ 15 محاولة/10 دقائق لكل كود تكفي أي استخدام حقيقي
  insert into public.exam_start_throttle (exam_id, code_norm)
  values (ex.id, upper(btrim(p_student_code)));
  delete from public.exam_start_throttle where created_at < now() - interval '1 day';
  select count(*) into used
  from public.exam_start_throttle
  where exam_id = ex.id
    and code_norm = upper(btrim(p_student_code))
    and created_at > now() - interval '10 minutes';
  if used > 15 then
    raise exception 'too many attempts';
  end if;

  select * into st
  from public.students
  where teacher_id = ex.teacher_id
    and upper(public_code) = upper(btrim(p_student_code));
  if not found then
    -- تأخير صغير عند كود غير موجود يبطئ التخمين المتسلسل (SEC-2)
    perform pg_sleep(0.4);
    raise exception 'student code not found';
  end if;
  if st.paused then
    raise exception 'student is paused';
  end if;
  if not exists (
    select 1 from public.enrollments e
    where e.student_id = st.id and e.group_id = ex.group_id
  ) then
    raise exception 'student not in exam group';
  end if;

  -- محاولة جارية؟ انتهت مهلتها = منتهية ومحسوبة، وإلا تُستأنف كما هي
  select * into open_att
  from public.exam_attempts
  where exam_id = ex.id and student_id = st.id and status = 'in_progress'
  order by started_at desc
  limit 1;

  if found then
    v_deadline := public.exam_attempt_deadline(open_att.started_at, ex.duration_minutes, ex.ends_at);
    if v_deadline is not null and now() > v_deadline + grace then
      update public.exam_attempts
      set status = 'expired'
      where id = open_att.id;
      open_att := null;
    else
      select count(*) into used
      from public.exam_attempts
      where exam_id = ex.id and student_id = st.id and status in ('submitted', 'expired');
      return jsonb_build_object(
        'attempt_id', open_att.id,
        'resumed', true,
        'attempt_no', open_att.attempt_no,
        'started_at', open_att.started_at,
        'deadline_at', v_deadline,
        'duration_minutes', ex.duration_minutes,
        'max_attempts', ex.max_attempts,
        'attempts_used', used,
        'student', jsonb_build_object('name', st.name),
        'exam', jsonb_build_object('title', a.title, 'allow_review', ex.allow_review),
        'presentation', open_att.presentation
      );
    end if;
  end if;

  select count(*) into used
  from public.exam_attempts
  where exam_id = ex.id and student_id = st.id and status in ('submitted', 'expired');
  if used >= ex.max_attempts then
    raise exception 'attempt limit reached';
  end if;

  -- لقطة العرض: أسئلة قابلة للتصحيح التلقائي فقط، مخلوطة بالبذرة —
  -- الحقول المعادة لكل سؤال: id/text/points/options فقط، لا إجابة صحيحة
  v_seed := md5(random()::text || clock_timestamp()::text || st.id::text || ex.id::text);
  select coalesce(jsonb_agg(qobj order by ordkey), '[]'::jsonb)
  into v_presentation
  from (
    select
      case when ex.shuffle_questions
        then md5(v_seed || q.id::text)
        else q.position::text
      end as ordkey,
      jsonb_build_object(
        'id', q.id,
        'text', q.text,
        'points', q.points,
        'options', (
          select coalesce(jsonb_agg(opt order by
            case when ex.shuffle_options then md5(v_seed || q.id::text || opt) else opt end
          ), '[]'::jsonb)
          from jsonb_array_elements_text(q.options) as opt
        )
      ) as qobj
    from public.assessment_questions q
    where q.assessment_id = a.id
      and q.type = 'mcq'
      and q.correct_answer is not null and btrim(q.correct_answer) <> ''
      and q.options is not null and jsonb_typeof(q.options) = 'array'
      and jsonb_array_length(q.options) >= 2
  ) s;

  if jsonb_array_length(v_presentation) = 0 then
    raise exception 'exam has no gradable questions';
  end if;

  select count(*) into total_att
  from public.exam_attempts
  where exam_id = ex.id and student_id = st.id;

  begin
    insert into public.exam_attempts (
      teacher_id, exam_id, student_id, attempt_no, seed, presentation
    ) values (
      ex.teacher_id, ex.id, st.id, total_att + 1, v_seed, v_presentation
    )
    returning * into new_att;
  exception when unique_violation then
    -- سباق متزامن: محاولة جارية فُتحت للتو — تُستأنف بدل فتح ثانية
    select * into new_att
    from public.exam_attempts
    where exam_id = ex.id and student_id = st.id and status = 'in_progress'
    order by started_at desc
    limit 1;
    v_deadline := public.exam_attempt_deadline(new_att.started_at, ex.duration_minutes, ex.ends_at);
    return jsonb_build_object(
      'attempt_id', new_att.id,
      'resumed', true,
      'attempt_no', new_att.attempt_no,
      'started_at', new_att.started_at,
      'deadline_at', v_deadline,
      'duration_minutes', ex.duration_minutes,
      'max_attempts', ex.max_attempts,
      'attempts_used', used,
      'student', jsonb_build_object('name', st.name),
      'exam', jsonb_build_object('title', a.title, 'allow_review', ex.allow_review),
      'presentation', new_att.presentation
    );
  end;

  v_deadline := public.exam_attempt_deadline(new_att.started_at, ex.duration_minutes, ex.ends_at);
  return jsonb_build_object(
    'attempt_id', new_att.id,
    'resumed', false,
    'attempt_no', new_att.attempt_no,
    'started_at', new_att.started_at,
    'deadline_at', v_deadline,
    'duration_minutes', ex.duration_minutes,
    'max_attempts', ex.max_attempts,
    'attempts_used', used,
    'student', jsonb_build_object('name', st.name),
    'exam', jsonb_build_object('title', a.title, 'allow_review', ex.allow_review),
    'presentation', new_att.presentation
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.enrolment_submit_by_token(p_token text, p_student_name text, p_guardian_phone text, p_group_id uuid, p_wants_trial boolean DEFAULT false, p_note text DEFAULT NULL::text, p_honeypot text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  r record;
  v_name text;
  v_phone text;
  v_note text;
  v_recent_phone int;
  v_recent_teacher int;
begin
  -- honeypot: حقل خفي لا يملأه بشر — إسقاط صامت بنجاح وهمي
  if p_honeypot is not null and btrim(p_honeypot) <> '' then
    return jsonb_build_object('ok', true);
  end if;

  select * into r from public.enrolment_resolve_token(p_token);

  v_name := btrim(coalesce(p_student_name, ''));
  if char_length(v_name) < 3 or char_length(v_name) > 80 then
    raise exception 'invalid name';
  end if;

  -- موبايل مصري: 11 رقماً يبدأ بـ 010/011/012/015 بعد نزع المسافات والشرطات
  v_phone := regexp_replace(coalesce(p_guardian_phone, ''), '[\s-]', '', 'g');
  if v_phone !~ '^01[0125][0-9]{8}$' then
    raise exception 'invalid phone';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid note';
  end if;

  -- المجموعة المطلوبة: موجودة، لنفس السنتر، وغير مؤرشفة
  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id
      and g.teacher_id = r.teacher_id
      and g.archived_at is null
  ) then
    raise exception 'invalid group';
  end if;

  -- حدود المعدل: نفس الرقم 3 طلبات/24 ساعة، والسنتر 30 طلباً/ساعة
  select count(*) into v_recent_phone
  from public.group_waitlist w
  where w.teacher_id = r.teacher_id
    and w.source = 'booking_page'
    and w.phone = v_phone
    and w.created_at > now() - interval '24 hours';
  if v_recent_phone >= 3 then
    raise exception 'too many requests';
  end if;

  select count(*) into v_recent_teacher
  from public.group_waitlist w
  where w.teacher_id = r.teacher_id
    and w.source = 'booking_page'
    and w.created_at > now() - interval '1 hour';
  if v_recent_teacher >= 30 then
    raise exception 'too many requests';
  end if;

  -- سقف يومي للسنتر (SEC-6): يحدّ أسوأ سبام ممكن عند 150 صفاً/يوم
  -- بدل ~720، مع بقاء الدفعات المشروعة (30/ساعة) كما هي
  select count(*) into v_recent_teacher
  from public.group_waitlist w
  where w.teacher_id = r.teacher_id
    and w.source = 'booking_page'
    and w.created_at > now() - interval '24 hours';
  if v_recent_teacher >= 150 then
    raise exception 'too many requests';
  end if;

  insert into public.group_waitlist (
    teacher_id, group_id, name, phone, note, source, wants_trial
  ) values (
    r.teacher_id, p_group_id, v_name, v_phone, v_note,
    'booking_page', coalesce(p_wants_trial, false)
  );

  return jsonb_build_object('ok', true);
end $function$
;

alter table public.online_exam_tokens alter column expires_at set not null;
