-- ============================================================================
-- 0051 — العمق المالي للسنتر: دفتر المشتريات والمبيعات (Phase 2 T10 — 3A-714)
-- ----------------------------------------------------------------------------
-- الجرد (موثق في docs/PHASE2-T10-FINANCE.md): المالية الحالية تغطي الفواتير
-- الدراسية ودفعاتها والمصروفات العامة والإغلاق اليومي للخزنة، لكن لا يوجد:
-- • دفتر مشتريات: موردون + بنود شراء + مستحقات موردين (payables) ومدفوعاتها.
-- • دفتر مبيعات: إيراد غير دراسي (كتب/ملازم/أدوات تُباع للطلاب أو غيرهم).
-- • تقرير شهري موحّد يجمع الدراسي والمبيعات والمشتريات والمصروفات.
-- هذه المهاجرة تسد الثلاثة فوق البنية الحالية دون لمس أي جدول قائم:
--
-- • المالية للمالك فقط: كل السياسات عبر is_teacher_owner — لا سياسة للمساعد
--   إطلاقاً (مطابقاً لقاعدة AGENTS.md: البيانات المالية owner-only في RLS)،
--   ومنح صريحة لكل جدول جديد (قاعدة ما بعد Data API 2026 / ما بعد 0046).
-- • الإنشاء الذرّي (رأس + بنود) عبر RPCs ‏security definer بـ search_path
--   مثبّت + حارس auth.uid() + is_teacher_owner — نمط 0048/0049 حرفياً.
-- • مدفوعات الموردين دفتر: إدخال واختيار فقط (لا تحديث/حذف عبر السياسات) —
--   التصحيح بقيد سالب (amount <> 0) مطابقاً لفلسفة payments في 0001.
-- • الأرصدة Views بـ security_invoker = true (نمط invoice_balances):
--   الإجمالي مشتق من البنود دائماً، لا يُخزّن — فلا انحراف بين رأس وبنود.
-- • الجداول الجديدة تُضاف لقائمة delete_my_teacher_account (قاعدة 0046)،
--   ومعها guardian_notification_deliveries من 0050 — لأن ترتيب التطبيق
--   الرقمي يضمن وجودها قبل 0051 عند بوابة التجميد.
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): هذه المهاجرة تُراجع وتُدمج
-- في الكود فقط — لا تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 وبعد
-- بوابة QA. قسم authz الحي الخاص بها مكتوب كاملاً في scripts/authz_tests.py
-- ويتخطى نفسه بتوثيق صريح ما دامت الجداول غائبة.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) الموردون
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) > 0),
  phone      text,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index suppliers_teacher_idx on public.suppliers (teacher_id, name);

create trigger suppliers_updated_trg before update on public.suppliers
  for each row execute function public.set_updated_at();

alter table public.suppliers enable row level security;

create policy suppliers_owner_all on public.suppliers
  for all using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));

revoke all on public.suppliers from public, anon, authenticated;
grant select, insert, update, delete on public.suppliers to authenticated;
grant all on public.suppliers to service_role;

