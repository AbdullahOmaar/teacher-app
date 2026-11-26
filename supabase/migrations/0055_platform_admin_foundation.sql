-- ============================================================================
-- 0055 — أساس أدمن المنصة (Phase 2 T17 — 3A-892، الخطوة 1 من خطة الأدمن)
-- ----------------------------------------------------------------------------
-- توجيه مالك ١: «أدمن المنصة» نوع مستخدم مستقل تماماً عن المدرس/المركز،
-- له لوحته الخاصة ومحبوس تماماً بره شاشات المدرس. هذه المهاجرة تبني
-- الأساس القاعدي وحده — لا لوحة ولا باقات هنا (خطوات لاحقة في الخطة):
--
-- • الجدول `platform_admins`: قائمة حسابات الأدمن (المصدر الوحيد للحقيقة
--   — قرار واعٍ بدل Custom Claim في الـJWT: الجدول قابل للتدقيق والمنح
--   والسحب فورياً بلا انتظار انتهاء جلسة، والادعاء يبقى خياراً لاحقاً
--   فوقه إن احتاجته الواجهة). RLS مفعّلة و**بلا أي سياسة عميل إطلاقاً**:
--   لا أحد يقرأ القائمة أو يعدّلها من جلسة متصفح — الإدارة حصراً عبر
--   service role / SQL مباشر (إجراء البذرة موثق في
--   docs/PLATFORM-ADMIN-FOUNDATION.md)، والفحص من العميل عبر RPC
--   ‏`my_platform_admin` وحده.
-- • الدالة `is_platform_admin()`: ‏security definer بـ search_path مثبّت،
--   ترجع false بطبيعتها عندما auth.uid() غائب (زائر/anon) — أساس كل
--   سياسات المنصة اللاحقة كما is_teacher_owner أساس سياسات المدرس.
-- • العمود `teachers.account_activated`: علم تفعيل الحساب لآلية البايلوت
--   (قرار مدير 2026-11-26: المنصة الحقيقية نفسها، حساب البايلوت مفعّل
--   وحده). الافتراضي هنا **true** عمداً: كل الحسابات الحية والقائمة
--   تبقى شغالة كما هي (صفر تغيير سلوكي) — قلب الافتراضي لغير المفعّل
--   وقفل التسجيل وقائمة السماح هي الخطوة 2، ولا إنفاذ لهذا العلم في
--   أي مسار بعد في هذه المهاجرة.
-- • الجدول `platform_audit_log`: سجل تدقيق المنصة — append-only بنمط
--   activity_log القائم (0009) لكن بنطاق المنصة وفاعل أدمن: القراءة
--   للأدمن فقط، والإدراج للأدمن باسمه هو فقط (admin_user_id = auth.uid()
--   قسراً)، ولا سياسات UPDATE/DELETE إطلاقاً. ‏target_teacher_id بلا
--   cascade (set null): حذف حساب مدرس لا يمحو أثر أفعال المنصة عليه.
-- • الـ RPC ‏`platform_overview()`: تجميعات قراءة فقط (عدّ المدرسين/
--   المفعّلين/الطلاب) بحارس أدمن صريح يرفع استثناء لغير الأدمن — هذا
--   هو السطح الوحيد الذي يرى به الأدمن المنصة: **أرقام تجميعية، لا
--   صفوف مدرس تشغيلية أبداً**؛ سياسات جداول المدرس لا تُمسّ هنا، فلا
--   يكتسب الأدمن أي وصول لبيانات سنتر بعينه.
--
-- شرط التفعيل المرافق (خارج الكود — خطوة مالك/مدير عند البذرة الأولى):
-- التحقق بخطوتين TOTP لأدمن المنصة مفعّلاً ومفروضاً في إعدادات
-- Supabase Auth قبل منح أول حساب — انظر وثيقة الأساس.
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): هذه المهاجرة تُراجع وتُدمج
-- في الكود فقط — لا تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 وبعد
-- بوابة QA. قسم authz الحي الخاص بها في scripts/authz_tests.py يتخطى
-- نفسه بتوثيق صريح ما دامت جداولها غائبة.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) جدول حسابات أدمن المنصة — RLS بلا أي سياسة عميل
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- لا سياسات إطلاقاً: مع RLS مفعّلة وغياب أي سياسة، كل وصول من أدوار
-- العميل مرفوض — القائمة سرّية حتى عن الأدمن نفسه من المتصفح (يُديرها
-- service role وحده)، والفحص العملي عبر my_platform_admin() أدناه.
revoke all on public.platform_admins from public, anon, authenticated;
grant all on public.platform_admins to service_role;

