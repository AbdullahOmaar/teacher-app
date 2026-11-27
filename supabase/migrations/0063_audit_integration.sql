-- ============================================================================
-- 0063 — تكامل سجل التدقيق (Phase 2 T23 — 3A-898، الخطوة 6 من خطة الأدمن)
-- ----------------------------------------------------------------------------
-- الخطوات 1–5 و7 بنت أفعال الأدمن (أساس/قائمة سماح/باقات/تجاوزات/
-- إنفاذ حدود/لوحة)، وسجل التدقيق نفسه موجود من 0055. هذه المهاجرة
-- تجعل السجل **كاملاً**: كل فعل أدمن يترك سطراً، واللوحة تعرض السجل.
--
-- مصفوفة التغطية (مُدقَّقة بقراءة كل مهاجرة وكل موقع استدعاء عميل):
-- • موثّق أصلاً — لا تكرار هنا (يُتحقق فقط في قسم authz الحي):
--     - override_set / override_revoked (0059: RPCs التعيين/الإلغاء)
--     - account_activated / account_deactivated (0061: مفتاح التفعيل)
--     - subscription_plan_changed (0061: تعيين الباقة)
--     - مفاتيح التأكيد الأربعة (0060: بلا RPCs خاصة — تمر عبر
--       set_account_override فتُوثَّق كـ override_set تلقائياً)
-- • الفجوات التي تسدّها هذه المهاجرة:
--     - allowlist_added / allowlist_removed: إضافة/حذف صف سماح كان
--       كتابة جدول مباشرة عبر RLS (0057) من اللوحة بلا أي أثر —
--       الآن RPCs إدارية هي مسار الكتابة الوحيد (العميل يتحول إليها،
--       وسياسات RLS على الجدول تبقى كدفاع ثانٍ).
--     - registration_open_changed: قلب قفل التسجيل لم يوجد له RPC
--       إطلاقاً (0057: عرض فقط في اللوحة، والقلب فعل service role /
--       SQL بلا أثر) — الآن platform_set_registration_open() هو
--       المسار الموثّق، والواجهة تحصل على زر قلب لأول مرة.
-- • بلا تدقيق بالتصميم (موثّق هنا حتى لا يُقرأ غيابه فجوة):
--     - القراءات كلها (workspaces/indicators/subscriptions/
--       effective_entitlements/usage_summary): سجل التدقيق يسجّل
--       أفعالاً تغيّر حالة، لا قراءات.
--     - عدّادات الاستخدام (0062): تحديثات نظامية بمحفّزات/دوال
--       خادمية، لا فعل أدمن — لا سطر لها.
--     - can_self_register / create_teacher_profile_for_self
--       (0057): خدمة ذاتية للمدرس نفسه، لا فعل أدمن.
--     - منح حسابات الأدمن (platform_admins): إدراج service role /
--       SQL فقط بلا جلسة عميل — لا RPC موثّق لها هنا؛ إجراء البذرة
--       في docs/PLATFORM-ADMIN-FOUNDATION.md يسجّل المنح يدوياً في
--       ملاحظة البذرة نفسها.
--
-- • `log_platform_audit(...)`: مسار الكتابة القانوني الوحيد الجديد —
--   دالة SECURITY DEFINER بحارس أدمن تدرج باسمه قسراً؛ الدوال
--   السابقة (0059/0061) تحتفظ بإدراجاتها المباشرة كما هي (تعمل في
--   نفس المعاملة أصلاً) — لا إعادة صياغة لتاريخ مراجَع.
-- • `platform_audit_log_list(...)`: قراءة السجل للأدمن فقط — أحدث
--   أولاً، بمرشّحي حساب/فعل، مع عدّ إجمالي واسم عرض للفاعل
--   (من raw_user_meta_data أو البريد) واسم الحساب الهدف.
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): مهاجرة كود فقط — لا
-- تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 + بوابة QA. العميل
-- يتحمّل غياب دوالها (قسم السجل يعرض «قريباً»، وإضافة/حذف السماح
-- وقلب القفل يخطئان بخطأ مصمم) حتى البوابة. قسم authz الحي الخاص
-- بها في scripts/authz_tests.py يتخطى نفسه بتوثيق صريح ما دامت
-- دوالها غائبة.
-- ترتيب التطبيق بعد 0062 (تعتمد is_platform_admin() وجداول
-- platform_settings / teacher_allowlist / platform_audit_log).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) مسار كتابة التدقيق القانوني — حارس أدمن + اسم الفاعل قسراً
-- ---------------------------------------------------------------------------
create or replace function public.log_platform_audit(
  p_action text,
  p_target_teacher_id uuid,
  p_details jsonb default '{}'::jsonb
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

  if p_action is null or char_length(btrim(p_action)) = 0 then
    raise exception 'audit action is required';
  end if;

  insert into public.platform_audit_log
    (admin_user_id, action, target_teacher_id, details)
  values (auth.uid(), p_action, p_target_teacher_id,
          coalesce(p_details, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function public.log_platform_audit(text, uuid, jsonb) from public, anon;
grant execute on function public.log_platform_audit(text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) قائمة السماح عبر RPCs موثّقة — مسار الكتابة الوحيد من اللوحة
--    (سياسات RLS على الجدول من 0057 تبقى كدفاع ثانٍ لا كمسار أول)
-- ---------------------------------------------------------------------------
create or replace function public.platform_allowlist_add(
  p_email text,
  p_phone text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if v_email is null and v_phone is null then
    raise exception 'allowlist entry needs an email or a phone';
  end if;

  -- نفس التطبيع الذي تقارن به بوابة 0057: البريد بلا حالة، والهاتف
  -- مقصوص — فلا يفوت التطابق بسبب مسافة أو حرف كبير.
  if v_email is not null then
    v_email := lower(v_email);
  end if;

  insert into public.teacher_allowlist (email, phone, note, added_by)
  values (v_email, v_phone, nullif(btrim(coalesce(p_note, '')), ''),
          auth.uid())
  returning id into v_id;

  -- الأثر في سجل التدقيق — في نفس المعاملة، عبر المسار القانوني.
  perform public.log_platform_audit(
    'allowlist_added', null,
    jsonb_build_object('email', v_email, 'phone', v_phone,
                       'note', p_note, 'allowlist_id', v_id));

  return v_id;
end $$;

revoke execute on function public.platform_allowlist_add(text, text, text) from public, anon;
grant execute on function public.platform_allowlist_add(text, text, text) to authenticated;

create or replace function public.platform_allowlist_remove(
  p_allowlist_id uuid
)
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

  select email, phone, note
    into v_row
    from public.teacher_allowlist
   where id = p_allowlist_id;

  if not found then
    raise exception 'allowlist entry not found';
  end if;

  -- الحذف أولاً ثم الأثر — السطر يوثّق ما حُذف لا ما سيُحذف، وكلاهما
  -- في نفس المعاملة فلا حذف بلا أثر أبداً.
  delete from public.teacher_allowlist where id = p_allowlist_id;

  perform public.log_platform_audit(
    'allowlist_removed', null,
    jsonb_build_object('email', v_row.email, 'phone', v_row.phone,
                       'note', v_row.note,
                       'allowlist_id', p_allowlist_id));

  return p_allowlist_id;
end $$;

revoke execute on function public.platform_allowlist_remove(uuid) from public, anon;
grant execute on function public.platform_allowlist_remove(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) قلب قفل التسجيل — أول مسار موثّق له (كان فعل service role بلا أثر)
-- ---------------------------------------------------------------------------
create or replace function public.platform_set_registration_open(
  p_open boolean,
  p_reason text default null
)
returns boolean
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

  select (value)::text = 'true' into v_previous
    from public.platform_settings
   where key = 'registration_open';

  -- إدراج أو تحديث: المفتاح بذرة 0057 موجود عادة؛ الـ upsert يغطي
  -- حالة حذفه الإداري دون كسر الدالة.
  insert into public.platform_settings (key, value, updated_by)
  values ('registration_open', to_jsonb(p_open), auth.uid())
  on conflict (key) do update
     set value = excluded.value,
         updated_by = excluded.updated_by,
         updated_at = now();

  perform public.log_platform_audit(
    'registration_open_changed', null,
    jsonb_build_object('open', p_open, 'previous', v_previous,
                       'reason', p_reason));

  return p_open;
end $$;

revoke execute on function public.platform_set_registration_open(boolean, text) from public, anon;
grant execute on function public.platform_set_registration_open(boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) قراءة سجل التدقيق — الأدمن فقط، أحدث أولاً، بمرشّحات وعدّ إجمالي
-- ---------------------------------------------------------------------------
create or replace function public.platform_audit_log_list(
  p_limit int default 50,
  p_offset int default 0,
  p_teacher_id uuid default null,
  p_action text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  return jsonb_build_object(
    'total', (
      select count(*) from public.platform_audit_log a
       where (p_teacher_id is null or a.target_teacher_id = p_teacher_id)
         and (p_action is null or a.action = p_action)
    ),
    'rows', coalesce((
      select jsonb_agg(row order by row.created_at desc)
        from (
          select
            a.id,
            a.admin_user_id,
            -- اسم عرض الفاعل: display_name من بيانات المستخدم، وإلا
            -- البريد، وإلا null (حساب محذوف — اللقطة في details تبقى
            -- الشاهد إن وُجدت؛ السجل نفسه لا يُعدَّل أبداً).
            coalesce(
              nullif(u.raw_user_meta_data ->> 'display_name', ''),
              u.email
            ) as admin_label,
            a.action,
            a.target_teacher_id,
            t.display_name as target_label,
            a.details,
            a.created_at
          from public.platform_audit_log a
          left join auth.users u on u.id = a.admin_user_id
          left join public.teachers t on t.id = a.target_teacher_id
         where (p_teacher_id is null or a.target_teacher_id = p_teacher_id)
           and (p_action is null or a.action = p_action)
         order by a.created_at desc
         limit v_limit offset v_offset
        ) row
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.platform_audit_log_list(int, int, uuid, text) from public, anon;
grant execute on function public.platform_audit_log_list(int, int, uuid, text) to authenticated;

commit;

-- ============================================================================
-- نهاية 0063 — بلا جداول جديدة | دوال: log_platform_audit /
-- platform_allowlist_add / platform_allowlist_remove /
-- platform_set_registration_open / platform_audit_log_list.
-- ترتيب التطبيق بعد 0062.
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ⚠️ إضافة/حذف السماح وقلب القفل عبر RPCs الجديدة وحدها من اللوحة —
--    الكتابة المباشرة للجدول من العميل متوقفة في هذه الخطوة (سياسات
--    RLS تبقى دفاعاً ثانياً).
-- ============================================================================