-- ---------------------------------------------------------------------------
-- 2) المشتريات (رأس) + بنودها + مدفوعات الموردين
-- ---------------------------------------------------------------------------
create table public.purchases (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.teachers (id) on delete cascade,
  supplier_id   uuid references public.suppliers (id) on delete restrict,
  purchase_date date not null default current_date,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index purchases_teacher_date_idx
  on public.purchases (teacher_id, purchase_date desc);
create index purchases_supplier_idx on public.purchases (supplier_id);

create trigger purchases_updated_trg before update on public.purchases
  for each row execute function public.set_updated_at();

alter table public.purchases enable row level security;

create policy purchases_owner_all on public.purchases
  for all using (public.is_teacher_owner(teacher_id))
  with check (
    public.is_teacher_owner(teacher_id)
    and (supplier_id is null or exists (
      select 1 from public.suppliers s
      where s.id = supplier_id and s.teacher_id = purchases.teacher_id))
  );

revoke all on public.purchases from public, anon, authenticated;
grant select, insert, update, delete on public.purchases to authenticated;
grant all on public.purchases to service_role;

create table public.purchase_lines (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  description text not null check (char_length(btrim(description)) > 0),
  quantity    numeric(10,2) not null check (quantity > 0),
  unit_price  numeric(12,2) not null check (unit_price >= 0),
  created_at  timestamptz not null default now()
);
create index purchase_lines_purchase_idx on public.purchase_lines (purchase_id);
create index purchase_lines_teacher_idx on public.purchase_lines (teacher_id);

alter table public.purchase_lines enable row level security;

create policy purchase_lines_owner_all on public.purchase_lines
  for all using (public.is_teacher_owner(teacher_id))
  with check (
    public.is_teacher_owner(teacher_id)
    and exists (
      select 1 from public.purchases p
      where p.id = purchase_id and p.teacher_id = purchase_lines.teacher_id)
  );

revoke all on public.purchase_lines from public, anon, authenticated;
grant select, insert, update, delete on public.purchase_lines to authenticated;
grant all on public.purchase_lines to service_role;

-- مدفوعات الموردين: دفتر — إدخال واختيار فقط، التصحيح بقيد سالب.
create table public.purchase_payments (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  purchase_id uuid not null references public.purchases (id) on delete restrict,
  amount      numeric(12,2) not null check (amount <> 0),
  method      payment_method not null default 'cash',
  paid_on     date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);
create index purchase_payments_purchase_idx
  on public.purchase_payments (purchase_id);
create index purchase_payments_teacher_idx
  on public.purchase_payments (teacher_id, paid_on);

alter table public.purchase_payments enable row level security;

create policy purchase_payments_owner_select on public.purchase_payments
  for select using (public.is_teacher_owner(teacher_id));

create policy purchase_payments_owner_insert on public.purchase_payments
  for insert with check (
    public.is_teacher_owner(teacher_id)
    and exists (
      select 1 from public.purchases p
      where p.id = purchase_id and p.teacher_id = purchase_payments.teacher_id)
  );

revoke all on public.purchase_payments from public, anon, authenticated;
grant select, insert on public.purchase_payments to authenticated;
grant all on public.purchase_payments to service_role;

-- ---------------------------------------------------------------------------
-- 3) المبيعات (رأس) + بنودها — إيراد غير دراسي
-- ---------------------------------------------------------------------------
create table public.sales (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  student_id  uuid references public.students (id) on delete restrict,
  buyer_name  text,
  sale_date   date not null default current_date,
  -- المحصّل فعلياً عند البيع؛ الباقي مستحق على المشتري (يظهر في sale_balances)
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index sales_teacher_date_idx on public.sales (teacher_id, sale_date desc);
create index sales_student_idx on public.sales (student_id);

create trigger sales_updated_trg before update on public.sales
  for each row execute function public.set_updated_at();

alter table public.sales enable row level security;

create policy sales_owner_all on public.sales
  for all using (public.is_teacher_owner(teacher_id))
  with check (
    public.is_teacher_owner(teacher_id)
    and (student_id is null or exists (
      select 1 from public.students st
      where st.id = student_id and st.teacher_id = sales.teacher_id))
  );

revoke all on public.sales from public, anon, authenticated;
grant select, insert, update, delete on public.sales to authenticated;
grant all on public.sales to service_role;

create table public.sale_lines (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  sale_id     uuid not null references public.sales (id) on delete cascade,
  description text not null check (char_length(btrim(description)) > 0),
  quantity    numeric(10,2) not null check (quantity > 0),
  unit_price  numeric(12,2) not null check (unit_price >= 0),
  created_at  timestamptz not null default now()
);
create index sale_lines_sale_idx on public.sale_lines (sale_id);
create index sale_lines_teacher_idx on public.sale_lines (teacher_id);

alter table public.sale_lines enable row level security;

create policy sale_lines_owner_all on public.sale_lines
  for all using (public.is_teacher_owner(teacher_id))
  with check (
    public.is_teacher_owner(teacher_id)
    and exists (
      select 1 from public.sales s
      where s.id = sale_id and s.teacher_id = sale_lines.teacher_id)
  );

revoke all on public.sale_lines from public, anon, authenticated;
grant select, insert, update, delete on public.sale_lines to authenticated;
grant all on public.sale_lines to service_role;

-- ---------------------------------------------------------------------------
-- 4) Views الأرصدة والمستحقات (security_invoker — تحترم RLS الجداول)
-- ---------------------------------------------------------------------------
create view public.purchase_balances with (security_invoker = true) as
select
  p.id as purchase_id,
  p.teacher_id,
  p.supplier_id,
  p.purchase_date,
  coalesce(sum(pl.quantity * pl.unit_price), 0) as total,
  coalesce((
    select sum(pp.amount) from public.purchase_payments pp
    where pp.purchase_id = p.id), 0) as paid,
  coalesce(sum(pl.quantity * pl.unit_price), 0)
    - coalesce((
      select sum(pp.amount) from public.purchase_payments pp
      where pp.purchase_id = p.id), 0) as remaining
