-- ============================================================================
-- 0058 — الباقات والاشتراكات كبيانات (Phase 2 T19 — 3A-894، الخطوة 3 من خطة الأدمن)
-- ----------------------------------------------------------------------------
-- مقترح مدير ٦ + ٧ (عُرضا على المالك 2026-11-26): باقات (تجريبي/أساسي/
-- احترافي) بحدود استخدام + فترة تجريبية + ترقية من داخل التطبيق عند
-- لمس حد الباقة. هذه المهاجرة تبني **طبقة البيانات وحدها** — لا إنفاذ
-- حدود هنا (الخطوة 5) ولا زر ترقية ولا بوابة دفع (الدفع قرار مالك ق3):
--
-- • الجدول `plans`: الباقات الأربع (تجريبي/أساسي/احترافي + «طيار»
--   الخاصة) — الحدود jsonb بمفاتيح ثابتة: max_students،
--   max_messages_month، max_storage_mb، max_team_members،
--   max_ai_messages_month؛ null = بلا حد. البذرات سخية عمداً فلا
--   حساب قائم يتأثر: التجريبي 50 طالباً/500 رسالة/500 م.ب/عضو فريق
--   واحد/100 رسالة ذكاء شهرياً؛ الأساسي 200/2000/2048/3/500؛
--   الاحترافي 1000/10000/10240/10/5000؛ «طيار» = حدود الاحترافي
--   نفسها مع علم is_pilot — تُسند لحساب واحد بعينه فقط بفعل أدمن
--   (تجاوز فردي — الخطوة 4)، لا بالتسجيل الذاتي.
-- • ⛔ بلا أسعار إطلاقاً: لا عمود سعر ولا عملة في `plans` — الأسعار
--   قرار تجاري للمالك (م1 في خطة الأدمن) لم يُتخذ بعد؛ من يضيف سعراً
--   لاحقاً بلا قرار مالك موثّق يخرق عقد هذه المهاجرة. «الإيراد
--   المتوقع» في لوحة الأدمن (الخطوة 7) يعرض «—» حتى تُعتمد الأسعار.
-- • الجدول `subscriptions`: حساب ↔ باقة + حالة (active/trial/
--   past_due/cancelled) + trial_ends_at. التعبئة الرجعية داخل
--   المهاجرة: كل مدرس قائم يُربط بالتجريبي بحالة active وبلا نهاية
--   تجربة (on conflict do nothing — آمنة التكرار)؛ صفر تغيير سلوكي.
-- • RLS: قراءة المالك لاشتراكه هو فقط (is_teacher_owner)، وقراءة
--   الأدمن عبر is_platform_admin()؛ **لا سياسات INSERT/UPDATE/
--   DELETE للعميل إطلاقاً** — تغيير الباقة فعل أدمن عبر RPC/خدمة
--   فقط (واجهته في الخطوة 7، وتجاوزاته في الخطوة 4). جدول `plans`
--   للقراءة من الأدمن فقط عبر السياسة نفسها — العميل يرى باقته
--   عبر my_subscription() وحده، لا بقراءة الجدول مباشرة.
-- • الدالتان `my_subscription(p_teacher_id)` و`plan_limits
--   (p_teacher_id)`: ‏security definer بـ search_path مثبّت،
--   وحارسهما مالك مساحة العمل أو أدمن المنصة — ويرفعان 'not
--   authorized' لغيرهما (ومنهم anon بلا auth.uid()). المعامل
--   p_teacher_id صريح لأن المالك قد يملك عدة مساحات (0016) —
--   الدالة بلا معامل كانت ستختار مساحة غامضة. ‏my_subscription
--   ترجع null (لا استثناء) عند غياب الاشتراك حتى تُخفي البطاقة
--   نفسها بأدب؛ plan_limits ترجع limits الباقة أو null.
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): مهاجرة كود فقط — لا
-- تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 + بوابة QA. العميل
-- يتحمّل غياب دوالها (البطاقة تُخفى) حتى البوابة. قسم authz الحي
-- الخاص بها في scripts/authz_tests.py يتخطى نفسه بتوثيق صريح ما
-- دامت جداولها غائبة.
-- ترتيب التطبيق بعد 0055 (تعتمد is_platform_admin()).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) جدول الباقات — حدود بلا أسعار (قرار م1 للمالك لم يُتخذ بعد)
-- ---------------------------------------------------------------------------
create table public.plans (
  slug       text primary key check (slug in ('trial', 'basic', 'pro', 'pilot')),
  name       text not null,
  limits     jsonb not null,
  is_pilot   boolean not null default false,
  is_active  boolean not null default true,
  sort_order integer not null,
  created_at timestamptz not null default now()
);

alter table public.plans enable row level security;

-- قراءة الأدمن فقط — المدرس يرى باقته عبر my_subscription() لا من هنا.
create policy plans_admin_select on public.plans
  for select using (public.is_platform_admin());

