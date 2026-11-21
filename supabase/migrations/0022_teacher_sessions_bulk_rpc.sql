-- ============================================================================
-- 0022 — أداء (3A-296): دالة توليد حصص مجمّعة لمدرس كامل
-- ----------------------------------------------------------------------------
-- المشكلة: العميل كان يستدعي generate_group_sessions مرة لكل (مجموعة × شهر)
-- — على الديمو 13–25 استدعاء RPC عند كل تحميل بارد للرئيسية/الواجب، رغم أن
-- العملية idempotent ولا تنشئ شيئاً في الغالب.
-- الحل: generate_teacher_sessions(p_teacher_id, p_months[]) تستدعي الدالة
-- القائمة داخلياً لكل مجموعة نشطة/غير مؤرشفة ولكل شهر مطلوب، في طلب واحد.
-- الحارس: نفس حارس 0020 حرفياً (لا مستدعي بلا جلسة + مالك أو عضو نشط)،
-- والدالة الداخلية تعيد فحص التفويض عند كل استدعاء (دفاع بالعمق)، وEXECUTE
-- مسحوب من public/anon وممنوح لـ authenticated فقط.
-- لا تغيير سلوكي: نفس الحصص تُنشأ بنفس القواعد؛ الفرق عدد الطلبات فقط.
-- ============================================================================

create or replace function public.generate_teacher_sessions(p_teacher_id uuid, p_months date[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  total int := 0;
  g record;
  m date;
begin
  -- حراسة صارمة (نمط 0020): لا مستدعي بلا جلسة، والمالك أو عضو نشط فقط
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

  if p_months is null or array_length(p_months, 1) is null then
    return 0;
  end if;

  for g in
    select id from public.groups
    where teacher_id = p_teacher_id and archived_at is null
  loop
    foreach m in array p_months loop
      total := total + public.generate_group_sessions(p_teacher_id, g.id, m);
    end loop;
  end loop;

  return total;
end;
$function$;

revoke execute on function public.generate_teacher_sessions(uuid, date[]) from public, anon;

grant execute on function public.generate_teacher_sessions(uuid, date[]) to authenticated;