from public.purchases p
left join public.purchase_lines pl on pl.purchase_id = p.id
group by p.id, p.teacher_id, p.supplier_id, p.purchase_date;

create view public.sale_balances with (security_invoker = true) as
select
  s.id as sale_id,
  s.teacher_id,
  s.student_id,
  s.sale_date,
  coalesce(sum(sl.quantity * sl.unit_price), 0) as total,
  s.amount_paid as paid,
  coalesce(sum(sl.quantity * sl.unit_price), 0) - s.amount_paid as remaining
from public.sales s
left join public.sale_lines sl on sl.sale_id = s.id
group by s.id, s.teacher_id, s.student_id, s.sale_date, s.amount_paid;

-- مستحقات الموردين مجمعة (صف supplier_id = null يعني «بدون مورد مسجل»)
create view public.supplier_payables with (security_invoker = true) as
select
  pb.teacher_id,
  pb.supplier_id,
  count(*) as purchases_count,
  sum(pb.total) as total,
  sum(pb.paid) as paid,
  sum(pb.remaining) as remaining
from public.purchase_balances pb
group by pb.teacher_id, pb.supplier_id;

-- التقرير الشهري الموحّد للسنتر: أساس نقدي للمحصّل/المدفوع، واستحقاقي
-- لإجماليات المشتريات/المبيعات — التفرقة موثقة في دراسة المهمة §3.
create view public.monthly_centre_finance with (security_invoker = true) as
with months as (
  select teacher_id, date_trunc('month', paid_on)::date as month from public.payments
  union
  select teacher_id, date_trunc('month', expense_date)::date as month from public.expenses
  union
  select teacher_id, date_trunc('month', paid_on)::date as month from public.purchase_payments
  union
  select teacher_id, date_trunc('month', sale_date)::date as month from public.sales
  union
  select teacher_id, date_trunc('month', purchase_date)::date as month from public.purchases
),
tuition as (
  select teacher_id, date_trunc('month', paid_on)::date as month,
         sum(amount) as collected
  from public.payments group by 1, 2
),
exp as (
  select teacher_id, date_trunc('month', expense_date)::date as month,
         sum(amount) as expenses
  from public.expenses group by 1, 2
),
ppaid as (
  select teacher_id, date_trunc('month', paid_on)::date as month,
         sum(amount) as purchases_paid
  from public.purchase_payments group by 1, 2
),
ptot as (
  select p.teacher_id, date_trunc('month', p.purchase_date)::date as month,
         sum(pl.quantity * pl.unit_price) as purchases_total
  from public.purchases p
  join public.purchase_lines pl on pl.purchase_id = p.id
  group by 1, 2
),
stot as (
  select s.teacher_id, date_trunc('month', s.sale_date)::date as month,
         sum(sl.quantity * sl.unit_price) as sales_total,
         sum(s.amount_paid) as sales_collected
  from public.sales s
  join public.sale_lines sl on sl.sale_id = s.id
  group by 1, 2
)
select
  m.teacher_id,
  m.month,
  coalesce(t.collected, 0) as tuition_collected,
  coalesce(st.sales_total, 0) as sales_total,
  coalesce(st.sales_collected, 0) as sales_collected,
  coalesce(pt.purchases_total, 0) as purchases_total,
  coalesce(pp.purchases_paid, 0) as purchases_paid,
  coalesce(e.expenses, 0) as expenses,
  coalesce(t.collected, 0) + coalesce(st.sales_collected, 0)
    - coalesce(pp.purchases_paid, 0) - coalesce(e.expenses, 0) as net_cash
