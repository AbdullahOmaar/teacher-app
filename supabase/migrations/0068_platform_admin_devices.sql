-- ============================================================================
-- 0068 — تنبيهات الأجهزة الجديدة لأدمن المنصة (مهمة 23 — 3A-898)
-- ============================================================================
--
-- • الجدول `platform_admin_devices`: أجهزة أدمن المنصة المعروفة —
--   بصمة SHA-256 لوكيل المستخدم المُطَبَّع (هاش فقط، بلا IP وبلا
--   سلسلة وكيل خام — انظر docs/PLATFORM-ADMIN-DEVICE-ALERTS.md)،
--   وحالة ثقة لكل جهاز. RLS مفعّلة و**بلا أي سياسة عميل إطلاقاً**
--   (نمط `platform_admins` في 0055): الوصول عبر RPCs وحده، والإدارة
--   خادمية عبر service role.
-- • ‏`register_platform_device(p_device_hash, p_label)`: تسجيل جهاز
--   الحالي (upsert على (user_id, device_hash) مع تحديث last_seen_at)
--   ويرجع is_new — أول ظهور للجهاز هو «جهاز جديد».
-- • ‏`list_platform_devices()`: أجهزة الأدمن الحالي (الأحدث أولاً).
-- • ‏`trust_platform_device(p_device_id)` / ‏`revoke_platform_device(p_device_id)`:
--   توثيق جهاز / إلغاؤه (حذف الصف) — الإلغاء لا يُسجّل خروج الجلسات
--   (حدّ موثّق في الوثيقة؛ فصل الجلسات خطوة service-role لاحقة).
-- • كل RPC بحارس `is_platform_admin()` صريح يرفع استثناء لغير الأدمن
--   (نمط RPCs الإدارية في 0066)؛ security definer + search_path
--   مثبّت + يعمل صحيحاً عندما auth.uid() غائب (يرجع رفضاً لا خطأ).
-- • التدقيق (`device_new` / `device_trusted` / `device_revoked`)
--   من العميل عبر `log_platform_audit()` (0066) بنمط best-effort
--   مثل 2FA — لا كتابة تدقيق داخل هذه الـ RPCs عمداً، حتى تبقى 0068
--   مستقلة عن 0066 عند التطبيق.
-- • مثل 0062–0067: كود فقط — لا تُطبَّق على الإنتاج إلا عند تجميد
--   فيز 2 وبوابة QA. قسم authz الحي الخاص بها في scripts/authz_tests.py
--   يتخطى نفسه بتوثيق صريح ما دامت جداولها غائبة.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) جدول أجهزة الأدمن — RLS بلا أي سياسة عميل (نمط 0055)
-- ---------------------------------------------------------------------------
create table public.platform_admin_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_hash text not null,
  label text not null default '',
  trusted boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, device_hash)
);

alter table public.platform_admin_devices enable row level security;

-- لا سياسات إطلاقاً: مع RLS مفعّلة وغياب أي سياسة، كل وصول من أدوار
-- العميل مرفوض — الأجهزة تُدار عبر RPCs أدناه وحدها، والفحص العملي
-- عبر list_platform_devices().
revoke all on public.platform_admin_devices from public, anon, authenticated;
grant all on public.platform_admin_devices to service_role;

create index platform_admin_devices_user_idx
  on public.platform_admin_devices (user_id, last_seen_at desc);

-- ---------------------------------------------------------------------------
-- 2) تسجيل الجهاز الحالي — upsert + تقرير أول ظهور
-- ---------------------------------------------------------------------------
create or replace function public.register_platform_device(
  p_device_hash text,
  p_label text default ''
)
returns table (is_new boolean, device_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_new boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_device_hash is null
    or p_device_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid device hash';
  end if;

  -- ‏DO NOTHING أولاً: الـ RETURNING يرجع الصف عند الإدراج فقط،
  -- فيعرف أولَ ظهور؛ وعند التعارض يُحدَّث last_seen_at باستعلام
  -- منفصل. (لو كان DO UPDATE لرجع RETURNING الصف في الحالتين
  -- وضاع تمييز «جديد».)
  insert into public.platform_admin_devices
    (user_id, device_hash, label)
  values (
    auth.uid(),
    p_device_hash,
    left(coalesce(btrim(p_label), ''), 120)
  )
  on conflict (user_id, device_hash) do nothing
  returning id into v_id;

  if v_id is not null then
    v_new := true;
  else
    update public.platform_admin_devices
    set last_seen_at = now()
    where user_id = auth.uid()
      and device_hash = p_device_hash
    returning id into v_id;
    v_new := false;
  end if;

  return query select v_new, v_id;
end $$;

revoke execute on function public.register_platform_device(text, text)
  from public, anon;
grant execute on function public.register_platform_device(text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3) قائمة أجهزة الأدمن الحالي — الأحدث ظهوراً أولاً
-- ---------------------------------------------------------------------------
create or replace function public.list_platform_devices()
returns table (
  id uuid,
  device_hash text,
  label text,
  trusted boolean,
  first_seen_at timestamptz,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select d.id, d.device_hash, d.label, d.trusted,
         d.first_seen_at, d.last_seen_at
  from public.platform_admin_devices d
  where public.is_platform_admin()
    and d.user_id = auth.uid()
  order by d.last_seen_at desc;
$$;

revoke execute on function public.list_platform_devices()
  from public, anon;
grant execute on function public.list_platform_devices()
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4) توثيق جهاز — يخصّ الأدمن نفسه فقط
-- ---------------------------------------------------------------------------
create or replace function public.trust_platform_device(p_device_id uuid)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  update public.platform_admin_devices
  set trusted = true
  where id = p_device_id
    and user_id = auth.uid()
    and public.is_platform_admin()
  returning true;
$$;

revoke execute on function public.trust_platform_device(uuid)
  from public, anon;
grant execute on function public.trust_platform_device(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5) إلغاء جهاز — حذف الصف؛ لا يفصل الجلسات (انظر الوثيقة)
-- ---------------------------------------------------------------------------
create or replace function public.revoke_platform_device(p_device_id uuid)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  delete from public.platform_admin_devices
  where id = p_device_id
    and user_id = auth.uid()
    and public.is_platform_admin()
  returning true;
$$;

revoke execute on function public.revoke_platform_device(uuid)
  from public, anon;
grant execute on function public.revoke_platform_device(uuid)
  to authenticated;

commit;
