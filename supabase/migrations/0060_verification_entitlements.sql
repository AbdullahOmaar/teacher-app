-- ============================================================================
-- 0060 — مفاتيح استحقاق نظام التأكيد (Phase 2 — 3A-905)
-- ----------------------------------------------------------------------------
-- نظام التأكيد الإلزامي (تصحيح المالك 2026-11-26 17:19): إلزامي عند
-- تفعيله من أدمن المنصة، ومقفول افتراضياً (الدخول المباشر هو الحالة
-- الحية الآن). هذه المهاجرة تبني **طبقة البيانات وحدها** — لا واجهة
-- أدمن هنا (الخطوة 7) ولا إنفاذ (الإنفاذ خادمياً عالمي عبر
-- ‏mailer_autoconfirm، وعلى مستوى الباقة/الحساب بوابة تطبيقية
-- يحدّها RLS — انظر WHATSAPP-VERIFICATION-CHANNEL-PREP.md):
--
-- • المفاتيح الأربعة الجديدة في `account_overrides` (نوع 'feature'،
--   قيمة بوليان — بلا كسر لقاعدة «الخاصية بوليان»):
--     - `verification_required` — التأكيد مطلوب لهذا الحساب
--     - `verification_channel_email` — قناة الإيميل مفعّلة
--     - `verification_channel_whatsapp` — قناة واتساب مفعّلة
--     - `verification_channel_sms` — قناة SMS مفعّلة (خانة فقط؛
--       التوصيل عمل مستقبلي، انظر الوثيقة)
--   «مجموعة القنوات» المفعّلة = اتحاد المفاتيح البوليانية الثلاثة
--   (لا قيمة مصفوفة: نموذج التجاوزات خاصية = بوليان، والعميل
--   يشتق المجموعة في resolveVerificationSettings).
-- • لا حاجة لتغيير `set_account_override` (يتحقق أن الخاصية
--   بوليان عموماً) ولا `effective_entitlements()` (يدمج أي تجاوز
--   خاصية عموماً عبر jsonb_set) — المهاجرة توسّع قيدي المفاتيح
--   في 0059 وحسب. القيدان في 0059 بلا أسماء صريحة (تسمية تلقائية
--   من Postgres) فتُسقطهما كتلة DO بالبحث عن تعريفهما الذي يحوي
--   ‏'whatsapp_auto'، ثم تُعاد إضافتهما بأسماء صريحة.
-- • صفر تغيير سلوكي: بلا تجاوزات جديدة تُدرج هنا؛ كل حساب يبقى
--   على افتراضيه (مطلوب = false، قنوات = فارغة = النظام مقفول).
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): مهاجرة كود فقط — لا
-- تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 + بوابة QA. العميل
-- يتحمّل غياب مفاتيحها (تُقرأ الاستحقاقات بلا تأكيد) حتى البوابة.
-- ترتيب التطبيق بعد 0059 (تعتمد جدول account_overrides).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) إسقاط قيدي مفاتيح 0059 (بلا أسماء صريحة) ثم إعادتهما بالمفاتيح الأربعة
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select conname
      from pg_constraint
     where conrelid = 'public.account_overrides'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%whatsapp_auto%'
  loop
    execute format('alter table public.account_overrides drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.account_overrides
  add constraint account_overrides_key_check_v2
  check (key in (
    'whatsapp_auto', 'ai_assistant', 'team_accounts', 'online_payments',
    'verification_required',
    'verification_channel_email', 'verification_channel_whatsapp',
    'verification_channel_sms',
    'max_students', 'max_messages_month', 'max_storage_mb',
    'max_team_members', 'max_ai_messages_month'));

alter table public.account_overrides
  add constraint account_overrides_kind_key_check_v2
  check ((kind = 'feature' and key in (
            'whatsapp_auto', 'ai_assistant', 'team_accounts',
            'online_payments',
            'verification_required',
            'verification_channel_email', 'verification_channel_whatsapp',
            'verification_channel_sms'))
      or (kind = 'limit' and key in (
            'max_students', 'max_messages_month', 'max_storage_mb',
            'max_team_members', 'max_ai_messages_month')));

commit;

-- ============================================================================
-- نهاية 0060 — قيدا مفاتيح موسّعان فقط؛ بلا جداول ولا دوال جديدة.
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ============================================================================