from months m
left join tuition t on t.teacher_id = m.teacher_id and t.month = m.month
left join exp e on e.teacher_id = m.teacher_id and e.month = m.month
left join ppaid pp on pp.teacher_id = m.teacher_id and pp.month = m.month
left join ptot pt on pt.teacher_id = m.teacher_id and pt.month = m.month
left join stot st on st.teacher_id = m.teacher_id and st.month = m.month;

revoke all on public.purchase_balances from public, anon;
revoke all on public.sale_balances from public, anon;
revoke all on public.supplier_payables from public, anon;
revoke all on public.monthly_centre_finance from public, anon;
grant select on public.purchase_balances to authenticated;
grant select on public.sale_balances to authenticated;
grant select on public.supplier_payables to authenticated;
grant select on public.monthly_centre_finance to authenticated;
grant all on public.purchase_balances to service_role;
grant all on public.sale_balances to service_role;
grant all on public.supplier_payables to service_role;
grant all on public.monthly_centre_finance to service_role;

-- ---------------------------------------------------------------------------
-- 5) RPC الإنشاء الذرّي لعملية شراء (رأس + بنود في معاملة واحدة)
-- ---------------------------------------------------------------------------
create or replace function public.create_purchase(
  p_teacher_id uuid,
  p_supplier_id uuid,
  p_purchase_date date,
  p_note text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_purchase public.purchases;
  v_line jsonb;
  v_total numeric(12,2) := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_teacher_owner(p_teacher_id) then
    raise exception 'only the centre owner can record purchases';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'purchase needs at least one line';
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers s
    where s.id = p_supplier_id and s.teacher_id = p_teacher_id) then
    raise exception 'supplier does not belong to this teacher';
  end if;

  insert into public.purchases (teacher_id, supplier_id, purchase_date, note)
  values (p_teacher_id, p_supplier_id,
          coalesce(p_purchase_date, current_date), p_note)
  returning * into v_purchase;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if coalesce(btrim(v_line ->> 'description'), '') = ''
       or coalesce((v_line ->> 'quantity')::numeric, 0) <= 0
       or coalesce((v_line ->> 'unit_price')::numeric, -1) < 0 then
      raise exception 'invalid purchase line';
    end if;
    insert into public.purchase_lines
      (teacher_id, purchase_id, description, quantity, unit_price)
    values (p_teacher_id, v_purchase.id, btrim(v_line ->> 'description'),
            (v_line ->> 'quantity')::numeric, (v_line ->> 'unit_price')::numeric);
    v_total := v_total
      + (v_line ->> 'quantity')::numeric * (v_line ->> 'unit_price')::numeric;
  end loop;

  return jsonb_build_object(
    'id', v_purchase.id, 'supplier_id', v_purchase.supplier_id,
    'purchase_date', v_purchase.purchase_date, 'total', v_total);
end $$;

revoke execute on function public.create_purchase(uuid, uuid, date, text, jsonb)
  from public, anon;
