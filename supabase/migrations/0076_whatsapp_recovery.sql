-- ============================================================================
-- 0076 — استرداد كلمة السر برمز واتساب على قناة المنصة (Phase 2 — 3A-927)
-- ----------------------------------------------------------------------------
-- قرار المالك 2026-11-27 ~23:08: واتساب يكون جاهزاً في الكود بالكامل قبل
-- تجميد فيز 2 (التفعيل بعد الإطلاق إعدادات ومفاتيح بس). الاسترداد الحالي
-- إيميل فقط (3A-904) — هذه المهاجرة تبني طبقة البيانات لمسار استرداد
-- واتساب جديد، وقرار المدير الحاكم للقناة: **قناة المنصة** (المستخدم
-- المقفول بره حسابه قد لا تملك قناة مدرّسه وجوداً/عملاً — فالإرسال من
-- رقم المنصة بأصول Meta في أسرار المشروع، لا بحلّ قناة مدرس 0026).
--
-- ما تبنيه المهاجرة:
-- ١) جدول `whatsapp_recovery_codes`: أكواد استرداد مجزّأة SHA-256 فقط
--    (لا كود صريح أبداً — قاعدة التوكنات في AGENTS.md)، بصلاحية ومحاولات
--    ومصير استهلاك. لا عمود teacher_id: الرقم هو الهوية هنا، والصف يُكتب
--    ويُقرأ من دالة Edge بالـ service role حصراً.
--    RLS مفعّلة **بلا أي سياسة**: anon/authenticated ممنوعان كلياً
--    (قراءة وكتابة) — لذلك لا تنطبق قاعدة سياسات المالك/العضو (لا بيانات
--    مدرس هنا أصلاً؛ الجدول سجلّ أمني خادمي صرف — سابقة البيت: جدول
--    خنق 0024 «بلا سياسات: الوصول عبر دوال security definer فقط»).
-- ٢) `find_auth_user_id_by_phone_internal(text)`: بحث خادمي عن معرّف
--    مستخدم Auth برقمه (مقارنة بالأرقام فقط — GoTrue يخزّن الهاتف بلا
--    «+»). security definer + search_path مثبّت + التنفيذ لـ
--    service_role وحده ومسحوب من الكل — نفس نمط
--    ‏resolve_whatsapp_channel_internal (0026) الموثّق: المستدعي الشرعي
--    الوحيد دالة Edge بالـ service role وauth.uid() غائب هناك بتصميم،
--    وبوابة التنفيذ هي الحارس.
-- ٣) `increment_recovery_attempts_internal(uuid)`: زيادة ذرّية لعدّاد
--    محاولات كود (عدّاد أمني — الزيادة من العميل/الدالة بقراءة-ثم-كتابة
--    كانت ستفتح نافذة سباق تُضعف سقف المحاولات). service_role فقط.
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): مهاجرة كود فقط — لا
-- تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 + بوابة QA. العميل
-- والدالة يتحمّلان غيابها (الدالة غير منشورة والعلم مطفي أصلاً).
-- ترتيب التطبيق بعد 0069 (لا تعتمد على أي مهاجرة بعينها — مستقلة).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) جدول أكواد الاسترداد — خادمي فقط
-- ---------------------------------------------------------------------------
create table public.whatsapp_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index whatsapp_recovery_codes_phone_idx
  on public.whatsapp_recovery_codes (phone, created_at desc);

alter table public.whatsapp_recovery_codes enable row level security;

-- لا سياسات إطلاقاً: anon وauthenticated ممنوعان من أي وصول عبر
-- PostgREST؛ الـ service role يتجاوز RLS بتصميم المنصة وهو المسار الوحيد.

-- ---------------------------------------------------------------------------
-- 2) بحث مستخدم Auth بالهاتف — service_role فقط
-- ---------------------------------------------------------------------------
create or replace function public.find_auth_user_id_by_phone_internal(p_phone text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select u.id
    from auth.users u
   where u.phone is not null
     and u.phone <> ''
     and regexp_replace(u.phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
   limit 1;
$$;

revoke all on function public.find_auth_user_id_by_phone_internal(text) from public;
grant execute on function public.find_auth_user_id_by_phone_internal(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3) زيادة ذرّية لعدّاد محاولات كود استرداد — service_role فقط
-- ---------------------------------------------------------------------------
create or replace function public.increment_recovery_attempts_internal(p_code_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.whatsapp_recovery_codes
     set attempts = attempts + 1
   where id = p_code_id
  returning attempts;
$$;

revoke all on function public.increment_recovery_attempts_internal(uuid) from public;
grant execute on function public.increment_recovery_attempts_internal(uuid) to service_role;

commit;

-- ============================================================================
-- نهاية 0076 — جدول أكواد خادمي + دالتا بحث/عدّاد داخليتان.
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ============================================================================
