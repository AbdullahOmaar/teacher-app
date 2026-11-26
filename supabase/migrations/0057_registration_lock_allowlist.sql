-- ============================================================================
-- 0057 — قفل التسجيل + قائمة السماح (Phase 2 T17 — 3A-892، الخطوة 2 من خطة الأدمن)
-- ----------------------------------------------------------------------------
-- توجيه مالك ١ + قرار مدير 2026-11-26 (المنصة الحقيقية نفسها — حساب
-- البايلوت مفعّل وحده، بلا نسخة منفصلة): هذه المهاجرة تبني أداتي
-- «الإرسال لمدرس واحد بس» — قفل التسجيل العام وقائمة سماح — فوق أساس
-- 0055، وبلا أي تغيير سلوكي حي عند دمجها (انظر «الوضع الافتراضي»):
--
-- • الجدول `platform_settings`: مفاتيح المنصة كبيانات (قيمة jsonb).
--   البذرة الوحيدة هنا `registration_open = true` — التسجيل يبقى
--   مفتوحاً كما هو اليوم؛ القلب إلى false قرار صريح لاحق (إجراء
--   البايلوت موثق في docs/PLATFORM-ADMIN-ALLOWLIST.md). RLS: قراءة
--   للأدمن فقط عبر is_platform_admin()، ولا سياسة UPDATE للعميل —
--   التغيير حصراً service role / SQL مباشر حتى تبني لوحة الأدمن
--   واجهتها في الخطوة 7.
-- • الجدول `teacher_allowlist`: صف لكل مدرس مسموح (بريد و/أو هاتف —
--   CHECK: واحد منهما على الأقل). المقارنة v1 مطابقة حرفية بعد
--   القصّ، والبريد بلا حساسية حالة؛ التطبيع الأوسع (أرقام الهواتف
--   بصيغ مختلفة) خارج النطاق عمداً ويُوثَّق كقيد. فهارس فريدة جزئية
--   على lower(btrim(email)) وعلى btrim(phone) تمنع التكرار. RLS:
--   قراءة/إدراج/حذف للأدمن فقط (is_platform_admin()) — لا سياسات
--   عميل أخرى إطلاقاً.
-- • الدالة `can_self_register(p_email, p_phone)`: البوابة — ترجع true
--   عندما registration_open مفتوح، وإلا true فقط عند مطابقة صف
--   سماح (بريد أو هاتف). ‏security definer بـ search_path مثبّت،
--   وتُنفَّذ لـ anon أيضاً: العميل يستدعيها **قبل** signUp، أي بلا
--   جلسة أصلاً. الثمن الموثّق: الـ RPC يصبح أوراكل عضوية (بريد/هاتف
--   مسموح أم لا) — مقبول هنا لأن «مسجّل أصلاً» أوراكل قائم بنفس
--   الدرجة في مسار التسجيل، والرد بوليان فقط بلا أي بيانات صف.
-- • الدالة `create_teacher_profile_for_self(p_display_name, p_phone)`:
--   **نقطة الإنفاذ الحقيقية** — إنشاء ملف المدرس + إعداداته عبر RPC
--   ‏security definer بدل إدراج العميل المباشر: تتحقق من البوابة
--   ببريد JWT نفسه (لا معاملات خارجية للهوية) قبل أي إدراج، وترفع
--   'registration closed' عند الرفض. آمنة التكرار: صف قائم يُرجع
--   كما هو بلا بوابة (حساب قائم لا يُقفل عليه بأثر رجعي). الحساب
--   الجديد عبرها يولد `account_activated = false` (قرار البايلوت:
--   التفعيل فعل أدمن لاحق موثّق في platform_audit_log) — وذلك
--   **داخل الـ RPC فقط لا بتغيير افتراضي العمود**، حتى لا تتأثر
--   مسارات الإنشاء الأخرى (بذرة الديمو، إنشاء السنتر الإضافي).
--
-- ⚠️ حدود صريحة (صدق تصميمي — لا تُقرأ هذه المهاجرة كقفل كامل):
-- 1) تسجيل Supabase Auth نفسه (GoTrue signUp) لا تمنعه RLS ولا
--    هذه المهاجرة: أي بريد يقدر ينشئ **حساب Auth** حتى مع القفل.
--    ما يُقفل فعلاً هو تحوّله إلى **ملف مدرس شغّال**: البوابة ترفض
--    قبل signUp في الواجهة، وRPC الإنشاء يرفض خادمياً بعده،
--    والجلسة بلا ملف مدرس تبقى على شاشة «كمّل إعداد حسابك» بلا
--    أي بيانات. إغلاق GoTrue نفسه خيار لاحق (تعطيل التسجيل من
--    إعدادات Auth عند Meta/Supabase) لا يُتخذ هنا.
-- 2) مطابقة الهاتف تعتمد الرقم المكتوب وقت التسجيل (ادّعاء قبل
--    التحقق)؛ المرساة التحققية هي البريد: تأكيد البريد يثبت ملكية
--    البريد المطابِق. مطابقة هاتف بعد التحقق منه (ربط الهاتف
--    المؤكد) تحسين لاحق لا يغيّر عقد هذه المهاجرة.
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): مهاجرة كود فقط — لا
-- تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 + بوابة QA. العميل
-- يتحمّل غياب دوالها (رجوع للمسار القديم المفتوح) حتى البوابة —
-- انظر src/features/auth/api.ts. قسم authz الحي الخاص بها في
-- scripts/authz_tests.py يتخطى نفسه بتوثيق صريح ما دامت غائبة.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) مفاتيح المنصة — بذرة registration_open = true (لا تغيير سلوكي)
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

