-- ============================================================================
-- تطبيق المدرس — 0010_online_exams.sql
-- Phase 3 / الخطوة 4: الامتحانات الإلكترونية بتصحيح تلقائي
--
-- تحويل تقييم قائم من بنك الأسئلة (assessments + assessment_questions)
-- إلى امتحان إلكتروني يدخله الطالب برابط موقّع وبكوده (public_code)،
-- بتصحيح فوري خادمي، وتُرحَّل نتيجته المعتمدة تلقائياً إلى scores.
--
-- نموذج البيانات:
-- • online_exams: صف واحد لكل تقييم مُحوَّل (assessment_id فريد)،
--   بإعدادات: مؤقّت اختياري بالدقائق، حد محاولات لكل طالب، نافذة
--   إتاحة (يبدأ/ينتهي اختياريان)، حالة نشر (draft/published/closed)،
--   السماح بمراجعة الإجابات بعد التسليم فقط، وخلط الأسئلة/الخيارات.
-- • online_exam_tokens: روابط الامتحان — بنفس نمط روابط البوابة
--   (guardian_access_tokens في 0001): القاعدة تخزن SHA-256 hash فقط،
--   مع انتهاء اختياري وإلغاء صريح وآخر استخدام. إعادة التوليد تُلغي
--   الروابط النشطة السابقة للامتحان نفسه (يفرضه العميل كما في البوابة).
-- • exam_attempts: محاولة طالب — بدء/تسليم، بذرة الخلط، لقطة العرض
--   (presentation: ترتيب الأسئلة والخيارات كما رآها الطالب فعلاً،
--   بلا أي إجابة صحيحة)، الإجابات المُسلَّمة، الدرجة والنسبة المحسوبتان
--   خادمياً، وعلم الترحيل إلى scores.
--
-- الأسئلة القابلة للتصحيح التلقائي: type='mcq' ولها correct_answer
-- وخياران فأكثر — وسؤال «صح/خطأ» في بنك الأسئلة القائم هو MCQ
-- بخيارين («صح»/«خطأ») فيدخل في النمط نفسه بلا نوع جديد. الأسئلة
-- المقالية (essay) لا تدخل الامتحان الإلكتروني إطلاقاً.
--
-- نموذج الأمان (شرط قبول الخطوة):
-- • لا سياسة RLS لـ anon على أي جدول هنا — وصول الطالب عبر دوال RPC
--   بـ security definer فقط، تتحقق من هاش التوكن بنفس آلية البوابة
--   (0002/0003/0005): SHA-256، عدم الإلغاء، عدم الانتهاء.
-- • الإجابات الصحيحة لا تغادر الخادم قبل التسليم أبداً: دالة بدء
--   المحاولة تعيد لقطة عرض (أسئلة وخيارات ودرجات) بلا أي حقل إجابة
--   صحيحة، والتصحيح يتم داخل دالة التسليم من correct_answer المخزنة
--   في assessment_questions فقط — العميل يرسل اختياراته كنصوص خيارات.
-- • منع الغش الأساسي: خلط ترتيب الأسئلة والخيارات لكل محاولة ببذرة
--   عشوائية مخزنة مع المحاولة، قيد فريد جزئي يمنع محاولتين جاريتين
--   متزامنتين لنفس الطالب والامتحان (البدء مع محاولة جارية = استئناف
--   لها بنفس اللقطة لا محاولة جديدة)، حد المحاولات يُفرض خادمياً،
--   والمؤقّت يُفرض خادمياً من started_at (مع سماحية 60 ثانية للشبكة)
--   إضافة لعدّاد العميل والتسليم التلقائي عنده.
-- • الترحيل: بعد كل تسليم تُعاد كتابة درجة الطالب في scores بأفضل
--   درجة محاولاته المُسلَّمة لهذا الامتحان (upsert على مفتاح scores)
--   مع source='online_exam' وexam_attempt_id يشير للمحاولة صاحبة
--   الدرجة — فتظهر في ملف الطالب وتبويب درجاته بلا إدخال يدوي مكرر
--   ومميَّزة المصدر. (أعمدة source/exam_attempt_id تُضاف أدناه.)
--
-- RLS للمدرس وفريقه: المالك كامل الصلاحية على جداوله الثلاثة،
-- والمساعد بصلاحية can_manage_grades (نفس نمط assessments/scores
-- في 0001) — وروابط الامتحان (tokens) للمالك فقط لأنها أسرار وصول،
-- مطابقةً لسياسة guardian_tokens_owner_all.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- أنواع الحالات
-- ----------------------------------------------------------------------------
create type online_exam_status as enum ('draft', 'published', 'closed');
create type exam_attempt_status as enum ('in_progress', 'submitted', 'expired');

