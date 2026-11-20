-- ============================================================================
-- تطبيق المدرس — 0001_init.sql
-- مسودة migration ابتدائية لـ Supabase / PostgreSQL
-- التصميم المرافق: DATABASE-DESIGN.md
--
-- مبادئ: Multi-tenant بـ teacher_id + RLS من اليوم الأول، كل المعرفات UUID،
-- الأرصدة محسوبة عبر views لا مخزنة، المالية محجوبة عن المساعد في RLS،
-- وبوابة ولي الأمر خلف دوال RPC مقيدة (لا وصول مباشر للجداول).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;  -- gen_random_uuid(), digest()

-- ----------------------------------------------------------------------------
-- Stub لـ auth.uid() / auth.users عند التشغيل على PostgreSQL خام للتجربة.
-- على Supabase الحقيقي موجودان أصلاً فلا يُنشأ شيء.
-- ----------------------------------------------------------------------------
create schema if not exists auth;

do $$
begin
  if to_regclass('auth.users') is null then
    create table auth.users (id uuid primary key);
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    create function auth.uid() returns uuid
      language sql stable as $f$ select null::uuid $f$;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type billing_type as enum (
  'monthly_fixed',        -- شهري ثابت
  'per_session_prepaid',  -- بالحصة (مدفوعة مسبقاً)
  'per_session_attended', -- بالحصة (حسب الحضور)
  'weekly_package'        -- باقة أسبوعية
);

create type attendance_status as enum ('p', 'a', 'l', 'm');
-- p حاضر / a غائب / l متأخر / m تعويضية — الحضور الفعلي = p,l,m

create type session_kind as enum ('regular', 'extra', 'moved');
create type session_status as enum ('scheduled', 'cancelled');

create type payment_method as enum (
  'cash',           -- كاش
  'vodafone_cash',  -- فودافون كاش
  'instapay',       -- إنستاباي
  'bank_transfer'   -- تحويل بنكي
);

create type invoice_line_type as enum ('base', 'discount', 'adjustment');

create type assessment_type as enum ('exam', 'homework');
create type question_type as enum ('mcq', 'essay');

create type member_role as enum ('owner', 'assistant');
create type member_status as enum ('invited', 'active', 'suspended');

-- ----------------------------------------------------------------------------
-- دوال مساعدة عامة
-- ----------------------------------------------------------------------------

-- تحديث updated_at تلقائياً
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- توليد كود طالب عشوائي غير تسلسلي (8 أحرف بلا أحرف ملتبسة: لا 0/O ولا 1/I/L)
create or replace function public.generate_public_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end $$;

commit;

begin;

-- ============================================================================
-- الهوية والأدوار والإعدادات
-- ============================================================================

