-- ===========================================================================
-- 0072 — ترحيل درجة الامتحان الإلكتروني لا يتجاوز النهائية أبداً (3A-928)
-- ----------------------------------------------------------------------------
-- الخلل المؤكد حياً: طالب درجته 25 من 20 (125٪) وصلت لولي الأمر.
-- المسار: exam_submit_attempt تُرحّل أفضل درجة مُسلَّمة إلى scores كما
-- هي؛ وأفضل محاولة قديمة قد تكون قُدّرت على مجموعة أسئلة أكبر (قبل حذف
-- سؤال أو تخفيض نقاطه) بينما نهائية التقييم الحالية أصغر — فتُكتب درجة
-- فوق النهائية ويعرضها كل قارئ (صفحة التقييم/البوابتان/واتساب) كما هي.
-- الإصلاح داخل كتلة الترحيل فقط (باقي جسم 0010 حرفي):
-- (1) مواءمة assessments.max_score مع مجموع نقاط الأسئلة الحالي (v_max
--     — حقيقة الامتحان الإلكتروني، كما يفعل syncAssessmentMax عند تحرير
--     الأسئلة) وخفض pass_score إليها إن تجاوزتها؛
-- (2) الدرجة المُرحَّلة = least(best.score, v_max).
-- ملاحظة: درجات scores القائمة فوق النهائية من قبل تطبيق هذه المهاجرة
-- لا تُمسّ هنا (بيانات حية — تصحيحها بقرار منفصل)؛ من أول تسليم قادم
-- لأي امتحان تُواءم نهائيته وتُسقَف درجته المُرحَّلة.
-- ===========================================================================

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
    -- مواءمة نهائية التقييم مع مجموع نقاط الأسئلة الحالي وسقف للدرجة
    -- المُرحَّلة (3A-928): أفضل محاولة أقدم قد تكون قُدّرت على مجموعة
    -- أسئلة أكبر قبل حذف سؤال/تعديل نقاطه — فلا تُكتب في scores درجة
    -- فوق النهائية أبداً، ولا تبقى درجة نجاح فوق النهائية.
    update public.assessments
    set max_score = v_max, pass_score = least(pass_score, v_max)
    where id = ex.assessment_id and (max_score <> v_max or pass_score > v_max);
    insert into public.scores (teacher_id, assessment_id, student_id, score, source, exam_attempt_id)
    values (ex.teacher_id, ex.assessment_id, att.student_id, least(best.score, v_max), 'online_exam', best.id)
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