-- القراءة لأدمن المنصة فقط — لا سياسة UPDATE/DELETE للعميل إطلاقاً:
-- التغيير service role / SQL مباشر حتى واجهة لوحة الأدمن (الخطوة 7).
create policy platform_settings_admin_select on public.platform_settings
  for select using (public.is_platform_admin());

revoke all on public.platform_settings from public, anon, authenticated;
grant select on public.platform_settings to authenticated;
grant all on public.platform_settings to service_role;

insert into public.platform_settings (key, value)
values ('registration_open', 'true'::jsonb);

-- ---------------------------------------------------------------------------
-- 2) قائمة السماح — بريد و/أو هاتف، مطابقة مقصوصة (البريد بلا حالة)
-- ---------------------------------------------------------------------------
create table public.teacher_allowlist (
  id         uuid primary key default gen_random_uuid(),
  email      text,
  phone      text,
  note       text,
  added_by   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint teacher_allowlist_contact_check
    check (email is not null or phone is not null)
);

-- فهارس فريدة جزئية على الصيغة المطبّعة نفسها التي تقارن بها البوابة
create unique index teacher_allowlist_email_idx
  on public.teacher_allowlist (lower(btrim(email)))
  where email is not null;
create unique index teacher_allowlist_phone_idx
  on public.teacher_allowlist (btrim(phone))
  where phone is not null;

alter table public.teacher_allowlist enable row level security;

-- إدارة القائمة للأدمن فقط — قراءة/إدراج/حذف بلا أي وصول عميل آخر
create policy teacher_allowlist_admin_select on public.teacher_allowlist
  for select using (public.is_platform_admin());
create policy teacher_allowlist_admin_insert on public.teacher_allowlist
  for insert with check (public.is_platform_admin());
create policy teacher_allowlist_admin_delete on public.teacher_allowlist
  for delete using (public.is_platform_admin());

-- لا سياسة UPDATE: تعديل صف سماح = حذف + إدراج جديد (أثر تدقيقي أنظف).
revoke all on public.teacher_allowlist from public, anon, authenticated;
grant select, insert, delete on public.teacher_allowlist to authenticated;
grant all on public.teacher_allowlist to service_role;