-- بروفايل المدرس — الصف يُنشأ عند تسجيل المدرس (id = حساب Auth نفسه)
create table public.teachers (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url   text,
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- عضويات الفريق (المساعدون) وصلاحياتهم
create table public.teacher_members (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        member_role not null default 'assistant',
  permissions jsonb not null default '{}'::jsonb,
  -- مفاتيح مقترحة: can_take_attendance, can_manage_students,
  -- can_manage_groups, can_manage_grades, can_view_money (محفوظة مستقبلاً)
  status      member_status not null default 'invited',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (teacher_id, user_id)
);
create index teacher_members_user_idx on public.teacher_members (user_id);

-- إعدادات المدرس (صف واحد لكل مدرس) — تحتوي نسبة السنتر فهي مالية الحساسية
create table public.teacher_settings (
  teacher_id           uuid primary key references public.teachers (id) on delete cascade,
  whatsapp_template    text not null default 'أهلاً {guardian}، إيصال الطالب {name} عن {period}: المدفوع {paid} من {total}، والمتبقي {balance}. شكراً لك.',
  center_share_percent numeric(5,2) not null default 0 check (center_share_percent between 0 and 100),
  reminder_minutes     int not null default 0 check (reminder_minutes in (0, 15, 30, 60)),
  theme                text not null default 'auto' check (theme in ('auto', 'light', 'dark')),
  last_export_at       timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- المصروفات الشهرية الثابتة (كانت settings.recurringExp[])
create table public.recurring_expenses (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  category   text not null check (category in ('إيجار قاعات', 'طباعة وتصوير', 'رواتب مساعدين', 'أدوات', 'أخرى')),
  amount     numeric(12,2) not null check (amount > 0),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recurring_expenses_teacher_idx on public.recurring_expenses (teacher_id);

-- ============================================================================
-- المجموعات والطلاب والتسجيلات
-- ============================================================================

create table public.groups (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.teachers (id) on delete cascade,
  name             text not null,
  billing_type     billing_type not null default 'monthly_fixed',
  price            numeric(12,2) not null default 0 check (price >= 0),
  days             smallint[] not null default '{}',
  start_time       time not null,
  duration_minutes int not null default 60 check (duration_minutes > 0),
  room             text,
  capacity         int check (capacity is null or capacity > 0),  -- null = بلا حد
  assistant_name   text,
  links            text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (days <@ array[0,1,2,3,4,5,6]::smallint[])
);
create index groups_teacher_idx on public.groups (teacher_id);

-- قائمة الانتظار (كانت group.waitlist[] نصية يتيمة بلا واجهة)
create table public.group_waitlist (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  group_id   uuid not null references public.groups (id) on delete cascade,
  name       text not null,
  phone      text,
  note       text,
  created_at timestamptz not null default now()
);
create index group_waitlist_group_idx on public.group_waitlist (group_id);
create index group_waitlist_teacher_idx on public.group_waitlist (teacher_id);

create table public.students (
  id             uuid primary key default gen_random_uuid(),
  teacher_id     uuid not null references public.teachers (id) on delete cascade,
  public_code    text not null default '',  -- يُملأ بالـ trigger إن تُرك فارغاً
  name           text not null,
  grade          text,
  school         text,
  paused         boolean not null default false,
  phone          text,
  guardian_name  text,
  guardian_phone text,
  level_note     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (teacher_id, public_code)
);
create index students_teacher_idx on public.students (teacher_id);
create index students_guardian_phone_idx on public.students (teacher_id, guardian_phone);

-- تعبئة public_code تلقائياً مع إعادة المحاولة عند التصادم
create or replace function public.students_set_public_code()
returns trigger
language plpgsql
as $$
declare
  candidate text;
begin
  if new.public_code is null or new.public_code = '' then
    loop
      candidate := public.generate_public_code();
      exit when not exists (
        select 1 from public.students
        where teacher_id = new.teacher_id and public_code = candidate
      );
    end loop;
    new.public_code := candidate;
  end if;
  return new;
end $$;

create trigger students_public_code_trg
  before insert on public.students
  for each row execute function public.students_set_public_code();

-- ملاحظات الطالب (كانت students[].notes[])
create table public.student_notes (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  note_date  date not null default current_date,
  text       text not null,
  created_at timestamptz not null default now()
);
create index student_notes_student_idx on public.student_notes (student_id);
create index student_notes_teacher_idx on public.student_notes (teacher_id);

-- تسجيل طالب في مجموعة — السعر الخاص والباقة يعيشان هنا لا على الطالب
create table public.enrollments (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.teachers (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  group_id         uuid not null references public.groups (id) on delete cascade,
  price_override   numeric(12,2) check (price_override is null or price_override >= 0),
  prepaid_sessions int check (prepaid_sessions is null or prepaid_sessions >= 0),
  created_at       timestamptz not null default now(),
  unique (student_id, group_id)
);
create index enrollments_group_idx on public.enrollments (group_id);
create index enrollments_student_idx on public.enrollments (student_id);
create index enrollments_teacher_idx on public.enrollments (teacher_id);

-- الإجازات الرسمية (كانت holidays[])
create table public.holidays (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  holiday_date date not null,
  name         text,
  created_at   timestamptz not null default now(),
  unique (teacher_id, holiday_date)
);

commit;

begin;

-- ============================================================================
-- الحصص والحضور
-- ============================================================================

-- حصص فعلية: regular تُولّد من جدول المجموعة، extra إضافية، moved منقولة
create table public.sessions (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references public.teachers (id) on delete cascade,
  group_id          uuid not null references public.groups (id) on delete cascade,
  session_date      date not null,
  start_time        time not null,
  duration_minutes  int not null default 60 check (duration_minutes > 0),
  kind              session_kind not null default 'regular',
  status            session_status not null default 'scheduled',
  origin_session_id uuid references public.sessions (id) on delete set null,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- منع تكرار توليد الحصة المنتظمة لنفس المجموعة واليوم
create unique index sessions_regular_unique
  on public.sessions (group_id, session_date) where kind = 'regular';
create index sessions_group_date_idx on public.sessions (group_id, session_date);
create index sessions_teacher_date_idx on public.sessions (teacher_id, session_date);

-- توليد حصص شهر كامل لمجموعة من أيامها — آمن التكرار (on conflict do nothing)،
-- وحصة يوم الإجازة تُنشأ بحالة cancelled لا تُتخطى.
create or replace function public.generate_group_sessions(
  p_teacher_id uuid,
  p_group_id   uuid,
  p_month      date  -- أي يوم داخل الشهر المطلوب
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  d date;
  month_start date := date_trunc('month', p_month)::date;
  month_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  created int := 0;
begin
  -- حراسة: المستدعي (إن وُجد) يجب أن يكون المالك أو عضواً نشطاً عند هذا المدرس
  if auth.uid() is not null
     and auth.uid() <> p_teacher_id
     and not exists (
       select 1 from public.teacher_members
       where teacher_id = p_teacher_id and user_id = auth.uid() and status = 'active'
     ) then
    raise exception 'not authorized';
  end if;

  select * into g from public.groups
  where id = p_group_id and teacher_id = p_teacher_id;
  if not found then
    raise exception 'group % not found for teacher %', p_group_id, p_teacher_id;
  end if;

  d := month_start;
  while d <= month_end loop
    if extract(dow from d)::int = any (g.days) then
      insert into public.sessions
        (teacher_id, group_id, session_date, start_time, duration_minutes, kind, status)
      values
        (p_teacher_id, p_group_id, d, g.start_time, g.duration_minutes, 'regular',
         case when exists (
           select 1 from public.holidays h
           where h.teacher_id = p_teacher_id and h.holiday_date = d
         ) then 'cancelled'::session_status else 'scheduled'::session_status end)
      on conflict do nothing;
      if found then created := created + 1; end if;
    end if;
    d := d + 1;
  end loop;
  return created;
end $$;

-- الحضور: صف واحد لكل (حصة، طالب) يجمع الحالة + الواجب + التمييز
-- (كانت ثلاث خرائط منفصلة: att{} و homework{} و rating{})
create table public.attendance (
  teacher_id    uuid not null references public.teachers (id) on delete cascade,
  session_id    uuid not null references public.sessions (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  status        attendance_status,  -- null = لم يُسجّل بعد
  homework_done boolean not null default false,
  starred       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (session_id, student_id),
  check (status is not null or homework_done or starred)
);
create index attendance_student_idx on public.attendance (student_id);
create index attendance_teacher_idx on public.attendance (teacher_id);

-- ============================================================================
-- المالية: فواتير وبنود ودفعات ومصروفات
-- ============================================================================

create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  student_id   uuid not null references public.students (id) on delete restrict,
  group_id     uuid not null references public.groups (id) on delete restrict,
  period_month date not null,  -- أول يوم في الشهر
  created_at   timestamptz not null default now(),
  check (period_month = date_trunc('month', period_month)::date),
  unique (teacher_id, student_id, group_id, period_month)  -- منع فاتورة مكررة
);
create index invoices_student_idx on public.invoices (student_id);
create index invoices_teacher_period_idx on public.invoices (teacher_id, period_month);

create table public.invoice_lines (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  line_type  invoice_line_type not null default 'base',
  description text not null,
  amount     numeric(12,2) not null,  -- قد يكون سالباً (خصم / تسوية)
  reason     text,  -- سبب الخصم أو التسوية
  created_at timestamptz not null default now()
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);
create index invoice_lines_teacher_idx on public.invoice_lines (teacher_id);

-- عدّادات أرقام الإيصالات — إصلاح لعيب اشتقاق الرقم من عدد الدفعات (كان يتكرر)
create table public.receipt_counters (
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  counter_year int not null,
  last_number  int not null default 0,
  primary key (teacher_id, counter_year)
);

-- الرقم التالي للإيصال بصيغة YYYY-NNNN — زيادة ذرّية بلا تصادم
create or replace function public.next_receipt_no(p_teacher_id uuid, p_date date default current_date)
returns text
language plpgsql
volatile
as $$
declare
  y int := extract(year from p_date)::int;
  n int;
begin
  insert into public.receipt_counters (teacher_id, counter_year, last_number)
  values (p_teacher_id, y, 1)
  on conflict (teacher_id, counter_year)
  do update set last_number = public.receipt_counters.last_number + 1
  returning last_number into n;
  return y::text || '-' || lpad(n::text, 4, '0');
end $$;

-- الدفعات دفتر مستقل: لا حذف ولا تعديل — التصحيح بدفعة عكسية سالبة فقط
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  teacher_id          uuid not null references public.teachers (id) on delete cascade,
  invoice_id          uuid not null references public.invoices (id) on delete restrict,
  amount              numeric(12,2) not null check (amount <> 0),  -- سالب = عكس
  method              payment_method not null default 'cash',
  paid_on             date not null default current_date,
  receipt_no          text not null,
  reverses_payment_id uuid references public.payments (id) on delete restrict,
  voided              boolean not null default false,  -- على الأصلية بعد عكسها
  created_at          timestamptz not null default now(),
  unique (teacher_id, receipt_no)
);
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_teacher_idx on public.payments (teacher_id);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  expense_date date not null default current_date,
  category     text not null check (category in ('إيجار قاعات', 'طباعة وتصوير', 'رواتب مساعدين', 'أدوات', 'أخرى')),
  amount       numeric(12,2) not null check (amount > 0),
  note         text,
  created_at   timestamptz not null default now()
);
create index expenses_teacher_date_idx on public.expenses (teacher_id, expense_date);

-- ============================================================================
-- التقييم والدرجات
-- ============================================================================

create table public.assessments (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  group_id    uuid not null references public.groups (id) on delete cascade,
  title       text not null,
  type        assessment_type not null default 'exam',
  assess_date date not null default current_date,
  max_score   numeric(8,2) not null check (max_score > 0),
  pass_score  numeric(8,2) not null default 0 check (pass_score >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index assessments_group_idx on public.assessments (group_id);
create index assessments_teacher_idx on public.assessments (teacher_id);

create table public.assessment_questions (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.teachers (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  position      int not null default 0,
  type          question_type not null default 'mcq',
  text          text not null,
  options       jsonb,  -- حتى 4 اختيارات للـ MCQ
  correct_answer text,
  points        numeric(8,2) not null default 0 check (points >= 0),
  created_at    timestamptz not null default now()
);
create index assessment_questions_assessment_idx
  on public.assessment_questions (assessment_id, position);

-- الدرجات: غياب الصف = لا درجة مسجلة (كانت scores{} خرائط)
create table public.scores (
  teacher_id    uuid not null references public.teachers (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  score         numeric(8,2) not null check (score >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (assessment_id, student_id)
);
create index scores_student_idx on public.scores (student_id);
create index scores_teacher_idx on public.scores (teacher_id);

-- ============================================================================
-- وصول ولي الأمر
-- ============================================================================

create table public.guardians (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,  -- حساب OTP عند تسجيله
  display_name text not null default '',
  phone        text not null,  -- الرقم المُتحقق منه — أساس الربط
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (teacher_id, phone)
);
create index guardians_user_idx on public.guardians (user_id);

create table public.guardian_students (
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  guardian_id  uuid not null references public.guardians (id) on delete cascade,
  student_id   uuid not null references public.students (id) on delete cascade,
  relationship text,
  created_at   timestamptz not null default now(),
  primary key (guardian_id, student_id)
);
create index guardian_students_student_idx on public.guardian_students (student_id);
create index guardian_students_teacher_idx on public.guardian_students (teacher_id);

-- روابط وصول موقّعة: القاعدة تخزن هاش الرمز فقط
create table public.guardian_access_tokens (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  guardian_id  uuid not null references public.guardians (id) on delete cascade,
  student_id   uuid references public.students (id) on delete cascade,  -- null = كل أولاد ولي الأمر
  token_hash   text not null unique,  -- SHA-256 hex للرمز العشوائي
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
create index guardian_tokens_guardian_idx on public.guardian_access_tokens (guardian_id);
create index guardian_tokens_teacher_idx on public.guardian_access_tokens (teacher_id);

commit;

begin;

-- ============================================================================
-- triggers: updated_at
-- ============================================================================
create trigger teachers_updated_trg before update on public.teachers
  for each row execute function public.set_updated_at();
create trigger teacher_members_updated_trg before update on public.teacher_members
  for each row execute function public.set_updated_at();
create trigger teacher_settings_updated_trg before update on public.teacher_settings
  for each row execute function public.set_updated_at();
create trigger recurring_expenses_updated_trg before update on public.recurring_expenses
  for each row execute function public.set_updated_at();
create trigger groups_updated_trg before update on public.groups
  for each row execute function public.set_updated_at();
create trigger students_updated_trg before update on public.students
  for each row execute function public.set_updated_at();
create trigger sessions_updated_trg before update on public.sessions
  for each row execute function public.set_updated_at();
create trigger attendance_updated_trg before update on public.attendance
  for each row execute function public.set_updated_at();
create trigger assessments_updated_trg before update on public.assessments
  for each row execute function public.set_updated_at();
create trigger scores_updated_trg before update on public.scores
  for each row execute function public.set_updated_at();
create trigger guardians_updated_trg before update on public.guardians
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Views — الأرصدة والنسب محسوبة دائماً، لا مخزنة أبداً
-- security_invoker: تعمل بصلاحيات المستعلِم فتنطبق RLS الجداول الأصلية
-- ============================================================================

create view public.invoice_balances with (security_invoker = true) as
select
  i.id as invoice_id,
  i.teacher_id,
  i.student_id,
  i.group_id,
  i.period_month,
  coalesce(l.total, 0) as total,
  coalesce(p.paid, 0) as paid,
  coalesce(l.total, 0) - coalesce(p.paid, 0) as balance,
  (coalesce(l.total, 0) - coalesce(p.paid, 0)) <= 0 as is_paid
from public.invoices i
left join (
  select invoice_id, sum(amount) as total
  from public.invoice_lines group by invoice_id
) l on l.invoice_id = i.id
left join (
  select invoice_id, sum(amount) as paid
  from public.payments group by invoice_id
) p on p.invoice_id = i.id;

create view public.student_balances with (security_invoker = true) as
select teacher_id, student_id, sum(balance) as balance
from public.invoice_balances
group by teacher_id, student_id;

create view public.student_attendance_stats with (security_invoker = true) as
select
  a.teacher_id,
  a.student_id,
  count(*) filter (where a.status is not null) as marked_sessions,
  count(*) filter (where a.status in ('p', 'l', 'm')) as attended_sessions,
  round(
    100.0 * count(*) filter (where a.status in ('p', 'l', 'm'))
    / nullif(count(*) filter (where a.status is not null), 0)
  , 1) as attendance_rate
from public.attendance a
group by a.teacher_id, a.student_id;

create view public.monthly_profit with (security_invoker = true) as
with months as (
  select teacher_id, date_trunc('month', paid_on)::date as month from public.payments
  union
  select teacher_id, date_trunc('month', expense_date)::date as month from public.expenses
),
collected as (
  select teacher_id, date_trunc('month', paid_on)::date as month, sum(amount) as collected
  from public.payments group by 1, 2
),
spent as (
  select teacher_id, date_trunc('month', expense_date)::date as month, sum(amount) as expenses
  from public.expenses group by 1, 2
)
select
  m.teacher_id,
  m.month,
  coalesce(c.collected, 0) as collected,
  coalesce(e.expenses, 0) as expenses,
  coalesce(c.collected, 0) * coalesce(ts.center_share_percent, 0) / 100 as center_share_amount,
  coalesce(c.collected, 0)
    - coalesce(e.expenses, 0)
    - coalesce(c.collected, 0) * coalesce(ts.center_share_percent, 0) / 100 as net_profit
from months m
left join collected c on c.teacher_id = m.teacher_id and c.month = m.month
left join spent e on e.teacher_id = m.teacher_id and e.month = m.month
left join public.teacher_settings ts on ts.teacher_id = m.teacher_id;

commit;

begin;

-- ============================================================================
-- RLS — دوال مساعدة
-- security definer لتقرأ teacher_members دون الوقوع في تكرار سياساتها
-- ============================================================================
create or replace function public.is_teacher_owner(p_teacher_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select auth.uid() = p_teacher_id $$;

create or replace function public.is_teacher_member(p_teacher_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.teacher_members
    where teacher_id = p_teacher_id
      and user_id = auth.uid()
      and status = 'active'
  ) $$;

create or replace function public.member_has_permission(p_teacher_id uuid, p_perm text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.teacher_members
    where teacher_id = p_teacher_id
      and user_id = auth.uid()
      and status = 'active'
      and coalesce(permissions ->> p_perm, 'false') = 'true'
  ) $$;

-- ============================================================================
-- RLS — تفعيل على كل الجداول
-- ============================================================================
alter table public.teachers enable row level security;
alter table public.teacher_members enable row level security;
alter table public.teacher_settings enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.groups enable row level security;
alter table public.group_waitlist enable row level security;
alter table public.students enable row level security;
alter table public.student_notes enable row level security;
alter table public.enrollments enable row level security;
alter table public.holidays enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.receipt_counters enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.scores enable row level security;
alter table public.guardians enable row level security;
alter table public.guardian_students enable row level security;
alter table public.guardian_access_tokens enable row level security;

-- ============================================================================
-- RLS — السياسات
-- القاعدة: المالك (teacher_id = auth.uid()) كامل الصلاحية على بياناته.
-- المساعد: جداول تشغيلية فقط وبصلاحيات صريحة، والمالية مغلقة تماماً.
-- ولي الأمر: لا سياسة على أي جدول أعمال — الوصول عبر RPC فقط (أسفل).
-- ============================================================================

-- teachers: كل مدرس يرى ويعدّل بروفايله فقط
create policy teachers_self_select on public.teachers
  for select using (id = auth.uid());
create policy teachers_self_insert on public.teachers
  for insert with check (id = auth.uid());
create policy teachers_self_update on public.teachers
  for update using (id = auth.uid()) with check (id = auth.uid());

-- teacher_members: المالك يدير عضوياته، والعضو يرى صفّه
create policy members_owner_all on public.teacher_members
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy members_self_select on public.teacher_members
  for select using (user_id = auth.uid());

-- teacher_settings: المالك فقط (تحتوي نسبة السنتر)
create policy settings_owner_all on public.teacher_settings
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- recurring_expenses + expenses: مالية — المالك فقط
create policy recurring_expenses_owner_all on public.recurring_expenses
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy expenses_owner_all on public.expenses
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- الجداول المالية: المالك فقط — لا سياسة للمساعد إطلاقاً
create policy invoices_owner_all on public.invoices
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy invoice_lines_owner_all on public.invoice_lines
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy payments_owner_all on public.payments
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy receipt_counters_owner_all on public.receipt_counters
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- المجموعات وقائمة الانتظار: مالك + مساعد بصلاحية can_manage_groups
create policy groups_owner_all on public.groups
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy groups_assistant_all on public.groups
  for all using (public.member_has_permission(teacher_id, 'can_manage_groups'))
  with check (public.member_has_permission(teacher_id, 'can_manage_groups'));
create policy waitlist_owner_all on public.group_waitlist
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy waitlist_assistant_all on public.group_waitlist
  for all using (public.member_has_permission(teacher_id, 'can_manage_groups'))
  with check (public.member_has_permission(teacher_id, 'can_manage_groups'));

-- الطلاب وملاحظاتهم وتسجيلاتهم: مالك + مساعد بصلاحية can_manage_students
create policy students_owner_all on public.students
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy students_assistant_all on public.students
  for all using (public.member_has_permission(teacher_id, 'can_manage_students'))
  with check (public.member_has_permission(teacher_id, 'can_manage_students'));
create policy student_notes_owner_all on public.student_notes
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy student_notes_assistant_all on public.student_notes
  for all using (public.member_has_permission(teacher_id, 'can_manage_students'))
  with check (public.member_has_permission(teacher_id, 'can_manage_students'));
create policy enrollments_owner_all on public.enrollments
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy enrollments_assistant_all on public.enrollments
  for all using (public.member_has_permission(teacher_id, 'can_manage_students'))
  with check (public.member_has_permission(teacher_id, 'can_manage_students'));

-- الإجازات والحصص والحضور: مالك + مساعد بصلاحية can_take_attendance
create policy holidays_owner_all on public.holidays
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy holidays_assistant_all on public.holidays
  for all using (public.member_has_permission(teacher_id, 'can_take_attendance'))
  with check (public.member_has_permission(teacher_id, 'can_take_attendance'));
create policy sessions_owner_all on public.sessions
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy sessions_assistant_all on public.sessions
  for all using (public.member_has_permission(teacher_id, 'can_take_attendance'))
  with check (public.member_has_permission(teacher_id, 'can_take_attendance'));
create policy attendance_owner_all on public.attendance
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy attendance_assistant_all on public.attendance
  for all using (public.member_has_permission(teacher_id, 'can_take_attendance'))
  with check (public.member_has_permission(teacher_id, 'can_take_attendance'));

-- التقييم والأسئلة والدرجات: مالك + مساعد بصلاحية can_manage_grades
create policy assessments_owner_all on public.assessments
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy assessments_assistant_all on public.assessments
  for all using (public.member_has_permission(teacher_id, 'can_manage_grades'))
  with check (public.member_has_permission(teacher_id, 'can_manage_grades'));
create policy questions_owner_all on public.assessment_questions
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy questions_assistant_all on public.assessment_questions
  for all using (public.member_has_permission(teacher_id, 'can_manage_grades'))
  with check (public.member_has_permission(teacher_id, 'can_manage_grades'));
create policy scores_owner_all on public.scores
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy scores_assistant_all on public.scores
  for all using (public.member_has_permission(teacher_id, 'can_manage_grades'))
  with check (public.member_has_permission(teacher_id, 'can_manage_grades'));

-- أولياء الأمور وروابطهم ورموزهم: المالك يدير بيانات مدرسته،
-- وولي الأمر يرى صفّه هو فقط (بيانات أولاده تأتيه عبر RPC لا من هنا)
create policy guardians_owner_all on public.guardians
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy guardians_self_select on public.guardians
  for select using (user_id = auth.uid());
create policy guardian_students_owner_all on public.guardian_students
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy guardian_tokens_owner_all on public.guardian_access_tokens
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

commit;

begin;

-- ============================================================================
-- بوابة ولي الأمر — دوال RPC مقيّدة الحقول (security definer)
-- لا توجد أي سياسة RLS لولي الأمر على جداول الأعمال؛ كل وصوله من هنا.
-- ============================================================================

-- بانٍ داخلي لعرض البوابة: يُستدعى فقط من نقطتي الدخول المُتحقق منهما أدناه
create or replace function public.portal_build_overview(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  select * into s from public.students where id = p_student_id;
  if not found then
    raise exception 'student not found';
  end if;

  return jsonb_build_object(
    'student', jsonb_build_object(
      'name', s.name,
      'code', s.public_code,
      'grade', s.grade
    ),
    'attendance_rate', (
      select attendance_rate from public.student_attendance_stats
      where student_id = s.id
    ),
    'balance', coalesce((
      select balance from public.student_balances where student_id = s.id
    ), 0),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', g.name,
        'days', g.days,
        'start_time', g.start_time,
        'room', g.room,
        'links', g.links
      ) order by g.name)
      from public.enrollments e
      join public.groups g on g.id = e.group_id
      where e.student_id = s.id
    ), '[]'::jsonb),
    'latest_scores', coalesce((
      select jsonb_agg(t order by t.assess_date desc)
      from (
        select jsonb_build_object(
          'title', a.title,
          'date', a.assess_date,
          'score', sc.score,
          'max_score', a.max_score
        ) as t, a.assess_date
        from public.scores sc
        join public.assessments a on a.id = sc.assessment_id
        where sc.student_id = s.id
        order by a.assess_date desc
        limit 10
      ) x
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('date', n.note_date, 'text', n.text)
                        order by n.note_date desc)
      from public.student_notes n
      where n.student_id = s.id
    ), '[]'::jsonb),
    'recent_attendance', coalesce((
      select jsonb_agg(t order by t.session_date desc)
      from (
        select jsonb_build_object(
          'date', se.session_date,
          'group_name', g.name,
          'status', at.status
        ) as t, se.session_date
        from public.attendance at
        join public.sessions se on se.id = at.session_id
        join public.groups g on g.id = se.group_id
        where at.student_id = s.id and at.status is not null
        order by se.session_date desc
        limit 10
      ) x
    ), '[]'::jsonb)
  );
end $$;

-- الدخول الأساسي: حساب ولي أمر مسجل (OTP على الموبايل) ومرتبط بالطالب
create or replace function public.portal_student_overview(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.guardian_students gs
    join public.guardians g on g.id = gs.guardian_id
    where gs.student_id = p_student_id
      and g.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;
  return public.portal_build_overview(p_student_id);
end $$;

-- الدخول الخفيف: رابط موقّع — يطابق هاش الرمز، يتحقق من الصلاحية وعدم الإلغاء،
-- ومن أن الطالب من أولاد صاحب الرابط، ويسجّل آخر استخدام
create or replace function public.portal_overview_by_token(p_token text, p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tok record;
begin
  select * into tok
  from public.guardian_access_tokens
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'invalid or expired token';
  end if;

  if tok.student_id is not null and tok.student_id <> p_student_id then
    raise exception 'token not valid for this student';
  end if;

  if not exists (
    select 1 from public.guardian_students gs
    where gs.guardian_id = tok.guardian_id
      and gs.student_id = p_student_id
  ) then
    raise exception 'not authorized';
  end if;

  update public.guardian_access_tokens
  set last_used_at = now()
  where id = tok.id;

  return public.portal_build_overview(p_student_id);
end $$;

-- إلغاء صلاحية البانٍ الداخلي من الاستدعاء المباشر العام:
-- على Supabase تُضبط صلاحيات التنفيذ (grant/revoke) عند النشر حسب الحاجة.
revoke execute on function public.portal_build_overview(uuid) from public;

commit;

-- ============================================================================
-- نهاية 0001_init — الجداول: 23 | الـ views: 4 | سياسات RLS: 38
-- ============================================================================
