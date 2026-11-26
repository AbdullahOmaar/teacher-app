-- ============================================================================
-- 0061 — لوحة أدمن المنصة: مساحات العمل والمؤشرات وأفعال الإدارة
--        (Phase 2 T17 — 3A-892، الخطوة 7 من خطة الأدمن)
-- ----------------------------------------------------------------------------
-- الخطوات 1–4 بنت الأساس (0055) وقفل التسجيل وقائمة السماح (0057)
-- والباقات والاشتراكات (0058) والتجاوزات الفردية (0059)، والخطوة
-- السادسة سجل التدقيق (platform_audit_log في 0055). هذه المهاجرة
-- تبني **سطح القراءة والأفعال الذي تقف عليه واجهة اللوحة** وحدها —
-- لا جداول جديدة هنا:
--
-- • `platform_workspaces()`: قائمة مساحات العمل للأدمن — صف تجميعي
--   لكل مدرس (الاسم + بريد المالك + تاريخ الإنشاء + علم التفعيل +
--   باقة الاشتراك وحالته ونهاية تجربته + عدّ طلابه + آخر نشاط من
--   activity_log). حارس أدمن صريح يرفع 'not authorized' لغير الأدمن.
--   ملاحظة فصل: البريد وعدّ الطلاب وآخر نشاط هي أقصى ما يراه الأدمن
--   هنا — **لا صفوف طلاب ولا بيانات تشغيلية لأي سنتر**؛ الفصل في
--   القاعدة (هذا الـ RPC التجميعي) لا في الواجهة وحدها.
-- • `platform_indicators()`: مؤشرات المنصة — إجمالي المدرسين/
--   المفعّلين، الجدد في 7 و30 يوماً، إجمالي الطلاب، والاشتراكات
--   موزعة على الباقات الأربع (مفاتيح ثابتة حتى عند الصفر).
--   و`expected_revenue` يرجع **JSON null دائماً في هذه المهاجرة**:
--   لا أسعار معتمدة بعد (قرار مالك م1 لم يُتخذ — 0058 بلا عمود سعر
--   أصلاً)، والواجهة تعرض «—» عند null. **ممنوع اختراع رقم هنا**:
--   حين تُعتمد الأسعار تُحسب القيمة في مهاجرة لاحقة بقرار موثّق.
-- • `platform_set_account_activated(p_teacher_id, p_activated,
--   p_reason)`: مفتاح تفعيل/إيقاف الحساب — آلية البايلوت (قرار مدير
--   2026-11-26: المنصة الحقيقية نفسها، حساب البايلوت مفعّل وحده).
--   يقلب teachers.account_activated ويكتب سطر تدقيق
--   (account_activated / account_deactivated + السبب) في نفس
--   المعاملة. الإيقاف لا يمسّ أي بيانات — رجوعه فوري بإعادة التفعيل.
-- • `platform_set_subscription_plan(p_teacher_id, p_plan_slug,
--   p_trial_ends_at)`: تعيين باقة لحساب من اللوحة — لم يوجد RPC
--   لتغيير الباقة قبل هذه المهاجرة (0058: لا كتابة عميل إطلاقاً،
--   والتغيير «RPC/خدمة» بلا دالة منفّذة). يتحقق من وجود الباقة،
--   ويُدرج/يحدّث صف الاشتراك (الحالة القائمة تُحفظ عند التحديث)،
--   ويكتب سطر تدقيق subscription_plan_changed (الباقة السابقة
--   والجديدة ونهاية التجربة) في نفس المعاملة.
-- • ما يُعاد استخدامه كما هو بلا تكرار: set_account_override /
--   revoke_account_override (0059) للتجاوزات، وسياسات الأدمن على
--   teacher_allowlist (0057) لقائمة السماح، وقراءة platform_settings
--   للأدمن (0057) لعرض قيمة registration_open — اللوحة تعرض القيمة
--   **للقراءة فقط**: قلب القفل يبقى فعل service role / SQL حتى خطوة
--   لاحقة، فلا RPC قلب هنا عمداً.
-- • إعدادات واتساب المنصة (قسم اللوحة): **لا مصدر بيانات لها بعد**
--   — لا رقم واتساب للمنصة ولا عدّادات رسائل (العدّادات مع الخطوة
--   5/T24، والرقم قرار مالك ق4). الواجهة تعرض حالة «قريباً» مصممة
--   (قاعدة مالك 2026-11-26: لا خطأ خام لخاصية غير مُطلقة) — فلا
--   دالة ولا جدول واتساب في هذه المهاجرة إطلاقاً.
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): مهاجرة كود فقط — لا
-- تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 + بوابة QA. العميل
-- يتحمّل غياب دوالها (أقسام اللوحة تعرض «قريباً») حتى البوابة. قسم
-- authz الحي الخاص بها في scripts/authz_tests.py يتخطى نفسه بتوثيق
-- صريح ما دامت دوالها غائبة.
-- ترتيب التطبيق بعد 0060 (تعتمد is_platform_admin() من 0055 وجداول
-- الاشتراكات/التجاوزات/قائمة السماح من 0057–0059).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) RPC قائمة مساحات العمل — تجميع لكل مدرس، حارس أدمن صريح
-- ---------------------------------------------------------------------------
create or replace function public.platform_workspaces()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  -- الحارس يعمل أيضاً عند غياب الجلسة: is_platform_admin() ترجع
  -- false بلا auth.uid() فيُرفض الزائر والمدرس على السواء.
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  return coalesce((
    select jsonb_agg(row order by row.created_at desc)
      from (
        select
          t.id as teacher_id,
          t.display_name,
          u.email as owner_email,
          t.created_at,
          t.account_activated,
          s.plan_slug,
          s.status as subscription_status,
          s.trial_ends_at,
          (select count(*) from public.students st
            where st.teacher_id = t.id) as students_count,
          (select max(al.created_at) from public.activity_log al
            where al.teacher_id = t.id) as last_activity_at
        from public.teachers t
        join auth.users u on u.id = t.owner_user_id
        left join public.subscriptions s on s.teacher_id = t.id
      ) row
  ), '[]'::jsonb);