-- ---------------------------------------------------------------------------
-- 3) البوابة can_self_register — تُستدعى قبل signUp (بلا جلسة: anon)
-- ---------------------------------------------------------------------------
create or replace function public.can_self_register(p_email text, p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    -- مفتوح: أي بريد/هاتف مسموح
    coalesce(
      (select (value)::text = 'true'
         from public.platform_settings
        where key = 'registration_open'),
      true
    )
    -- مقفول: مطابقة صف سماح بالبريد (بلا حالة) أو بالهاتف (مقصوص)
    or exists (
      select 1 from public.teacher_allowlist a
      where (p_email is not null and p_email <> ''
             and a.email is not null
             and lower(btrim(a.email)) = lower(btrim(p_email)))
         or (p_phone is not null and p_phone <> ''
             and a.phone is not null
             and btrim(a.phone) = btrim(p_phone))
    );
$$;

-- قبل التسجيل لا جلسة: anon يحتاجها — الرد بوليان فقط (انظر الترويسة).
revoke execute on function public.can_self_register(text, text) from public;
grant execute on function public.can_self_register(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) نقطة الإنفاذ: إنشاء ملف المدرس عبر RPC ببوابة ببريد JWT نفسه
-- ---------------------------------------------------------------------------
create or replace function public.create_teacher_profile_for_self(
  p_display_name text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_phone text := btrim(coalesce(
    p_phone,
    auth.jwt() -> 'user_metadata' ->> 'phone',
    ''
  ));
  v_row   public.teachers;
begin
  -- الحارس يعمل أيضاً عند غياب الجلسة: auth.uid() null يرفع فوراً.
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- صف قائم: آمنة التكرار — يُرجع كما هو بلا بوابة (لا قفل بأثر رجعي).
  select * into v_row from public.teachers where id = v_uid;
  if found then
    return jsonb_build_object(
      'id', v_row.id,
      'owner_user_id', v_row.owner_user_id,
      'display_name', v_row.display_name,
      'avatar_url', v_row.avatar_url,
      'phone', v_row.phone,
      'account_activated', v_row.account_activated,
      'created_at', v_row.created_at,
      'updated_at', v_row.updated_at
    );
  end if;

  -- البوابة ببريد الجلسة نفسه (لا نثق بمعامل هوية خارجي) + الهاتف
  -- المكتوب وقت التسجيل (انظر حد (2) في الترويسة).
  if not public.can_self_register(v_email, v_phone) then
    raise exception 'registration closed';
  end if;

  -- ملف المدرس الجديد: غير مفعّل حتى يفعّله الأدمن (قرار البايلوت) —
  -- داخل الـ RPC فقط، افتراضي العمود يبقى true لمسارات الإنشاء الأخرى.
  insert into public.teachers
    (id, owner_user_id, display_name, phone, account_activated)
  values
    (v_uid, v_uid, btrim(coalesce(p_display_name, '')), nullif(v_phone, ''), false)
  returning * into v_row;

  -- صف الإعدادات الافتراضي: بقية الأعمدة defaults في المخطط (نفس
  -- عقد الـ onboarding في src/features/auth/api.ts حرفياً).
  insert into public.teacher_settings (teacher_id)
  values (v_uid)
  on conflict (teacher_id) do nothing;

  return jsonb_build_object(
    'id', v_row.id,
    'owner_user_id', v_row.owner_user_id,
    'display_name', v_row.display_name,
    'avatar_url', v_row.avatar_url,
    'phone', v_row.phone,
    'account_activated', v_row.account_activated,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end $$;

-- الإنشاء للمصادقين فقط — anon لا يملك جلسة أصلاً فيُرفض بحارسه.
revoke execute on function public.create_teacher_profile_for_self(text, text) from public, anon;
grant execute on function public.create_teacher_profile_for_self(text, text) to authenticated;

commit;

-- ============================================================================
-- نهاية 0057 — جداول جديدة: platform_settings + teacher_allowlist |
-- دوال: can_self_register / create_teacher_profile_for_self.
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ترتيب التطبيق بعد 0055 (تعتمد is_platform_admin()).
-- ============================================================================
