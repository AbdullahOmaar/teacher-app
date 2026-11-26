-- ============================================================================
-- 0059 — التجاوزات الفردية لكل حساب (Phase 2 T18 — 3A-893، الخطوة 4 من خطة الأدمن)
-- ----------------------------------------------------------------------------
-- توجيه مالك ٢: قوالب أدوار + تجاوزات فردية من أدمن المنصة (تفعيل/تعطيل
-- خصائص وحدود لكل مدرس بعينه) — المدرس نفسه لا يعدّلها. هذه المهاجرة
-- تبني **طبقة البيانات والحلّ وحدها** — لا واجهة أدمن هنا (الخطوة 7)
-- ولا إنفاذ حدود (الخطوة 5):
--
-- • الجدول `account_overrides`: صف لكل تجاوز — النوع kind (خاصية
--   'feature' أو حد 'limit') + المفتاح key + القيمة value (jsonb:
--   الخاصية بوليان؛ الحد عدد صحيح ≥ 0 أو null = بلا حد) + السبب
--   reason الإلزامي + الانتهاء الاختياري expires_at + مين عملها
--   created_by. الصفوف المنتهية **تاريخ** لا تُحذف: انتهاء التجاوز
--   يعني رجوع الحساب لحدّ باقته تلقائياً.
-- • قاعدة عدم التكرار: تجاوز نشط واحد فقط لكل (حساب، نوع، مفتاح).
--   ملاحظة صدق: فهرس جزئي بـ expires_at > now() مستحيل في
--   Postgres (الـ now() ليس immutable فلا يصح في شرط فهرس) —
--   فالضمان الطبقي هنا فهرس جزئي على expires_at IS NULL (تجاوز
--   واحد دائم لكل مفتاح)، والضمان الكامل في RPC ‏set_account_override
--   نفسه: ينهي أي تجاوز نشط سابق لنفس المفتاح قبل الإدراج، في نفس
--   المعاملة — فلا يبقى نشطاً إلا الأحدث أبداً.
-- • RLS: قراءة/كتابة الأدمن فقط عبر is_platform_admin() — **المدرس
--   لا يرى تجاوزاته ولا يعدّلها إطلاقاً، لا بقراءة جدول ولا بـ RPC
--   كتابة**؛ هذا هو جوهر التوجيه (الصلاحية من الأدمن بس). المدرس يرى
--   *الأثر* فقط عبر effective_entitlements() (حدوده الفعّالة) — لا
--   السبب ولا مين عملها ولا تاريخها.
-- • الدالة `effective_entitlements(p_teacher_id)`: الحلّ الفعّال =
--   حدود باقة الاشتراك (منطق plan_limits في 0058) ⊕ التجاوزات النشطة
--   فقط (expires_at فارغ أو في المستقبل): تجاوز الحد يستبدل قيمة
--   الباقة، وتجاوز الخاصية يضبط العلم. مفاتيح الخصائص بلا افتراضي من
--   الباقة بعد (الباقات تحمل حدوداً فقط في 0058) — فالخريطة features
--   تبدأ فارغة وتُملأ من التجاوزات وحدها؛ حين تضيف الخطوة 7 خصائص
--   افتراضية للباقات يُمدَّد الحلّ هنا لا في العميل. الحارس: مالك
--   مساحة العمل أو أدمن المنصة — ويرفع 'not authorized' لغيرهما.
-- • الدالتان `set_account_override(...)` و`revoke_account_override(...)`:
--   مسار الكتابة الوحيد حتى واجهة الخطوة 7 — حارس أدمن صريح، والتحقق
--   من شكل القيمة خادمياً (خاصية: بوليان؛ حد: عدد صحيح ≥ 0 أو null)،
--   وإنهاء السابق + إدراج الجديد + سطر في platform_audit_log
--   (override_set / override_revoked) في معاملة واحدة — فلا تجاوز
--   بلا أثر تدقيق.
-- • تعيين باقة الطيار: **تجاوز لا تغيير باقة** — حساب البايلوت يبقى
--   على اشتراكه (التجريبي من 0058) وتُسند حدود/خصائص الطيار بتجاوزات
--   تحمل السبب «مدرس البايلوت الأول»، بفعل أدمن لاحق موثّق — لا
--   تُطبَّق أي تجاوزات من هذه المهاجرة نفسها.
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): مهاجرة كود فقط — لا
-- تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 + بوابة QA. العميل
-- يتحمّل غياب دوالها (البطاقة تُخفي سطر التجاوز) حتى البوابة. قسم
-- authz الحي الخاص بها في scripts/authz_tests.py يتخطى نفسه بتوثيق
-- صريح ما دامت جداولها غائبة.
-- ترتيب التطبيق بعد 0055 و0058 (تعتمد is_platform_admin() وجدولي
-- plans/subscriptions ومنطق حدودهما).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) جدول التجاوزات الفردية — الأدمن فقط، والمدرس لا يراه إطلاقاً
-- ---------------------------------------------------------------------------
create table public.account_overrides (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  kind        text not null check (kind in ('feature', 'limit')),
  key         text not null check (key in (
                  'whatsapp_auto', 'ai_assistant', 'team_accounts',
                  'online_payments',
                  'max_students', 'max_messages_month', 'max_storage_mb',
                  'max_team_members', 'max_ai_messages_month')),
  -- value قابلة لـ SQL NULL: الحد null = بلا حد (غير محدود)؛ الخاصية
  -- بوليان دائماً (يفرضها القيد أدناه) فلا يقبل null إطلاقاً.
  value       jsonb,
  reason      text not null check (char_length(btrim(reason)) > 0),
  expires_at  timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  -- النوع والمفتاح متسقان: مفاتيح الخصائص للخاصيات ومفاتيح الحدود للحدود.
  check ((kind = 'feature' and key in ('whatsapp_auto', 'ai_assistant',
          'team_accounts', 'online_payments'))
      or (kind = 'limit' and key in ('max_students', 'max_messages_month',
          'max_storage_mb', 'max_team_members', 'max_ai_messages_month'))),
  -- شكل القيمة خادمياً: الخاصية بوليان حتماً؛ الحد عدد صحيح ≥ 0 أو
  -- null (SQL NULL أو JSON null) = بلا حد.
  check ((kind = 'feature' and value is not null
          and jsonb_typeof(value) = 'boolean')
      or (kind = 'limit'
          and (value is null or jsonb_typeof(value) = 'null'
               or (jsonb_typeof(value) = 'number'
                   and (value::text)::numeric >= 0
                   and (value::text)::numeric
                       = floor((value::text)::numeric)))))
);

