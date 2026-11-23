-- ===========================================================================
-- 0038 — صلاحيات عرض أقسام البوابتين (3A-385 — ب من التصميم): دالتا بناء
-- العرض تُصفّيان الأقسام التي أخفاها المدرس (أعلام 0037) فلا تُرسَل
-- بياناتها أصلاً، وتُلحقان خريطة sections بالحمولة لتعرف الواجهة الفرق
-- بين «مخفي بقرار المدرس» و«لا بيانات بعد».
--
-- الأجسام هي أجسام 0029 الحية حرفياً + قراءة صف الإعدادات مرة واحدة +
-- بوّابة case لكل قسم. غياب صف الإعدادات = كل الأقسام ظاهرة (coalesce
-- إلى true) وهو السلوك الحالي؛ وكل الأعلام افتراضيها true أصلاً، فلا
-- تغيير سلوكي لأي مدرس قائم حتى يخفي قسماً بنفسه.
--
-- خريطة الأقسام:
-- • ولي الأمر: attendance (نسبة الحضور + سجل آخر الحصص)، scores (آخر
--   الدرجات)، notes (ملاحظات المدرس)، money (الرصيد — وإثباتات الدفع
--   تُفرض في 0039)، groups (مواعيد المجموعات وروابطها).
-- • الطالب: schedule (المجموعات + الحصص القادمة)، homework (الواجبات
--   وملخصها + نسبة الحضور المشتقة من الحضور نفسه)، grades (الدرجات +
--   نتائج الامتحانات الإلكترونية)، money (الرصيد + الفواتير + الدفعات).
-- الصلاحيات كما في 0029: البنّاءان مغلقان أمام anon/authenticated.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.portal_build_overview(p_student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record;
  v_ts public.teacher_settings;
  v_show_attendance boolean;
  v_show_scores boolean;
  v_show_notes boolean;
  v_show_money boolean;
  v_show_groups boolean;
begin
  select * into s from public.students where id = p_student_id;
  if not found then
    raise exception 'student not found';
  end if;

  select * into v_ts from public.teacher_settings where teacher_id = s.teacher_id;
  v_show_attendance := coalesce(v_ts.portal_guardian_show_attendance, true);
  v_show_scores := coalesce(v_ts.portal_guardian_show_scores, true);
  v_show_notes := coalesce(v_ts.portal_guardian_show_notes, true);
  v_show_money := coalesce(v_ts.portal_guardian_show_money, true);
  v_show_groups := coalesce(v_ts.portal_guardian_show_groups, true);

  return jsonb_build_object(
    'student', jsonb_build_object(
      'name', s.name,
      'code', s.public_code,
      'grade', s.grade
    ),
    'brand', (
      select jsonb_build_object(
        'name', ts.brand_name,
        'teacher_name', t.display_name,
        'logo_path', ts.brand_logo_path,
        'accent', ts.brand_accent,
        'mascot_accessory', coalesce(ts.mascot_accessory, 'none'),
        'show_mascot', coalesce(ts.show_mascot, true)
      )
      from public.teachers t
      left join public.teacher_settings ts on ts.teacher_id = t.id
      where t.id = s.teacher_id
    ),
    'sections', jsonb_build_object(
      'attendance', v_show_attendance,
      'scores', v_show_scores,
      'notes', v_show_notes,
      'money', v_show_money,
      'groups', v_show_groups
    ),
    'attendance_rate', case when v_show_attendance then (
      select attendance_rate from public.student_attendance_stats
      where student_id = s.id
    ) end,
    'balance', case when v_show_money then coalesce((
      select balance from public.student_balances where student_id = s.id
    ), 0) end,
    'groups', case when v_show_groups then coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', g.name,
        'days', g.days,
        'start_time', g.start_time,
        'room', g.room,
        'links', g.links
      ) order by g.name)
      from public.enrollments e
      join public.groups g on g.id = e.group_id
      where e.student_id = s.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'latest_scores', case when v_show_scores then coalesce((
      select jsonb_agg(t order by assess_date desc)
      from (
        select jsonb_build_object(
          'title', a.title,
          'date', a.assess_date,
          'score', sc.score,
          'max_score', a.max_score
        ) as t, a.assess_date
        from public.scores sc
        join public.assessments a on a.id = sc.assessment_id
        where sc.student_id = s.id
        order by a.assess_date desc
        limit 10
      ) x
    ), '[]'::jsonb) else '[]'::jsonb end,
    'notes', case when v_show_notes then coalesce((
      select jsonb_agg(jsonb_build_object('date', n.note_date, 'text', n.text)
                        order by n.note_date desc)
      from public.student_notes n
      where n.student_id = s.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'recent_attendance', case when v_show_attendance then coalesce((
      select jsonb_agg(t order by session_date desc)
      from (
        select jsonb_build_object(
          'date', se.session_date,
          'group_name', g.name,
          'status', at.status
        ) as t, se.session_date
        from public.attendance at
        join public.sessions se on se.id = at.session_id
        join public.groups g on g.id = se.group_id
        where at.student_id = s.id and at.status is not null
        order by se.session_date desc
        limit 10
      ) x
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end $function$;

revoke execute on function public.portal_build_overview(uuid) from anon, authenticated;

CREATE OR REPLACE FUNCTION public.student_portal_build_overview(p_student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record;
  v_ts public.teacher_settings;
  v_show_schedule boolean;
  v_show_homework boolean;
  v_show_grades boolean;
  v_show_money boolean;
begin
  select * into s from public.students where id = p_student_id;
  if not found then
    raise exception 'student not found';
  end if;

  select * into v_ts from public.teacher_settings where teacher_id = s.teacher_id;
  v_show_schedule := coalesce(v_ts.portal_student_show_schedule, true);
  v_show_homework := coalesce(v_ts.portal_student_show_homework, true);
  v_show_grades := coalesce(v_ts.portal_student_show_grades, true);
  v_show_money := coalesce(v_ts.portal_student_show_money, true);

  return jsonb_build_object(
    'student', jsonb_build_object(
      'name', s.name,
      'code', s.public_code,
      'grade', s.grade
    ),
    'brand', (
      select jsonb_build_object(
        'name', ts.brand_name,
        'teacher_name', t.display_name,
        'logo_path', ts.brand_logo_path,
        'accent', ts.brand_accent,
        'mascot_accessory', coalesce(ts.mascot_accessory, 'none'),
        'show_mascot', coalesce(ts.show_mascot, true)
      )
      from public.teachers t
      left join public.teacher_settings ts on ts.teacher_id = t.id
      where t.id = s.teacher_id
    ),
    'sections', jsonb_build_object(
      'schedule', v_show_schedule,
      'homework', v_show_homework,
      'grades', v_show_grades,
      'money', v_show_money
    ),
    'attendance_rate', case when v_show_homework then (
      select attendance_rate from public.student_attendance_stats
      where student_id = s.id
    ) end,
    'balance', case when v_show_money then coalesce((
      select balance from public.student_balances where student_id = s.id
    ), 0) end,
    -- مجموعات الطالب المسجل فيها (مواعيدها الثابتة وروابط ملازمها)
    'groups', case when v_show_schedule then coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', g.name,
        'days', g.days,
        'start_time', g.start_time,
        'room', g.room,
        'links', g.links
      ) order by g.name)
      from public.enrollments e
      join public.groups g on g.id = e.group_id
      where e.student_id = s.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    -- حصصه القادمة: حصص مجموعاته المسجل فيها فقط، المجدولة من اليوم
    -- فصاعداً — بلا أي صف طالب آخر إطلاقاً (الحصص كيان مجموعة لا طالب)
    'upcoming_sessions', case when v_show_schedule then coalesce((
      select jsonb_agg(t order by session_date, start_time)
      from (
        select jsonb_build_object(
          'date', se.session_date,
          'start_time', se.start_time,
          'duration_minutes', se.duration_minutes,
          'kind', se.kind,
          'group_name', g.name,
          'room', g.room
        ) as t, se.session_date, se.start_time
        from public.sessions se
        join public.groups g on g.id = se.group_id
        where se.teacher_id = s.teacher_id
          and se.session_date >= current_date
          and se.status = 'scheduled'
          and exists (
            select 1 from public.enrollments e
            where e.student_id = s.id and e.group_id = se.group_id
          )
        order by se.session_date, se.start_time
        limit 20
      ) x
    ), '[]'::jsonb) else '[]'::jsonb end,
    -- واجباته: صفوف حضوره هو فقط (الحالة + تسليم الواجب) — أحدث 20 حصة
    'homework', case when v_show_homework then coalesce((
      select jsonb_agg(t order by session_date desc)
      from (
        select jsonb_build_object(
          'date', se.session_date,
          'group_name', g.name,
          'status', at.status,
          'homework_done', at.homework_done
        ) as t, se.session_date
        from public.attendance at
        join public.sessions se on se.id = at.session_id
        join public.groups g on g.id = se.group_id
        where at.student_id = s.id and at.status is not null
        order by se.session_date desc
        limit 20
      ) x
    ), '[]'::jsonb) else '[]'::jsonb end,
    'homework_summary', case when v_show_homework then (
      select jsonb_build_object(
        'marked', count(*) filter (where at.status is not null),
        'submitted', count(*) filter (where at.status is not null and at.homework_done)
      )
      from public.attendance at
      where at.student_id = s.id
    ) else jsonb_build_object('marked', 0, 'submitted', 0) end,
    -- درجاته: scores الخاصة به فقط، شاملة المُرحَّلة من الامتحانات
    -- الإلكترونية ومميَّزة بمصدرها (source) — أحدث 20 درجة
    'grades', case when v_show_grades then coalesce((
      select jsonb_agg(t order by assess_date desc)
      from (
        select jsonb_build_object(
          'title', a.title,
          'type', a.type,
          'date', a.assess_date,
          'score', sc.score,
          'max_score', a.max_score,
          'pass_score', a.pass_score,
          'source', sc.source
        ) as t, a.assess_date
        from public.scores sc
        join public.assessments a on a.id = sc.assessment_id
        where sc.student_id = s.id
        order by a.assess_date desc
        limit 20
      ) x
    ), '[]'::jsonb) else '[]'::jsonb end,
    -- نتائج امتحاناته الإلكترونية: محاولاته المُسلَّمة هو فقط
    'exam_results', case when v_show_grades then coalesce((
      select jsonb_agg(t order by submitted_at desc)
      from (
        select jsonb_build_object(
          'title', a.title,
          'attempt_no', ea.attempt_no,
          'score', ea.score,
          'max_score', ea.max_score,
          'pct', ea.pct,
          'submitted_at', ea.submitted_at,
          'score_posted', ea.score_posted
        ) as t, ea.submitted_at
        from public.exam_attempts ea
        join public.online_exams oe on oe.id = ea.exam_id
        join public.assessments a on a.id = oe.assessment_id
        where ea.student_id = s.id and ea.status = 'submitted'
        order by ea.submitted_at desc
        limit 10
      ) x
    ), '[]'::jsonb) else '[]'::jsonb end,
    -- فواتيره هو فقط بأرصدتها المحسوبة من الـ view — أحدث 12 شهراً
    'invoices', case when v_show_money then coalesce((
      select jsonb_agg(t order by period_month desc)
      from (
        select jsonb_build_object(
          'period_month', ib.period_month,
          'group_name', g.name,
          'total', ib.total,
          'paid', ib.paid,
          'balance', ib.balance,
          'is_paid', ib.is_paid
        ) as t, ib.period_month
        from public.invoice_balances ib
        join public.groups g on g.id = ib.group_id
        where ib.student_id = s.id
        order by ib.period_month desc
        limit 12
      ) x
    ), '[]'::jsonb) else '[]'::jsonb end,
    -- دفعاته هو فقط — أحدث 15 دفعة (الدفعات العكسية السالبة تظهر كما هي)
    'recent_payments', case when v_show_money then coalesce((
      select jsonb_agg(t order by paid_on desc, created_at desc)
      from (
        select jsonb_build_object(
          'amount', p.amount,
          'method', p.method,
          'paid_on', p.paid_on,
          'receipt_no', p.receipt_no
        ) as t, p.paid_on, p.created_at
        from public.payments p
        join public.invoices i on i.id = p.invoice_id
        where i.student_id = s.id
        order by p.paid_on desc, p.created_at desc
        limit 15
      ) x
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end $function$;

revoke execute on function public.student_portal_build_overview(uuid) from public, anon, authenticated;
