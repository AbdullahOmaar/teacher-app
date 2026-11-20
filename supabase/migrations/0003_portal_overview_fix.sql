-- ============================================================================
-- تطبيق المدرس — 0003_portal_overview_fix.sql
-- إصلاح portal_build_overview (من 0001): استعلاما latest_scores
-- و recent_attendance كانا يستخدمان jsonb_agg(t ORDER BY t.assess_date)
-- و t هنا عمود jsonb في استعلام فرعي مُسمّى x — لا يوجد alias باسم t
-- أصلاً، فأي تنفيذ فعلي للدالة كان يفشل بـ 42P01
-- «missing FROM-clause entry for table "t"» (لم يظهر قبل خطوة 9 لأن
-- لا استدعاء ناجحاً للدالة حدث قبلها: بالرمز كانت تموت عند digest،
-- وبدونه عند «student not found»).
-- الإصلاح: نفس جسم 0001 حرفياً مع تصحيح مرجع الترتيب إلى عمود
-- الاستعلام الفرعي نفسه (assess_date / session_date). لا تغيير في
-- الحقول المعروضة ولا في المنطق. CREATE OR REPLACE يحافظ على
-- صلاحيات التنفيذ، ونعيد سحب EXECUTE من anon/authenticated
-- احتياطاً (إغلاق 0002).
-- ============================================================================

create or replace function public.portal_build_overview(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  select * into s from public.students where id = p_student_id;
  if not found then
    raise exception 'student not found';
  end if;

  return jsonb_build_object(
    'student', jsonb_build_object(
      'name', s.name,
      'code', s.public_code,
      'grade', s.grade
    ),
    'attendance_rate', (
      select attendance_rate from public.student_attendance_stats
      where student_id = s.id
    ),
    'balance', coalesce((
      select balance from public.student_balances where student_id = s.id
    ), 0),
    'groups', coalesce((
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
    ), '[]'::jsonb),
    'latest_scores', coalesce((
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
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('date', n.note_date, 'text', n.text)
                        order by n.note_date desc)
      from public.student_notes n
      where n.student_id = s.id
    ), '[]'::jsonb),
    'recent_attendance', coalesce((
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
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.portal_build_overview(uuid) from anon, authenticated;
