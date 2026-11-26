-- ============================================================================
-- 0064 — إنفاذ حد أعضاء الفريق + الإيقاف/التفعيل (Phase 2 T21 — 3A-896)
-- ----------------------------------------------------------------------------
-- الفجوة: طبقة العضوية مكتملة من فيز 1 (دعوة بالبريد/المعرّف + ادعاء +
-- تعديل صلاحيات + حذف + واجهة قسم الفريق)، لكن حدّ max_team_members
-- المعرّف في الاستحقاقات (0059/0058: تجريبي 1 / أساسي 3 / احترافي 10)
-- لم يُنفَّذ في أي مكان — لا فحص مسبق ولا حارس قاعدة؛ وحالة
-- suspended موجودة في النوع والواجهة لكن لا مسار يضبطها أبداً.
--
-- • تريجر `team_limit_trg` ‏BEFORE INSERT على teacher_members: الإنفاذ
--   الخادمي للحد الفعّال (باقة ⊕ تجاوزات عبر effective_entitlements)
--   — عند بلوغ الحد يرفع 'limit_reached:max_team_members' فيُترجم
--   في العميل لرسالة عربية ودودة (translateDbError).
-- • كل صف يشغل مقعداً: active + invited + suspended تُحسب كلها —
--   الدعوة المعلّقة مقعد محجوز، والموقوف قابل للتفعيل.
-- • الكاتب دائماً مالك مساحة العمل (سياسة members_owner_all) فلا حاجة
--   لمسار عضو؛ بلا جلسة (service role — تعبئة/سكربت خادمي) لا إنفاذ.
-- • بلا اشتراك/حد (effective_entitlements ترجع null أو الحد null) لا
--   إنفاذ — متسامح عمداً، نفس نمط تريجر الطلاب في 0062.
-- • الإيقاف/التفعيل: تحديث status عبر العميل بسياسة المالك القائمة +
--   سجل نشاط (member_suspended / member_reactivated) — لا مهاجرة
--   إضافية: سياسات المساعد تشترط status='active' فالإيقاف يقطع
--   الوصول خادمياً فوراً، بلا أي تغيير في سياسات RLS.
-- • خاصية team_accounts نفسها لا تُفرض هنا عمداً: الباقات لا تزرع
--   مفاتيح خصائص (0059: الخريطة features تبدأ فارغة وتُملأ من
--   التجاوزات وحدها)، ففرضها كان سيكسر ميزة الفريق الحيّة القائمة؛
--   الحدّ العددي max_team_members هو الإنفاذ المُلزم.
-- • قيد موثّق لا مخفي: إدخالان متزامنان قد يتجاوزا الحد بواحد (بلا
--   قفل استشاري) — نفس قيد تريجر الطلاب في 0062.
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): مهاجرة كود فقط — لا
-- تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 + بوابة QA. فحص
-- العميل المسبق متسامح مع غياب دوالها (يتخطى).
-- ترتيب التطبيق بعد 0058 و0059 (تعتمد effective_entitlements()).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) حارس حد الفريق — BEFORE INSERT على teacher_members
-- ---------------------------------------------------------------------------
create or replace function public.enforce_team_limit()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ent jsonb;
  v_limit integer;
  v_used integer;
begin
  -- بلا جلسة (service role — تعبئة/سكربت خادمي) لا إنفاذ: الإنفاذ
  -- يطال كتابات المدرسين المصادق عليها فقط.
  if auth.uid() is null then
    return new;
  end if;

  -- الحد الفعّال من effective_entitlements() (باقة ⊕ تجاوزات)؛
  -- الحارس هناك: مالك مساحة العمل أو أدمن المنصة — والكاتب هنا
  -- مالك حتماً بسياسة members_owner_all.
  v_ent := public.effective_entitlements(new.teacher_id);
  if v_ent is null then
    return new;
  end if;
  v_limit := case
    when (v_ent -> 'limits' -> 'max_team_members') is null then null
    when jsonb_typeof(v_ent -> 'limits' -> 'max_team_members') <> 'number' then null
    else floor(((v_ent -> 'limits' ->> 'max_team_members'))::numeric)::integer
  end;
  if v_limit is null then
    return new;
  end if;

  -- كل صف يشغل مقعداً: فعّال + دعوة معلّقة + موقوف.
  select count(*) into v_used
    from public.teacher_members
   where teacher_id = new.teacher_id;

  if v_used >= v_limit then
    raise exception 'limit_reached:max_team_members';
  end if;
  return new;
end $$;

-- مساعد تريجر فقط — نفس نمط enforce_student_limit في 0062
-- وset_updated_at في 0023.
revoke execute on function public.enforce_team_limit()
  from public, anon, authenticated;

create trigger team_limit_trg
  before insert on public.teacher_members
  for each row execute function public.enforce_team_limit();

commit;

-- ============================================================================
-- نهاية 0064 — دوال: enforce_team_limit | تريجر: team_limit_trg.
-- ترتيب التطبيق بعد 0058 و0059.
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ⚠️ الإنفاذ الخادمي (تريجر الحد) لا يعمل قبل التطبيق؛ فحص العميل
--    المسبق متسامح مع غياب الدوال (يتخطى).
-- ============================================================================
