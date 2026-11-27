-- ============================================================================
-- 0063 — قوالب الأدوار الجاهزة + مفتاحا التأكيد الإلزامي
--        (Phase 2 T18 — 3A-893، الشق المتبقي من المهمة 18)
-- ----------------------------------------------------------------------------
-- توجيه مالك ٢: قوالب أدوار جاهزة + تجاوزات فردية من أدمن المنصة.
-- التجاوزات الفردية سلّمتها 0059 (account_overrides +
-- effective_entitlements + set/revoke_account_override). هذه المهاجرة
-- تبني **القوالب الجاهزة** — الكيان المستقل الذي كان ناقصاً — فوق
-- طبقة التجاوزات نفسها، بلا حلّ ثانٍ وبلا مسار كتابة ثانٍ:
--
-- • الجدول `role_templates`: قالب جاهز — slug فريد + اسم + وصف +
--   `entitlements` (jsonb بشكل {features:{}, limits:{}, settings:{}})
--   + علم is_active + مين عمله. القالب المعطّل لا يُطبَّق؛ ولا حذف
--   أبداً (التعطيل هو الإلغاء، والتاريخ محفوظ).
-- • `create_role_template / update_role_template`: مسار الكتابة
--   الوحيد للقوالب — حارس أدمن صريح + تحقق خادمي من شكل الحمولة
--   (دالة validate_role_template_entitlements الداخلية — تنفيذها
--   المباشر مسحوب بنمط 0023، فلا يناديها إلا RPCs الأدمن) + سطر
--   تدقيق (role_template_created / role_template_updated) في نفس
--   المعاملة.
-- • `apply_role_template(template, teacher, reason, expires_at)`:
--   تطبيق القالب = كتابة تجاوز فردي واحد لكل إدخال في القالب عبر
--   `set_account_override` نفسه (لا تكرار لمنطق الإنهاء/الإدراج/
--   التدقيق) + سطر تدقيق واحد role_template_applied يربط القالب
--   بالتجاوزات المكتوبة. التطبيق فوق تجاوز سابق لنفس المفتاح ينهيه
--   (نفس قاعدة «الأحدث يفوز» في 0059)؛ والتجاوز اليدوي اللاحق
--   يفوز على القالب المطبَّق — القالب نقطة بداية لا قفل.
-- • مفتاحا التأكيد الإلزامي (تصحيح المالك 2026-11-26 17:19):
--   `confirmation_required` خاصية بوليان (مقفول افتراضياً — بلا أي
--   تجاوز يبقى النظام مقفولاً) و`confirmation_channel` إعداد نصي
--   واحد من (mobile | whatsapp | email). الإعداد نوع تجاوز ثالث
--   جديد 'setting' — قيمته نص من قائمة مسموحة للمفتاح، لا بوليان
--   ولا عدد؛ فقيود المفاتيح وشكل القيمة في 0059/0060 تُوسَّع هنا
--   (نفس نمط كتلة DO في 0060: إسقاط القيود بلا أسماء صريحة ثم
--   إعادتها بأسماء v3)، و`set_account_override` يقبل النوع الجديد
--   بتحقق خادمي، و`effective_entitlements()` تُستبدل لتُرجع خريطة
--   `settings` مع `features`/`limits` — إضافة حقل فقط، بلا كسر
--   لمستهلكي الشكل القديم.
-- • تمييز موثّق: مفاتيح 0060 الأربعة (verification_required +
--   ثلاثي قنوات التأكيد البوليانية) نظام إعداد قناة التحقق 3A-905
--   (مجموعة قنوات = اتحاد المفاتيح)؛ ومفتاحا 0063
--   (confirmation_required + confirmation_channel) مفتاحا تصحيح
--   المالك 17:19 للإلزامية وقناتها الواحدة — نظامان متوازيان
--   بلا تداخل، والعميل يشتق كلاًّ منهما على حدة.
-- • RLS: القوالب للأدمن فقط (نفس نمط account_overrides — لا
--   سياسة للمدرس إطلاقاً)؛ القراءة من اللوحة مباشرة من الجدول
--   بسياسة الأدمن، والكتابة عبر RPCs وحدها.
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): مهاجرة كود فقط — لا
-- تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 + بوابة QA. العميل
-- يتحمّل غياب جدولها ودوالها (قسم القوالب يعرض «قريباً») حتى
-- البوابة. قسم authz الحي الخاص بها في scripts/authz_tests.py
-- يتخطى نفسه بتوثيق صريح ما دامت غائبة.
-- ترتيب التطبيق بعد 0061 (تعتمد is_platform_admin() من 0055
-- وaccount_overrides وeffective_entitlements وset_account_override
-- من 0059/0060 وplatform_audit_log من 0055). الرقم 0062 على فرع
-- PR #45 (الخطوة 5) ويُدمج منفصلاً — لا تعارض: هذه 0063.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) توسيع قيود account_overrides: مفتاحا التأكيد + النوع 'setting'
--    (نمط كتلة DO في 0060 — القيود بلا أسماء صريحة تُسقط بالبحث عن
--    تعريفها، ثم تُعاد بأسماء v3)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select conname
      from pg_constraint
     where conrelid = 'public.account_overrides'::regclass
       and contype = 'c'
       and (pg_get_constraintdef(oid) like '%whatsapp_auto%'
            or pg_get_constraintdef(oid) like '%jsonb_typeof(value)%')
  loop
    execute format('alter table public.account_overrides drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.account_overrides
  add constraint account_overrides_key_check_v3
  check (key in (
    'whatsapp_auto', 'ai_assistant', 'team_accounts',
    'online_payments',
    'verification_required',
    'verification_channel_email', 'verification_channel_whatsapp',
    'verification_channel_sms',
    'confirmation_required', 'confirmation_channel',
    'max_students', 'max_messages_month', 'max_storage_mb',
    'max_team_members', 'max_ai_messages_month'));

alter table public.account_overrides
  add constraint account_overrides_kind_key_check_v3
  check ((kind = 'feature' and key in (
            'whatsapp_auto', 'ai_assistant', 'team_accounts',
            'online_payments',
            'verification_required',
            'verification_channel_email', 'verification_channel_whatsapp',
            'verification_channel_sms',
            'confirmation_required'))
      or (kind = 'limit' and key in (
            'max_students', 'max_messages_month', 'max_storage_mb',
            'max_team_members', 'max_ai_messages_month'))
      or (kind = 'setting' and key in ('confirmation_channel')));

-- شكل القيمة خادمياً: الخاصية بوليان حتماً؛ الحد عدد صحيح ≥ 0 أو
-- null (SQL NULL أو JSON null) = بلا حد؛ الإعداد نص من قائمته.
alter table public.account_overrides
  add constraint account_overrides_value_check_v3
  check ((kind = 'feature' and value is not null
          and jsonb_typeof(value) = 'boolean')
      or (kind = 'limit'
          and (value is null or jsonb_typeof(value) = 'null'
               or (jsonb_typeof(value) = 'number'
                   and (value::text)::numeric >= 0
                   and (value::text)::numeric
                       = floor((value::text)::numeric))))
      or (kind = 'setting' and value is not null
          and jsonb_typeof(value) = 'string'
          and (value #>> '{}') in ('mobile', 'whatsapp', 'email')));

-- ---------------------------------------------------------------------------
-- 2) توسيع set_account_override ليقبل النوع 'setting'
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
  elsif p_kind = 'setting' then
    -- الإعداد الوحيد اليوم: قناة تأكيد واحدة من ثلاث.
    if p_key <> 'confirmation_channel' or p_value is null
       or jsonb_typeof(p_value) <> 'string'
       or (p_value #>> '{}') not in ('mobile', 'whatsapp', 'email') then
      raise exception 'invalid override value: setting confirmation_channel needs mobile, whatsapp or email';
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

-- ---------------------------------------------------------------------------
-- 3) استبدال effective_entitlements: خريطة settings مع features/limits
--    (إضافة حقل فقط — مستهلكو الشكل القديم لا ينكسرون)
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
  v_settings jsonb := '{}'::jsonb;
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
    elsif v_row.kind = 'setting' then
      v_settings := jsonb_set(v_settings, array[v_row.key], v_row.value);
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
    'settings', v_settings,
    'overrides_applied', v_applied
  );
end $$;

-- ---------------------------------------------------------------------------
-- 4) جدول قوالب الأدوار الجاهزة — الأدمن فقط، والمدرس لا يراه إطلاقاً
-- ---------------------------------------------------------------------------
create table public.role_templates (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique
               check (slug ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name         text not null check (char_length(btrim(name)) > 0),
  description  text not null default '',
  entitlements jsonb not null default '{}'::jsonb,
  is_active    boolean not null default true,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.role_templates enable row level security;

-- القراءة والكتابة للأدمن فقط — القوالب أداة إدارة المنصة، والمدرس
-- لا يرى القوالب ولا يعدّلها؛ يرى الأثر فقط عبر effective_entitlements.
create policy role_templates_admin_all on public.role_templates
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on public.role_templates from public, anon, authenticated;
grant select, insert, update, delete on public.role_templates to authenticated;
grant all on public.role_templates to service_role;

create index role_templates_active_idx
  on public.role_templates (is_active, created_at desc);

-- ---------------------------------------------------------------------------
-- 5) دالة التحقق الداخلي من حمولة القالب — تنفيذها المباشر مسحوب
--    (نمط 0023): لا يناديها إلا RPCs الأدمن وهي تعمل بصلاحيات المُعرِّف.
-- ---------------------------------------------------------------------------
create or replace function public.validate_role_template_entitlements(
  p_entitlements jsonb
)
returns void
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_top text;
  v_key text;
  v_val jsonb;
  v_count int := 0;
begin
  if p_entitlements is null or jsonb_typeof(p_entitlements) <> 'object' then
    raise exception 'invalid template entitlements: object expected';
  end if;

  -- المستوى الأعلى: features/limits/settings فقط.
  for v_top in select jsonb_object_keys(p_entitlements) loop
    if v_top not in ('features', 'limits', 'settings') then
      raise exception 'invalid template entitlements: unknown section %', v_top;
    end if;
  end loop;

  -- الخصائص: مفاتيح معروفة وقيم بوليان.
  if p_entitlements ? 'features' then
    if jsonb_typeof(p_entitlements -> 'features') <> 'object' then
      raise exception 'invalid template entitlements: features must be an object';
    end if;
    for v_key, v_val in
      select key, value from jsonb_each(p_entitlements -> 'features')
    loop
      if v_key not in (
        'whatsapp_auto', 'ai_assistant', 'team_accounts',
        'online_payments',
        'verification_required',
        'verification_channel_email', 'verification_channel_whatsapp',
        'verification_channel_sms',
        'confirmation_required') then
        raise exception 'invalid template entitlements: unknown feature %', v_key;
      end if;
      if jsonb_typeof(v_val) <> 'boolean' then
        raise exception 'invalid template entitlements: feature % needs a boolean', v_key;
      end if;
      v_count := v_count + 1;
    end loop;
  end if;

  -- الحدود: مفاتيح معروفة وقيم صحيحة ≥ 0 أو null.
  if p_entitlements ? 'limits' then
    if jsonb_typeof(p_entitlements -> 'limits') <> 'object' then
      raise exception 'invalid template entitlements: limits must be an object';
    end if;
    for v_key, v_val in
      select key, value from jsonb_each(p_entitlements -> 'limits')
    loop
      if v_key not in (
        'max_students', 'max_messages_month', 'max_storage_mb',
        'max_team_members', 'max_ai_messages_month') then
        raise exception 'invalid template entitlements: unknown limit %', v_key;
      end if;
      if jsonb_typeof(v_val) <> 'null'
         and not (jsonb_typeof(v_val) = 'number'
                  and (v_val::text)::numeric >= 0
                  and (v_val::text)::numeric
                      = floor((v_val::text)::numeric)) then
        raise exception 'invalid template entitlements: limit % needs an integer >= 0 or null', v_key;
      end if;
      v_count := v_count + 1;
    end loop;
  end if;

  -- الإعدادات: confirmation_channel وحده، بقيمة من ثلاث.
  if p_entitlements ? 'settings' then
    if jsonb_typeof(p_entitlements -> 'settings') <> 'object' then
      raise exception 'invalid template entitlements: settings must be an object';
    end if;
    for v_key, v_val in
      select key, value from jsonb_each(p_entitlements -> 'settings')
    loop
      if v_key <> 'confirmation_channel' then
        raise exception 'invalid template entitlements: unknown setting %', v_key;
      end if;
      if jsonb_typeof(v_val) <> 'string'
         or (v_val #>> '{}') not in ('mobile', 'whatsapp', 'email') then
        raise exception 'invalid template entitlements: setting confirmation_channel needs mobile, whatsapp or email';
      end if;
      v_count := v_count + 1;
    end loop;
  end if;

  -- قالب بلا أي إدخال بلا معنى — يُرفض صراحة بدل قالب فارغ صامت.
  if v_count = 0 then
    raise exception 'invalid template entitlements: at least one entry is required';
  end if;
end $$;

revoke execute on function public.validate_role_template_entitlements(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) RPC إنشاء قالب — حارس أدمن + تحقق + سطر تدقيق، معاملة واحدة
-- ---------------------------------------------------------------------------
create or replace function public.create_role_template(
  p_slug text,
  p_name text,
  p_description text default '',
  p_entitlements jsonb default '{}'::jsonb
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

  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception 'invalid template slug';
  end if;
  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'template name is required';
  end if;

  perform public.validate_role_template_entitlements(p_entitlements);

  insert into public.role_templates
    (slug, name, description, entitlements, created_by)
  values (p_slug, btrim(p_name),
          coalesce(p_description, ''), p_entitlements, auth.uid())
  returning id into v_id;

  insert into public.platform_audit_log
    (admin_user_id, action, target_teacher_id, details)
  values (auth.uid(), 'role_template_created', null,
          jsonb_build_object('template_id', v_id, 'slug', p_slug,
                             'name', btrim(p_name)));

  return v_id;
end $$;

revoke execute on function public.create_role_template(text, text, text, jsonb) from public, anon;
grant execute on function public.create_role_template(text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) RPC تعديل قالب — استبدال كامل للاسم/الوصف/الحمولة/التفعيل
-- ---------------------------------------------------------------------------
create or replace function public.update_role_template(
  p_template_id uuid,
  p_name text,
  p_description text,
  p_entitlements jsonb,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_slug text;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select slug into v_slug
    from public.role_templates
   where id = p_template_id;

  if not found then
    raise exception 'template not found';
  end if;

  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'template name is required';
  end if;

  perform public.validate_role_template_entitlements(p_entitlements);

  -- التعطيل إلغاء للاستخدام اللاحق لا حذف: القالب يبقى تاريخاً،
  -- والتجاوزات المطبَّقة منه سابقاً لا تُمسّ (تبقى تجاوزات فردية).
  update public.role_templates
     set name = btrim(p_name),
         description = coalesce(p_description, ''),
         entitlements = p_entitlements,
         is_active = p_is_active,
         updated_at = now()
   where id = p_template_id;

  insert into public.platform_audit_log
    (admin_user_id, action, target_teacher_id, details)
  values (auth.uid(), 'role_template_updated', null,
          jsonb_build_object('template_id', p_template_id,
                             'slug', v_slug,
                             'is_active', p_is_active));

  return p_template_id;
end $$;

revoke execute on function public.update_role_template(uuid, text, text, jsonb, boolean) from public, anon;
grant execute on function public.update_role_template(uuid, text, text, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) RPC تطبيق قالب على حساب — تجاوز فردي لكل إدخال عبر
--    set_account_override نفسه (لا تكرار لمنطق الإنهاء/الإدراج/
--    التدقيق) + سطر تدقيق واحد يربط القالب بالتجاوزات المكتوبة.
-- ---------------------------------------------------------------------------
create or replace function public.apply_role_template(
  p_template_id uuid,
  p_teacher_id uuid,
  p_reason text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_slug text;
  v_ent jsonb;
  v_ids jsonb := '[]'::jsonb;
  v_section text;
  v_key text;
  v_val jsonb;
  v_kind text;
  v_oid uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select slug, entitlements into v_slug, v_ent
    from public.role_templates
   where id = p_template_id;

  if not found then
    raise exception 'template not found';
  end if;

  -- القالب المعطّل لا يُطبَّق — التطبيق على النشط وحده.
  if not exists (select 1 from public.role_templates
                  where id = p_template_id and is_active) then
    raise exception 'template is not active';
  end if;

  if not exists (select 1 from public.teachers where id = p_teacher_id) then
    raise exception 'teacher not found';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise exception 'template apply reason is required';
  end if;

  -- ترتيب حتمي: خصائص ثم حدود ثم إعدادات، وكل قسم بترتيب مفاتيحه
  -- الأبجدي — فالتطبيق الواحد يعطي نفس التجاوزات بنفس الترتيب دائماً.
  for v_section in select unnest(array['features', 'limits', 'settings']) loop
    v_kind := case v_section
                when 'features' then 'feature'
                when 'limits' then 'limit'
                else 'setting' end;
    for v_key, v_val in
      select key, value
        from jsonb_each(coalesce(v_ent -> v_section, '{}'::jsonb))
       order by key
    loop
      v_oid := public.set_account_override(
        p_teacher_id, v_kind, v_key, v_val, p_reason, p_expires_at);
      v_ids := v_ids || jsonb_build_array(v_oid);
    end loop;
  end loop;

  insert into public.platform_audit_log
    (admin_user_id, action, target_teacher_id, details)
  values (auth.uid(), 'role_template_applied', p_teacher_id,
          jsonb_build_object('template_id', p_template_id,
                             'slug', v_slug,
                             'reason', p_reason,
                             'expires_at', p_expires_at,
                             'override_ids', v_ids));

  return v_ids;
end $$;

revoke execute on function public.apply_role_template(uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.apply_role_template(uuid, uuid, text, timestamptz) to authenticated;

commit;

-- ============================================================================
-- نهاية 0063 — جدول: role_templates | دوال: validate_role_template_
-- entitlements (داخلية، تنفيذها مسحوب) / create_role_template /
-- update_role_template / apply_role_template | موسّع: set_account_override
-- (النوع setting) + effective_entitlements (خريطة settings) + قيود
-- مفاتيح account_overrides (v3: confirmation_required + confirmation_channel).
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ⚠️ بلا إنفاذ تأكيد بعد (المفتاحان بيانات فقط): الإنفاذ عند التفعيل
--    بقرار مالك/مدير — والنظام كله مقفول افتراضياً بلا تجاوزات.
-- ============================================================================
