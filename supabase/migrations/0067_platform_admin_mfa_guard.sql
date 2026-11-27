-- ============================================================================
-- 0067 — حارس التحقق بخطوتين لأدمن المنصة (مهمة 23 — TOTP عبر Supabase Auth)
-- ============================================================================
--
-- • `platform_admin_aal2()`: أدمن منصة + جلسة بمستوى ضمان aal2 (تحقق
--   بخطوتين TOTP مكتمل). يقرأ مستوى الضمان من مطالبة JWT نفسها
--   (`auth.jwt() ->> 'aal'`) — لا يعتمد على أي حالة واجهة.
-- • `my_platform_admin_aal2()`: غلاف RPC للفحص من العميل (بوابة /admin).
-- • لا جداول جديدة ولا تغيير في `is_platform_admin()` عمداً: فصل
--   الهوية عن مستوى الضمان يبقي مسار التسجيل (enroll) ممكناً من جلسة
--   aal1 — الأدمن بلا عامل موثّق يسجّل أولاً ثم يتحقق، ولا يُقفل
--   على نفسه خارج اللوحة. التوصيل الكامل (اشتراط aal2 داخل كل RPC
--   إداري) خطوة لاحقة موثقة في docs/PLATFORM-ADMIN-2FA.md — هذه
--   المهاجرة أساسه القابل للاختبار، لا الادعاء باكتماله.
-- • مثل 0062–0066: كود فقط — لا تُطبَّق على الإنتاج إلا عند تجميد
--   فيز 2 وبوابة QA. قسم authz الحي الخاص بها في scripts/authz_tests.py
--   يتخطى نفسه بتوثيق صريح ما دامت الدالة غائبة.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) حارس الهوية + مستوى الضمان — أمان: security definer + search_path مثبّت
--    + يعمل صحيحاً عندما auth.uid() غائب (يرجع false لا خطأ)
-- ---------------------------------------------------------------------------
create or replace function public.platform_admin_aal2()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.is_platform_admin()
    and coalesce((auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

revoke execute on function public.platform_admin_aal2() from public, anon;
grant execute on function public.platform_admin_aal2() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) غلاف RPC للعميل: هل حسابي أدمن منصة بمستوى ضمان aal2؟
-- ---------------------------------------------------------------------------
create or replace function public.my_platform_admin_aal2()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.platform_admin_aal2();
$$;

revoke execute on function public.my_platform_admin_aal2() from public, anon;
grant execute on function public.my_platform_admin_aal2() to authenticated;
