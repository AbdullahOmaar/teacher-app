-- ===========================================================================
-- 0040 — حسابات دخول البوابات الحقيقية (3A-385 — ج من التصميم): الطالب
-- وولي الأمر يبقى عندهم حساب ببيانات دخول، لا رابط توكن فقط.
--
-- • portal_accounts: حساب واحد لكل ولي أمر عند المدرس (guardian_id —
--   يفتح كل أبنائه المرتبطين في guardian_students، كنموذج تحقق رابط
--   ولي الأمر نفسه) وحساب واحد لكل طالب (student_id). اسم الدخول
--   يُشتق خادمياً (هاتف ولي الأمر المطبّع / كود الطالب العام) فلا
--   انتحال. كلمة السر bcrypt عبر pgcrypto ولا تُخزن ولا تُقرأ إلا
--   داخل دوال 0041 — العميل لا يختار عمود password_hash أبداً.
-- • portal_sessions: جلسات الدخول — التوكن الخام عشوائي 32 بايت يولّد
--   خادمياً وقت الدخول ويُخزن SHA-256 hash فقط (نمط جداول التوكنات)،
--   بصلاحية 90 يوماً وإبطال صريح. إبطال/تعطيل الحساب يوقف جلساته في
--   طبقة التحقق (0042) فوراً.
-- • RLS: المالك فقط عبر is_teacher_owner (أسرار وصول — كنموذج
--   guardian_access_tokens/student_access_tokens؛ المساعد لا يراها)،
--   وبلا أي سياسة لـ anon: كل وصول الجمهور عبر RPC بـ security
--   definer في 0041/0042 حصراً.
-- ===========================================================================

create table public.portal_accounts (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references public.teachers (id) on delete cascade,
  student_id      uuid references public.students (id) on delete cascade,
  guardian_id     uuid references public.guardians (id) on delete cascade,
  role            text not null check (role in ('guardian', 'student')),
  username        text not null,
  password_hash   text not null,
  is_active       boolean not null default true,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint portal_accounts_role_shape check (
    (role = 'guardian' and guardian_id is not null and student_id is null)
    or (role = 'student' and student_id is not null and guardian_id is null)
  ),
  unique (teacher_id, username)
);

create index portal_accounts_username_idx on public.portal_accounts (username);
create index portal_accounts_teacher_idx on public.portal_accounts (teacher_id);
create index portal_accounts_student_idx on public.portal_accounts (student_id);
create index portal_accounts_guardian_idx on public.portal_accounts (guardian_id);

create table public.portal_sessions (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.portal_accounts (id) on delete cascade,
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);

create index portal_sessions_account_idx on public.portal_sessions (account_id);
create index portal_sessions_teacher_idx on public.portal_sessions (teacher_id);

alter table public.portal_accounts enable row level security;

alter table public.portal_sessions enable row level security;

create policy portal_accounts_owner_all on public.portal_accounts
  for all
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));

create policy portal_sessions_owner_all on public.portal_sessions
  for all
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
