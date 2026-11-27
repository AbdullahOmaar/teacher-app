-- ============================================================================
-- 0069 — إصلاح قيد نوع التجاوز: إسقاط قيد 0059 الأصلي على kind
-- ----------------------------------------------------------------------------
-- العيب (اكتُشف 2026-11-27 بأول تشغيل حي لقسم authz ‏0063 بعد تطبيق
-- المهاجرات على الإنتاج): كتلة إسقاط القيود في 0063 أسقطت القيود التي
-- تحوي «whatsapp_auto» أو «jsonb_typeof(value)» فقط — وقيد العمود الأصلي
-- من 0059 ‏(kind in ('feature','limit')) لا يحوي أيًا منهما، فبقي حيًا
-- ورفض أي إدراج kind='setting' بخطأ 23514 — أي تطبيق قالب أدوار فيه
-- إعداد قناة تأكيد (أو set_account_override بنوع setting) كان ينكسر.
--
-- الإصلاح الحي طُبق على الإنتاج 2026-11-27 ضمن نشر الاستثناء بأمر
-- المالك، وهذه المهاجرة توثّق نفس التغيير في الكود حتى لا يفترق الكود
-- عن القاعدة: إسقاط أي قيد kind قديم بالبحث عن تعريفه (لا بالاسم)، ثم
-- قيد v3 يضم الأنواع الثلاثة. آمنة لإعادة التشغيل على قاعدة طُبق
-- عليها الإصلاح الحي (الإسقاط بالتعريف لا يجد شيئًا، والإضافة مشروطة
-- بعدم الوجود).
-- ============================================================================

begin;

do $$
declare
  r record;
begin
  -- إسقاط قيد kind الأصلي (feature/limit فقط) أينما وُجد بلا 'setting'.
  for r in
    select conname
      from pg_constraint
     where conrelid = 'public.account_overrides'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%kind%'
       and pg_get_constraintdef(oid) like '%''feature''%'
       and pg_get_constraintdef(oid) not like '%''setting''%'
  loop
    execute format('alter table public.account_overrides drop constraint %I', r.conname);
  end loop;

  -- إضافة قيد v3 بالأنواع الثلاثة إن لم يكن موجودًا.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.account_overrides'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%kind%'
       and pg_get_constraintdef(oid) like '%''setting''%'
  ) then
    alter table public.account_overrides
      add constraint account_overrides_kind_check_v3
      check (kind in ('feature', 'limit', 'setting'));
  end if;
end $$;

commit;