-- ---------------------------------------------------------------------------
-- 2) دالة الفحص is_platform_admin() + RPC فحص الذات my_platform_admin()
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = auth.uid()
  );
$$;

-- الفحص من القاعدة (RLS/الدوال) للجلسات المصادقة فقط — anon لا يحتاجها
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- فحص الذات من العميل: هل حسابي أدمن منصة؟ (الجدول بلا سياسة قراءة،
-- فهذه هي الطريقة الوحيدة المشروعة لتعرف الواجهة نوع مستخدمها)
create or replace function public.my_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.is_platform_admin();
$$;

revoke execute on function public.my_platform_admin() from public, anon;
grant execute on function public.my_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) علم تفعيل الحساب — افتراضي true (لا كسر لأي حساب قائم؛ الخطوة 2
--    تبني القفل وقائمة السماح والإنفاذ فوقه)
-- ---------------------------------------------------------------------------
alter table public.teachers
  add column account_activated boolean not null default true;

-- ---------------------------------------------------------------------------
-- 4) سجل تدقيق المنصة — append-only، قراءة/إدراج للأدمن فقط
-- ---------------------------------------------------------------------------
create table public.platform_audit_log (
  id               uuid primary key default gen_random_uuid(),
  admin_user_id    uuid references auth.users (id) on delete set null,
  action           text not null,
  target_teacher_id uuid references public.teachers (id) on delete set null,
  details          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index platform_audit_log_created_idx
  on public.platform_audit_log (created_at desc);

alter table public.platform_audit_log enable row level security;

-- القراءة لأدمن المنصة فقط
create policy platform_audit_admin_select on public.platform_audit_log
  for select using (public.is_platform_admin());

-- الإدراج للأدمن فقط وباسمه هو قسراً — لا تزوير فعل باسم أدمن آخر
create policy platform_audit_admin_insert on public.platform_audit_log
  for insert with check (
    admin_user_id = auth.uid() and public.is_platform_admin()
  );

-- لا سياسات UPDATE/DELETE إطلاقاً: السجل غير قابل للتعديل أو الحذف
-- من أي جلسة عميل — التنظيف الإداري بصلاحيات الخادم فقط.
revoke all on public.platform_audit_log from public, anon, authenticated;
grant select, insert on public.platform_audit_log to authenticated;
grant all on public.platform_audit_log to service_role;

-- ---------------------------------------------------------------------------
-- 5) RPC نظرة المنصة العامة — تجميعات فقط بحارس أدمن صريح
-- ---------------------------------------------------------------------------
create or replace function public.platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  -- الحارس يعمل أيضاً عند غياب الجلسة: is_platform_admin() ترجع false
  -- بلا auth.uid() فيُرفض الزائر والمدرس على السواء.
  if not public.is_platform_admin() then
    raise exception 'platform admin only';
  end if;

  return jsonb_build_object(
    'teachers_total', (select count(*) from public.teachers),
    'teachers_activated',
      (select count(*) from public.teachers where account_activated),
    'students_total', (select count(*) from public.students)
  );
end $$;

revoke execute on function public.platform_overview() from public, anon;
grant execute on function public.platform_overview() to authenticated;

commit;

-- ============================================================================
-- نهاية 0055 — جداول جديدة: platform_admins + platform_audit_log |
-- عمود جديد: teachers.account_activated | دوال: is_platform_admin /
-- my_platform_admin / platform_overview.
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ============================================================================