alter table public.account_overrides enable row level security;

-- القراءة والكتابة للأدمن فقط — لا سياسة للمدرس إطلاقاً (جوهر توجيه
-- مالك ٢: الصلاحية من الأدمن بس؛ المدرس يرى الأثر عبر
-- effective_entitlements() لا الصفوف).
create policy account_overrides_admin_all on public.account_overrides
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on public.account_overrides from public, anon, authenticated;
grant select, insert, update, delete on public.account_overrides to authenticated;
grant all on public.account_overrides to service_role;

-- تجاوز دائم واحد لكل (حساب، نوع، مفتاح) — الضمان الكامل للنشط في
-- RPC الإعداد (ينهي السابق أولاً) لأن شرط expires_at > now() لا
-- يصح في فهرس جزئي (now() ليس immutable).
create unique index account_overrides_one_permanent_idx
  on public.account_overrides (teacher_id, kind, key)
  where expires_at is null;
create index account_overrides_teacher_idx
  on public.account_overrides (teacher_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2) RPC الحلّ الفعّال — حدود الباقة ⊕ التجاوزات النشطة وحدها
-- ---------------------------------------------------------------------------
create or replace function public.effective_entitlements(p_teacher_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_plan_slug text;
  v_status text;
  v_trial_ends timestamptz;
  v_limits jsonb;
  v_features jsonb := '{}'::jsonb;
  v_applied jsonb := '[]'::jsonb;
  v_row record;
begin
  -- الحارس يعمل أيضاً عند غياب الجلسة: بلا auth.uid() يرفض الكل.
  if not (public.is_teacher_owner(p_teacher_id)
          or public.is_platform_admin()) then
    raise exception 'not authorized';
  end if;

  -- نقطة البداية: اشتراك الحساب وباقة حدوده (منطق 0058 نفسه).
  select s.plan_slug, s.status, s.trial_ends_at, p.limits
    into v_plan_slug, v_status, v_trial_ends, v_limits
    from public.subscriptions s
    join public.plans p on p.slug = s.plan_slug
   where s.teacher_id = p_teacher_id;

  if not found then
    return null;
  end if;

  -- التجاوزات النشطة فقط: بلا انتهاء، أو انتهاؤها في المستقبل.
  -- المنتهية تاريخ صامت: لا أثر لها هنا إطلاقاً.
  for v_row in
    select kind, key, value
      from public.account_overrides
     where teacher_id = p_teacher_id
       and (expires_at is null or expires_at > now())
     order by created_at asc
  loop
    if v_row.kind = 'limit' then
      -- ملاحظة: jsonb_set بقيمة SQL NULL تحذف المفتاح بدل تعيينه —
      -- فالحد «بلا حد» يُكتب JSON null صريحاً ('null'::jsonb).
      v_limits := jsonb_set(v_limits, array[v_row.key],
                            coalesce(v_row.value, 'null'::jsonb));
    else
      v_features := jsonb_set(v_features, array[v_row.key], v_row.value);
    end if;
    v_applied := v_applied || jsonb_build_array(v_row.kind || ':' || v_row.key);
  end loop;

  return jsonb_build_object(
    'teacher_id', p_teacher_id,
    'plan_slug', v_plan_slug,
    'status', v_status,
    'trial_ends_at', v_trial_ends,
    'limits', v_limits,
    'features', v_features,
    'overrides_applied', v_applied
  );
end $$;

revoke execute on function public.effective_entitlements(uuid) from public, anon;
grant execute on function public.effective_entitlements(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) RPC إعداد تجاوز — المسار الوحيد للكتابة حتى واجهة الخطوة 7
-- ---------------------------------------------------------------------------
create or replace function public.set_account_override(
  p_teacher_id uuid,
  p_kind text,
  p_key text,
  p_value jsonb,
  p_reason text,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  -- التحقق من شكل القيمة خادمياً — لا تجاوز مشوّه يصل للجدول.
  if p_kind = 'feature' then
    -- ملاحظة: jsonb_typeof(NULL) ترجع NULL لا false — فالفحص الصريح
    -- على null أولاً، وإلا مرّت خاصية بلا قيمة حتى قيد الجدول.
    if p_value is null or jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'invalid override value: feature needs a boolean';
    end if;
  elsif p_kind = 'limit' then
    if p_value is not null and jsonb_typeof(p_value) <> 'null'
       and not (jsonb_typeof(p_value) = 'number'
                and (p_value::text)::numeric >= 0
                and (p_value::text)::numeric
                    = floor((p_value::text)::numeric)) then
      raise exception 'invalid override value: limit needs an integer >= 0 or null';
    end if;
  else
    raise exception 'invalid override kind';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise exception 'override reason is required';
  end if;

  -- إنهاء أي تجاوز نشط سابق لنفس المفتاح أولاً (تاريخ محفوظ)، ثم
  -- إدراج الجديد — فلا يبقى نشطاً إلا الأحدث أبداً.
  update public.account_overrides
     set expires_at = now()
   where teacher_id = p_teacher_id
     and kind = p_kind
     and key = p_key
     and (expires_at is null or expires_at > now());

  insert into public.account_overrides
    (teacher_id, kind, key, value, reason, expires_at, created_by)
  values (p_teacher_id, p_kind, p_key, p_value, p_reason, p_expires_at,
          auth.uid())
  returning id into v_id;

  -- الأثر في سجل تدقيق المنصة — في نفس المعاملة.
  insert into public.platform_audit_log
    (admin_user_id, action, target_teacher_id, details)
  values (auth.uid(), 'override_set', p_teacher_id,
          jsonb_build_object('kind', p_kind, 'key', p_key,
                             'value', p_value, 'reason', p_reason,
                             'expires_at', p_expires_at,
                             'override_id', v_id));

  return v_id;
end $$;

revoke execute on function public.set_account_override(uuid, text, text, jsonb, text, timestamptz) from public, anon;
grant execute on function public.set_account_override(uuid, text, text, jsonb, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) RPC إلغاء تجاوز — إنهاء فوري + أثر تدقيق (لا حذف للصف أبداً)
-- ---------------------------------------------------------------------------
create or replace function public.revoke_account_override(p_override_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row record;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select teacher_id, kind, key, value, reason
    into v_row
    from public.account_overrides
   where id = p_override_id;

  if not found then
    raise exception 'override not found';
  end if;

  -- الإلغاء إنهاء لا حذف: الصف يبقى تاريخاً، والرجوع للباقة فوري.
  -- كسول (idempotent): المنتهي أصلاً يبقى كما هو ويرجع نفسه.
  update public.account_overrides
     set expires_at = now()
   where id = p_override_id
     and (expires_at is null or expires_at > now());

  insert into public.platform_audit_log
    (admin_user_id, action, target_teacher_id, details)
  values (auth.uid(), 'override_revoked', v_row.teacher_id,
          jsonb_build_object('kind', v_row.kind, 'key', v_row.key,
                             'value', v_row.value, 'reason', v_row.reason,
                             'override_id', p_override_id));

  return p_override_id;
end $$;

revoke execute on function public.revoke_account_override(uuid) from public, anon;
grant execute on function public.revoke_account_override(uuid) to authenticated;

commit;

-- ============================================================================
-- نهاية 0059 — جدول: account_overrides | دوال: effective_entitlements /
-- set_account_override / revoke_account_override. ترتيب التطبيق بعد
-- 0055 و0058.
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ⚠️ بلا واجهة أدمن بعد (الخطوة 7) وبلا إنفاذ حدود (الخطوة 5):
--    الكتابة عبر RPCs الإعداد وحدها، والقراءة عبر effective_entitlements.
-- ============================================================================