revoke all on public.plans from public, anon, authenticated;
grant select on public.plans to authenticated;
grant all on public.plans to service_role;

-- بذرات سخية عمداً: لا حساب قائم يتأثر؛ null في أي حد = بلا حد.
insert into public.plans (slug, name, limits, is_pilot, sort_order) values
  ('trial', 'تجريبي',
    '{"max_students": 50, "max_messages_month": 500, "max_storage_mb": 500, "max_team_members": 1, "max_ai_messages_month": 100}'::jsonb,
    false, 1),
  ('basic', 'أساسي',
    '{"max_students": 200, "max_messages_month": 2000, "max_storage_mb": 2048, "max_team_members": 3, "max_ai_messages_month": 500}'::jsonb,
    false, 2),
  ('pro', 'احترافي',
    '{"max_students": 1000, "max_messages_month": 10000, "max_storage_mb": 10240, "max_team_members": 10, "max_ai_messages_month": 5000}'::jsonb,
    false, 3),
  ('pilot', 'باقة الطيار',
    '{"max_students": 1000, "max_messages_month": 10000, "max_storage_mb": 10240, "max_team_members": 10, "max_ai_messages_month": 5000}'::jsonb,
    true, 4);

-- ---------------------------------------------------------------------------
-- 2) جدول الاشتراكات — حساب ↔ باقة + حالة + نهاية التجربة
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  teacher_id   uuid primary key references public.teachers (id) on delete cascade,
  plan_slug    text not null references public.plans (slug) on delete restrict,
  status       text not null default 'trial'
    check (status in ('active', 'trial', 'past_due', 'cancelled')),
  trial_ends_at timestamptz,
  started_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- القراءة للمالك (اشتراكه هو فقط) ولأدمن المنصة — لا كتابة للعميل.
create policy subscriptions_owner_select on public.subscriptions
  for select using (public.is_teacher_owner(teacher_id));
create policy subscriptions_admin_select on public.subscriptions
  for select using (public.is_platform_admin());

-- لا سياسات INSERT/UPDATE/DELETE للعميل إطلاقاً: تغيير الباقة فعل
-- أدمن (RPC/خدمة) فقط — واجهته في الخطوة 7 من خطة الأدمن.
revoke all on public.subscriptions from public, anon, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

-- تعبئة رجعية: كل مدرس قائم على التجريبي بحالة active وبلا نهاية
-- تجربة — صفر تغيير سلوكي؛ آمنة التكرار (on conflict do nothing).
insert into public.subscriptions (teacher_id, plan_slug, status, trial_ends_at)
select id, 'trial', 'active', null from public.teachers
on conflict (teacher_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3) RPC قراءة الاشتراك — المالك لمساحته أو الأدمن؛ null عند الغياب
-- ---------------------------------------------------------------------------
create or replace function public.my_subscription(p_teacher_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_row record;
begin
  -- الحارس يعمل أيضاً عند غياب الجلسة: بلا auth.uid() يرفض الكل.
  if not (public.is_teacher_owner(p_teacher_id)
          or public.is_platform_admin()) then
    raise exception 'not authorized';
  end if;

  select s.teacher_id, s.plan_slug, p.name as plan_name, p.is_pilot,
         s.status, s.trial_ends_at, p.limits
    into v_row
    from public.subscriptions s
    join public.plans p on p.slug = s.plan_slug
   where s.teacher_id = p_teacher_id;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'teacher_id', v_row.teacher_id,
    'plan_slug', v_row.plan_slug,
    'plan_name', v_row.plan_name,
    'is_pilot', v_row.is_pilot,
    'status', v_row.status,
    'trial_ends_at', v_row.trial_ends_at,
    'limits', v_row.limits
  );
end $$;

revoke execute on function public.my_subscription(uuid) from public, anon;
grant execute on function public.my_subscription(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) RPC حدود الباقة — لإنفاذ الخطوة 5 لاحقاً؛ نفس الحارس
-- ---------------------------------------------------------------------------
create or replace function public.plan_limits(p_teacher_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_limits jsonb;
begin
  if not (public.is_teacher_owner(p_teacher_id)
          or public.is_platform_admin()) then
    raise exception 'not authorized';
  end if;

  select p.limits into v_limits
    from public.subscriptions s
    join public.plans p on p.slug = s.plan_slug
   where s.teacher_id = p_teacher_id;

  return v_limits;
end $$;

revoke execute on function public.plan_limits(uuid) from public, anon;
grant execute on function public.plan_limits(uuid) to authenticated;

commit;

-- ============================================================================
-- نهاية 0058 — جداول جديدة: plans + subscriptions | دوال:
-- my_subscription / plan_limits. ترتيب التطبيق بعد 0055.
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ⚠️ بلا أسعار: أي عمود سعر لاحقاً يحتاج قرار مالك موثّق (م1).
-- ============================================================================
