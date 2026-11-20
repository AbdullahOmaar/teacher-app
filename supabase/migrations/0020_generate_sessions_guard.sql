-- ============================================================================
-- 0020 — إصلاح أمان (مراجعة الكود والأمان 2026-11-20): حارس generate_group_sessions
-- ----------------------------------------------------------------------------
-- الخلل: نسخة 0016 من الدالة كانت تشترط التفويض فقط «إن وُجد مستدعٍ»
-- (auth.uid() is not null). عبر PostgREST يصل الزائر المجهول (anon) بـ
-- uid = null فيُتخطّى الحارس بالكامل، فيستطيع أي شخص بلا حساب توليد حصص
-- لأي سنتر/مجموعة (أُثبت حياً: استدعاء anon أنشأ حصصاً فعلياً).
-- الإصلاح: (1) الحارس صارم — غياب uid مرفوض أيضاً (المستدعي المشروع الوحيد
-- هو واجهة المدرس/المساعد بجلسة مصادقة؛ لا مستدعي خلفي بلا uid)،
-- (2) سحب EXECUTE من public/anon صراحة (دفاع بالعمق).
-- باقي نص الدالة حرفي من 0016 (بما فيه حارس الأرشفة 0007) — لا تغيير سلوكي
-- لأي مستخدم شرعي.
-- ============================================================================

create or replace function public.generate_group_sessions(p_teacher_id uuid, p_group_id uuid, p_month date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  g record;
  d date;
  month_start date := date_trunc('month', p_month)::date;
  month_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  created int := 0;
begin
  -- حراسة صارمة: لا مستدعي بلا جلسة، والمستدعي يجب أن يكون مالك السنتر
  -- أو عضواً نشطاً عنده
  if auth.uid() is null
     or (
       not public.is_teacher_owner(p_teacher_id)
       and not exists (
         select 1 from public.teacher_members
         where teacher_id = p_teacher_id and user_id = auth.uid() and status = 'active'
       )
     ) then
    raise exception 'not authorized';
  end if;

  select * into g from public.groups
  where id = p_group_id and teacher_id = p_teacher_id;
  if not found then
    raise exception 'group % not found for teacher %', p_group_id, p_teacher_id;
  end if;

  -- حارس الأرشفة (0007): مجموعة مؤرشفة لا تولّد حصصاً جديدة إطلاقاً
  if g.archived_at is not null then
    return 0;
  end if;

  d := month_start;
  while d <= month_end loop
    if extract(dow from d)::int = any (g.days) then
      insert into public.sessions
        (teacher_id, group_id, session_date, start_time, duration_minutes, kind, status)
      values
        (p_teacher_id, p_group_id, d, g.start_time, g.duration_minutes, 'regular',
         case when exists (
           select 1 from public.holidays h
           where h.teacher_id = p_teacher_id and h.holiday_date = d
         ) then 'cancelled'::session_status else 'scheduled'::session_status end)
      on conflict do nothing;
      if found then created := created + 1; end if;
    end if;
    d := d + 1;
  end loop;
  return created;
end $function$;

revoke execute on function public.generate_group_sessions(uuid, uuid, date) from public, anon;