end $$;

revoke execute on function public.platform_workspaces() from public, anon;
grant execute on function public.platform_workspaces() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) RPC مؤشرات المنصة — expected_revenue = null حتى اعتماد الأسعار
-- ---------------------------------------------------------------------------
create or replace function public.platform_indicators()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  return jsonb_build_object(
    'teachers_total', (select count(*) from public.teachers),
    'teachers_activated',
      (select count(*) from public.teachers where account_activated),
    'teachers_new_7d',
      (select count(*) from public.teachers
        where created_at >= now() - interval '7 days'),
    'teachers_new_30d',
      (select count(*) from public.teachers
        where created_at >= now() - interval '30 days'),
    'students_total', (select count(*) from public.students),
    -- مفاتيح الباقات الأربع ثابتة حتى عند الصفر — الواجهة لا تخمّن.
    'subscriptions_by_plan', jsonb_build_object(
      'trial', (select count(*) from public.subscriptions
                 where plan_slug = 'trial'),
      'basic', (select count(*) from public.subscriptions
                 where plan_slug = 'basic'),
      'pro',   (select count(*) from public.subscriptions
                 where plan_slug = 'pro'),
      'pilot', (select count(*) from public.subscriptions
                 where plan_slug = 'pilot')
    ),
    -- ⛔ null عمداً: لا أسعار معتمدة (قرار مالك م1) — الواجهة تعرض
    -- «—»؛ أي رقم هنا بلا أسعار موثّقة اختراع ممنوع.
    'expected_revenue', 'null'::jsonb
  );
end $$;

revoke execute on function public.platform_indicators() from public, anon;
grant execute on function public.platform_indicators() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) RPC تفعيل/إيقاف حساب — مفتاح البايلوت + سطر تدقيق، معاملة واحدة
-- ---------------------------------------------------------------------------
create or replace function public.platform_set_account_activated(
  p_teacher_id uuid,
  p_activated boolean,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_previous boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select account_activated into v_previous
    from public.teachers
   where id = p_teacher_id;

  if not found then
    raise exception 'teacher not found';
  end if;

  -- قلب العلم فقط — لا مساس بأي بيانات تشغيلية للحساب إطلاقاً.
  update public.teachers
     set account_activated = p_activated
   where id = p_teacher_id;

  -- الأثر في سجل تدقيق المنصة — في نفس المعاملة.
  insert into public.platform_audit_log
    (admin_user_id, action, target_teacher_id, details)
  values (auth.uid(),
          case when p_activated
               then 'account_activated'
               else 'account_deactivated' end,
          p_teacher_id,
          jsonb_build_object('activated', p_activated,
                             'previous', v_previous,
                             'reason', p_reason));

  return p_teacher_id;
end $$;

revoke execute on function public.platform_set_account_activated(uuid, boolean, text) from public, anon;
grant execute on function public.platform_set_account_activated(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) RPC تعيين باقة اشتراك — إدراج/تحديث + سطر تدقيق، معاملة واحدة
-- ---------------------------------------------------------------------------
create or replace function public.platform_set_subscription_plan(
  p_teacher_id uuid,
  p_plan_slug text,
  p_trial_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_previous_slug text;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  -- الباقة لازم توجد في plans (القيد المرجعي وحده لا يكفي: رسالة
  -- واضحة قبل أي كتابة، فلا تغيير بلا أثر ولا أثر بلا تغيير).
  if not exists (select 1 from public.plans where slug = p_plan_slug) then
    raise exception 'plan not found';
  end if;

  if not exists (select 1 from public.teachers where id = p_teacher_id) then
    raise exception 'teacher not found';
  end if;

  select plan_slug into v_previous_slug
    from public.subscriptions
   where teacher_id = p_teacher_id;

  -- إدراج أو تحديث: الحالة القائمة تُحفظ عند التحديث (لا إعادة
  -- ضبط صامتة لحالة اشتراك شغّال)، وصف جديد يأخذ افتراضي الجدول.
  insert into public.subscriptions (teacher_id, plan_slug, trial_ends_at)
  values (p_teacher_id, p_plan_slug, p_trial_ends_at)
  on conflict (teacher_id) do update
     set plan_slug = excluded.plan_slug,
         trial_ends_at = excluded.trial_ends_at,
         updated_at = now();

  -- الأثر في سجل تدقيق المنصة — في نفس المعاملة.
  insert into public.platform_audit_log
    (admin_user_id, action, target_teacher_id, details)
  values (auth.uid(), 'subscription_plan_changed', p_teacher_id,
          jsonb_build_object('plan_slug', p_plan_slug,
                             'previous_plan_slug', v_previous_slug,
                             'trial_ends_at', p_trial_ends_at));

  return p_teacher_id;
end $$;

revoke execute on function public.platform_set_subscription_plan(uuid, text, timestamptz) from public, anon;
grant execute on function public.platform_set_subscription_plan(uuid, text, timestamptz) to authenticated;

commit;

-- ============================================================================
-- نهاية 0061 — بلا جداول جديدة | دوال: platform_workspaces /
-- platform_indicators / platform_set_account_activated /
-- platform_set_subscription_plan. ترتيب التطبيق بعد 0060.
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ⚠️ expected_revenue = null حتى يعتمد المالك الأسعار (م1) — لا رقم
--    مخترع في اللوحة أبداً.
-- ============================================================================