-- ----------------------------------------------------------------------------
-- الامتحان الإلكتروني — إعدادات فوق تقييم قائم (1:1)
-- ----------------------------------------------------------------------------
create table public.online_exams (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.teachers (id) on delete cascade,
  assessment_id    uuid not null unique references public.assessments (id) on delete cascade,
  -- لقطة مجموعة التقييم وقت التحويل: نطاق دخول الطلاب (المسجلون فيها)
  group_id         uuid not null references public.groups (id) on delete cascade,
  status           online_exam_status not null default 'draft',
  -- مؤقّت اختياري: null = بلا حد زمني للمحاولة
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  max_attempts     int not null default 1 check (max_attempts >= 1),
  -- نافذة الإتاحة: كلاهما اختياري (null = مفتوح من هذه الجهة)
  starts_at        timestamptz,
  ends_at          timestamptz,
  -- مراجعة الإجابات الصحيحة مسموحة بعد التسليم فقط وبهذا العلم فقط
  allow_review     boolean not null default false,
  shuffle_questions boolean not null default true,
  shuffle_options   boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index online_exams_teacher_idx on public.online_exams (teacher_id);
create index online_exams_group_idx on public.online_exams (group_id);

create trigger online_exams_updated_trg before update on public.online_exams
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- روابط الامتحان — هاش فقط (نمط guardian_access_tokens حرفياً)
-- ----------------------------------------------------------------------------
create table public.online_exam_tokens (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  exam_id      uuid not null references public.online_exams (id) on delete cascade,
  token_hash   text not null unique,  -- SHA-256 hex للرمز العشوائي
  expires_at   timestamptz,           -- null = بلا انتهاء (نافذة الامتحان تحكم)
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
create index online_exam_tokens_exam_idx on public.online_exam_tokens (exam_id);
create index online_exam_tokens_teacher_idx on public.online_exam_tokens (teacher_id);

-- ----------------------------------------------------------------------------
-- محاولات الطلاب
-- ----------------------------------------------------------------------------
create table public.exam_attempts (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.teachers (id) on delete cascade,
  exam_id       uuid not null references public.online_exams (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  attempt_no    int not null check (attempt_no >= 1),
  status        exam_attempt_status not null default 'in_progress',
  -- بذرة الخلط التي بُنيت بها لقطة العرض (تُحفظ للتدقيق وإعادة البناء)
  seed          text not null,
  -- لقطة العرض: [{id, text, points, options[]}] بترتيب هذه المحاولة —
  -- بلا correct_answer إطلاقاً (هذا ما يصل للعميل حرفياً)
  presentation  jsonb not null,
  -- إجابات الطالب عند التسليم: {question_id: نص الخيار المختار}
  answers       jsonb not null default '{}'::jsonb,
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  -- نتائج التصحيح الخادمي (null حتى التسليم)
  score         numeric(8,2),
  max_score     numeric(8,2),
  pct           numeric(5,2),
  -- هل درجة scores الحالية للطالب في هذا التقييم مصدرها هذه المحاولة؟
  score_posted  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (exam_id, student_id, attempt_no)
);
create index exam_attempts_teacher_idx on public.exam_attempts (teacher_id, created_at desc);
create index exam_attempts_exam_idx on public.exam_attempts (exam_id, student_id);
-- منع محاولتين جاريتين متزامنتين لنفس الطالب في نفس الامتحان
create unique index exam_attempts_one_open_idx
  on public.exam_attempts (exam_id, student_id)
  where status = 'in_progress';

create trigger exam_attempts_updated_trg before update on public.exam_attempts
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- تمييز مصدر الدرجة في scores: يدوي (الافتراضي القائم) أم امتحان إلكتروني
-- ----------------------------------------------------------------------------
alter table public.scores
  add column source text not null default 'manual'
    check (source in ('manual', 'online_exam')),
  add column exam_attempt_id uuid references public.exam_attempts (id) on delete set null;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.online_exams enable row level security;
alter table public.online_exam_tokens enable row level security;
alter table public.exam_attempts enable row level security;

-- الامتحانات: مالك + مساعد بصلاحية الدرجات (نمط assessments في 0001)
create policy online_exams_owner_all on public.online_exams
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy online_exams_assistant_all on public.online_exams
  for all using (public.member_has_permission(teacher_id, 'can_manage_grades'))
  with check (public.member_has_permission(teacher_id, 'can_manage_grades'));

-- الروابط: المالك فقط (أسرار وصول — نمط guardian_tokens_owner_all)
create policy online_exam_tokens_owner_all on public.online_exam_tokens
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- المحاولات: مالك + مساعد بصلاحية الدرجات (قراءة النتائج وإدارتها)
create policy exam_attempts_owner_all on public.exam_attempts
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy exam_attempts_assistant_all on public.exam_attempts
  for all using (public.member_has_permission(teacher_id, 'can_manage_grades'))
  with check (public.member_has_permission(teacher_id, 'can_manage_grades'));

commit;

begin;

-- ============================================================================
-- دوال RPC للطالب — security definer، والتحقق بالتوكن بنفس آلية البوابة.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- محلّل التوكن الداخلي: يطابق الهاش، يتحقق من عدم الإلغاء والانتهاء،
-- ويسجّل آخر استخدام، ويعيد صف الامتحان + التقييم. داخلي فقط: يُسحب
-- من الجميع ولا يُستدعى إلا من دوال security definer أخرى.
-- ----------------------------------------------------------------------------
create or replace function public.exam_resolve_token(p_token text)
returns table (
  token_id uuid,
  exam_id uuid,
  teacher_id uuid,
  assessment_id uuid,
  group_id uuid
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.online_exam_tokens;
  ex  public.online_exams;
begin
  select * into tok
  from public.online_exam_tokens
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'invalid or expired token';
  end if;

  select * into ex from public.online_exams where id = tok.exam_id;
  if not found then
    raise exception 'invalid or expired token';
  end if;

  update public.online_exam_tokens
  set last_used_at = now()
  where id = tok.id;

  return query select tok.id, ex.id, ex.teacher_id, ex.assessment_id, ex.group_id;
end $$;

revoke execute on function public.exam_resolve_token(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- مهلة التسليم الفعلية لمحاولة: بدء + المؤقّت، مقصوصة بنهاية النافذة
-- ----------------------------------------------------------------------------
create or replace function public.exam_attempt_deadline(
  p_started_at timestamptz,
  p_duration_minutes int,
  p_ends_at timestamptz
)
returns timestamptz
language sql
immutable
as $$
  select case
    when p_duration_minutes is null then p_ends_at
    when p_ends_at is null then p_started_at + make_interval(mins => p_duration_minutes)
    else least(p_started_at + make_interval(mins => p_duration_minutes), p_ends_at)
  end $$;

revoke execute on function public.exam_attempt_deadline(timestamptz, int, timestamptz)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- معلومات الامتحان العامة بالتوكن — لصفحة الدخول قبل كتابة الكود.
-- لا أسئلة ولا إجابات هنا إطلاقاً: بيانات وصفية فقط + هوية السنتر.
-- ----------------------------------------------------------------------------
create or replace function public.exam_info_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  ex public.online_exams;
  a  public.assessments;
  gradable_count int;
  gradable_points numeric;
begin
  select * into r from public.exam_resolve_token(p_token);
  select * into ex from public.online_exams where id = r.exam_id;
  select * into a from public.assessments where id = r.assessment_id;

  select count(*), coalesce(sum(points), 0)
  into gradable_count, gradable_points
  from public.assessment_questions
  where assessment_id = a.id
    and type = 'mcq'
    and correct_answer is not null and btrim(correct_answer) <> ''
    and options is not null and jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) >= 2;

  return jsonb_build_object(
    'exam', jsonb_build_object(
      'title', a.title,
      'group_name', (select name from public.groups where id = ex.group_id),
      'status', ex.status::text,
      'duration_minutes', ex.duration_minutes,
      'max_attempts', ex.max_attempts,
      'starts_at', ex.starts_at,
      'ends_at', ex.ends_at,
      'allow_review', ex.allow_review,
      'questions_count', gradable_count,
      'total_points', gradable_points,
      'pass_score', a.pass_score
    ),
    'brand', (
      select jsonb_build_object(
        'name', ts.brand_name,
        'teacher_name', t.display_name,
        'logo_path', ts.brand_logo_path,
        'accent', ts.brand_accent
      )
      from public.teachers t
      left join public.teacher_settings ts on ts.teacher_id = t.id
      where t.id = ex.teacher_id
    )
  );
end $$;

grant execute on function public.exam_info_by_token(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- بدء محاولة (أو استئناف الجارية): التحقق من النشر والنافذة والطالب
-- (بكوده + مسجل في مجموعة الامتحان + غير موقوف) وحد المحاولات، وبناء
-- لقطة العرض المخلوطة ببذرة عشوائية — بلا أي إجابة صحيحة في الرد.
-- ----------------------------------------------------------------------------
create or replace function public.exam_start_attempt(p_token text, p_student_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
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

  select * into st
  from public.students
  where teacher_id = ex.teacher_id
    and upper(public_code) = upper(btrim(p_student_code));
  if not found then
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
end $$;

grant execute on function public.exam_start_attempt(text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- تسليم محاولة وتصحيحها خادمياً: الدرجة تُحسب من correct_answer المخزنة
-- فقط، والمؤقّت يُتحقق منه من started_at، والنتيجة تُرحَّل لأفضل درجة
-- في scores بمصدر «امتحان إلكتروني». إعادة تسليم محاولة مُسلَّمة تعيد
-- نتيجتها المخزنة (آمنة التكرار لنقرات/أتمتة مكررة).
-- ----------------------------------------------------------------------------
create or replace function public.exam_submit_attempt(
  p_token text,
  p_attempt_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  ex public.online_exams;
  a  public.assessments;
  att public.exam_attempts;
  v_deadline timestamptz;
  grace interval := interval '60 seconds';
  v_score numeric := 0;
  v_max numeric := 0;
  v_pct numeric;
  v_review jsonb := '[]'::jsonb;
  qitem jsonb;
  qrow public.assessment_questions;
  chosen text;
  is_ok boolean;
  best record;
  used int;
begin
  select * into r from public.exam_resolve_token(p_token);
  select * into ex from public.online_exams where id = r.exam_id;
  select * into a from public.assessments where id = r.assessment_id;

  select * into att from public.exam_attempts where id = p_attempt_id;
  if not found or att.exam_id <> ex.id then
    raise exception 'attempt not found';
  end if;

  if att.status = 'submitted' then
    select count(*) into used
    from public.exam_attempts
    where exam_id = ex.id and student_id = att.student_id and status in ('submitted', 'expired');
    return jsonb_build_object(
      'already_submitted', true,
      'score', att.score,
      'max_score', att.max_score,
      'pct', att.pct,
      'passed', att.score >= a.pass_score,
      'attempt_no', att.attempt_no,
      'attempts_used', used,
      'attempts_left', greatest(ex.max_attempts - used, 0),
      'review', null
    );
  end if;
  if att.status <> 'in_progress' then
    raise exception 'attempt not open';
  end if;

  -- التحقق الخادمي من الوقت: بعد المهلة + سماحية الشبكة تُغلق المحاولة.
  -- تُعاد نتيجة {expired: true} ولا يُرفع استثناء — رفع الاستثناء كان
  -- سيلغي تحديث الحالة نفسه بـ rollback فيبقى الصف «جارية» كذباً.
  v_deadline := public.exam_attempt_deadline(att.started_at, ex.duration_minutes, ex.ends_at);
  if v_deadline is not null and now() > v_deadline + grace then
    update public.exam_attempts
    set status = 'expired', answers = coalesce(p_answers, '{}'::jsonb)
    where id = att.id;
    return jsonb_build_object('expired', true, 'attempt_no', att.attempt_no);
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'invalid answers';
  end if;

  -- التصحيح: لكل سؤال في لقطة العرض، الاختيار يُقارن بنص الإجابة
  -- الصحيحة المخزنة في بنك الأسئلة — لا شيء من العميل يُوثق به
  for qitem in select * from jsonb_array_elements(att.presentation) loop
    select * into qrow
    from public.assessment_questions
    where id = (qitem ->> 'id')::uuid;
    if not found then
      continue;
    end if;
    v_max := v_max + qrow.points;
    chosen := p_answers ->> qrow.id::text;
    is_ok := chosen is not null
      and btrim(chosen) = btrim(qrow.correct_answer);
    if is_ok then
      v_score := v_score + qrow.points;
    end if;
    if ex.allow_review then
      v_review := v_review || jsonb_build_object(
        'question_id', qrow.id,
        'chosen', chosen,
        'correct_answer', qrow.correct_answer,
        'is_correct', is_ok
      );
    end if;
  end loop;

  v_pct := case when v_max > 0 then round(v_score / v_max * 100, 2) else 0 end;

  update public.exam_attempts
  set status = 'submitted',
      answers = p_answers,
      submitted_at = now(),
      score = v_score,
      max_score = v_max,
      pct = v_pct
  where id = att.id;

  -- الترحيل التلقائي: أفضل درجة مُسلَّمة لهذا الطالب في هذا الامتحان
  -- تُكتب في scores (مصدرها امتحان إلكتروني) — بلا إدخال يدوي مكرر
  select id, score into best
  from public.exam_attempts
  where exam_id = ex.id and student_id = att.student_id and status = 'submitted'
  order by score desc, submitted_at asc
  limit 1;

  if best is not null then
    insert into public.scores (teacher_id, assessment_id, student_id, score, source, exam_attempt_id)
    values (ex.teacher_id, ex.assessment_id, att.student_id, best.score, 'online_exam', best.id)
    on conflict (assessment_id, student_id)
    do update set score = excluded.score,
                  source = excluded.source,
                  exam_attempt_id = excluded.exam_attempt_id;

    update public.exam_attempts
    set score_posted = (id = best.id)
    where exam_id = ex.id and student_id = att.student_id and status = 'submitted';
  end if;

  select count(*) into used
  from public.exam_attempts
  where exam_id = ex.id and student_id = att.student_id and status in ('submitted', 'expired');

  return jsonb_build_object(
    'already_submitted', false,
    'score', v_score,
    'max_score', v_max,
    'pct', v_pct,
    'passed', v_score >= a.pass_score,
    'attempt_no', att.attempt_no,
    'attempts_used', used,
    'attempts_left', greatest(ex.max_attempts - used, 0),
    'review', case when ex.allow_review then v_review else null end
  );
end $$;

grant execute on function public.exam_submit_attempt(text, uuid, jsonb) to anon, authenticated;

commit;

-- ============================================================================
-- نهاية 0010 — جداول جديدة: online_exams + online_exam_tokens +
-- exam_attempts | أعمدة scores: source + exam_attempt_id | دوال RPC:
-- exam_info_by_token / exam_start_attempt / exam_submit_attempt (للطالب
-- بالتوكن) + دالتان داخليتان مسحوبتان من العموم.
-- النسخة الاحتياطية تُوسَّع في نفس الخطوة بجدولي online_exams
-- وexam_attempts (24 جدولاً) — روابط الامتحان مستثناة كروابط البوابة.
-- ============================================================================