grant execute on function public.create_purchase(uuid, uuid, date, text, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6) RPC الإنشاء الذرّي لعملية بيع (رأس + بنود في معاملة واحدة)
-- ---------------------------------------------------------------------------
create or replace function public.create_sale(
  p_teacher_id uuid,
  p_student_id uuid,
  p_buyer_name text,
  p_sale_date date,
  p_amount_paid numeric,
  p_note text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sale public.sales;
  v_line jsonb;
  v_total numeric(12,2) := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_teacher_owner(p_teacher_id) then
    raise exception 'only the centre owner can record sales';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'sale needs at least one line';
  end if;
  if p_student_id is not null and not exists (
    select 1 from public.students st
    where st.id = p_student_id and st.teacher_id = p_teacher_id) then
    raise exception 'student does not belong to this teacher';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if coalesce(btrim(v_line ->> 'description'), '') = ''
       or coalesce((v_line ->> 'quantity')::numeric, 0) <= 0
       or coalesce((v_line ->> 'unit_price')::numeric, -1) < 0 then
      raise exception 'invalid sale line';
    end if;
    v_total := v_total
      + (v_line ->> 'quantity')::numeric * (v_line ->> 'unit_price')::numeric;
  end loop;

  if coalesce(p_amount_paid, 0) < 0 or coalesce(p_amount_paid, 0) > v_total then
    raise exception 'amount_paid must be between 0 and the sale total';
  end if;

  insert into public.sales
    (teacher_id, student_id, buyer_name, sale_date, amount_paid, note)
  values (p_teacher_id, p_student_id, btrim(p_buyer_name),
          coalesce(p_sale_date, current_date), coalesce(p_amount_paid, 0), p_note)
  returning * into v_sale;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.sale_lines
      (teacher_id, sale_id, description, quantity, unit_price)
    values (p_teacher_id, v_sale.id, btrim(v_line ->> 'description'),
            (v_line ->> 'quantity')::numeric, (v_line ->> 'unit_price')::numeric);
  end loop;

  return jsonb_build_object(
    'id', v_sale.id, 'student_id', v_sale.student_id,
    'sale_date', v_sale.sale_date, 'total', v_total,
    'amount_paid', v_sale.amount_paid, 'remaining', v_total - v_sale.amount_paid);
end $$;

revoke execute on function public.create_sale(uuid, uuid, text, date, numeric, text, jsonb)
  from public, anon;
grant execute on function public.create_sale(uuid, uuid, text, date, numeric, text, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 7) delete_my_teacher_account: إعادة إنشاء نسخة 0049 + جداول 0050/0051
--    (قاعدة 0046: أي جدول جديد بـ teacher_id يُضاف هنا. ترتيب التطبيق
--    الرقمي يضمن وجود guardian_notification_deliveries من 0050 قبلنا.)
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_teacher_account()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_teacher public.teachers;
  v_email text;
  v_counts jsonb := '{}'::jsonb;
  v_storage_orphaned int := 0;
  v_n bigint;
  v_tables text[] := array[
    'teacher_members', 'teacher_settings', 'recurring_expenses',
    'groups', 'group_waitlist', 'students', 'student_notes',
    'enrollments', 'holidays', 'sessions', 'attendance',
    'invoices', 'invoice_lines', 'receipt_counters', 'payments',
    'expenses', 'assessments', 'assessment_questions', 'scores',
    'guardians', 'guardian_students', 'guardian_access_tokens',
    'daily_closings', 'payment_proofs', 'activity_log',
    'online_exams', 'online_exam_tokens', 'exam_attempts',
    'student_access_tokens', 'guardian_notifications',
    'push_subscriptions', 'push_delivery_log', 'push_digest_log',
    'at_risk_followups', 'enrolment_links', 'teacher_whatsapp_config',
    'portal_accounts', 'portal_sessions', 'teacher_whatsapp_templates',
    'whatsapp_message_log', 'assistant_runs', 'teacher_ai_keys',
    'guardian_notification_deliveries',
    'suppliers', 'purchases', 'purchase_lines', 'purchase_payments',
    'sales', 'sale_lines'
  ];
  v_tbl text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_teacher
  from public.teachers
  where owner_user_id = v_uid;
  if not found then
    raise exception 'no teacher profile';
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email = 'demo@teacher-app.com' then
    raise exception 'demo account cannot be deleted';
  end if;

  select count(*) into v_storage_orphaned
  from storage.objects
  where bucket_id = 'payment-proofs'
    and name like v_teacher.id::text || '/%';

  foreach v_tbl in array v_tables loop
    execute format('select count(*) from public.%I where teacher_id = $1', v_tbl)
      using v_teacher.id into v_n;
    v_counts := v_counts || jsonb_build_object(v_tbl, v_n);
  end loop;

  delete from public.teachers where id = v_teacher.id;

  delete from auth.users where id = v_uid;

  return jsonb_build_object(
    'teacher_id', v_teacher.id,
    'deleted_tables', v_counts,
    'storage_objects_orphaned', v_storage_orphaned
  );
end $$;

revoke execute on function public.delete_my_teacher_account() from public;
revoke execute on function public.delete_my_teacher_account() from anon;
grant execute on function public.delete_my_teacher_account() to authenticated;

commit;

-- ============================================================================
-- نهاية 0051 — جداول جديدة: suppliers, purchases, purchase_lines,
-- purchase_payments, sales, sale_lines | Views: purchase_balances,
-- sale_balances, supplier_payables, monthly_centre_finance |
-- RPCs: create_purchase, create_sale | سياسات RLS: مالك فقط (مالية).
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ============================================================================
