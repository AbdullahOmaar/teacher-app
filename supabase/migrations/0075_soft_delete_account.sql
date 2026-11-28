-- ===========================================================================
-- 0075 — الحذف الناعم لحساب المدرّس + حجة تأكيد خادمية (F1 من اختبار سند
-- الأمني، 2026-11-28 — أعلى ثغرة في التقرير)
-- ---------------------------------------------------------------------------
-- المشكلة (F1): ‏delete_my_teacher_account (0046، آخر نسخة 0065) يحذف
-- الحساب وكل بياناته **نهائياً وفوراً** بمجرد استدعاء الـ RPC — إعادة
-- إدخال كلمة السر كانت خطوة في العميل فقط، فأي جلسة مسروقة (JWT صالح)
-- تستدعي الدالة مباشرة وتتجاوزها، ولا توجد حجة تأكيد ولا أي رجعة.
--
-- الإصلاح (ثلاث طبقات، كلها هنا خادمياً):
-- 1) **حجة تأكيد إلزامية**: التوقيع الجديد يأخذ p_confirmation ويجب أن
--    تطابق بريد حساب الدخول نفسه (مقارنة بلا حساسية لحالة الأحرف) —
--    النداء بلا تأكيد مطابق يُرفض بـ 'confirmation mismatch' قبل أي
--    تغيير. (إعادة إدخال كلمة السر تبقى خطوة العميل قبل النداء كما هي
--    منذ 0046 — ‏signInWithPassword في deleteAccount.ts.)
-- 2) **حذف ناعم لا نهائي**: بدل حذف الصفوف والمستخدم، تُعلَّم كل سناتر
--    المالك بـ teachers.deleted_at = now() ويبقى كل شيء كما هو داخل
--    نافذة سماح 30 يوماً (purge_after في التقرير) — لا حذف فعلي هنا.
-- 3) **قطع الوصول فوراً**: تُحذف جلسات Auth كلها (auth.sessions —
--    فيبطل التحديث على كل الأجهزة)، ويُحظر الدخول بـ banned_until
--    بعيد، ويُعاد تعريف is_teacher_owner / member_has_permission
--    بشرط deleted_at is null فيسقط أي JWT ما زال صالحاً عن كل بيانات
--    السنتر (مالكاً وأعضاءً) عبر سياسات RLS القائمة دون لمسها،
--    وتُعطَّل حسابات بوابات أولياء الأمور/الطلاب (portal_accounts)
--    التابعة للسناتر المحذوفة.
--
-- ما لا تفعله هذه المهاجرة (متابعة موثقة في docs/SECURITY-F1-F6.md):
-- • التصفية النهائية (purge) بعد انقضاء نافذة السماح: مهمة مجدولة
--   لاحقة تعيد استخدام منطق الحذف النهائي القديم (قائمة جداول 0065).
-- • الاستعادة داخل النافذة: يدوياً من إدارة المنصة (مسح deleted_at +
--   banned_until) حتى تُبنى واجهتها — لا مسار استعادة ذاتياً هنا.
--
-- الحراس القدامى يبقون حرفياً: بلا جلسة ⇒ رفض، بلا ملف مدرس ⇒ رفض،
-- والحساب التجريبي العام مرفوض صراحةً. ونداء ثانٍ بعد الحذف الناعم
-- يُرفض بـ 'account already deleted' بدل إعادة تنفيذ صامتة.
--
-- ⚠️ التطبيق عند بوابة تجميد فيز 2 + QA فقط (قاعدة التجميد) — هذه
-- المهاجرة كود فقط حتى إشارة المدير.
-- ===========================================================================

-- 1) عمود الحذف الناعم على teachers.
alter table public.teachers
  add column if not exists deleted_at timestamptz;

-- 2) قطع الوصول في طبقة RLS: الملكية والعضوية تسقطان عن السنتر
--    المحذوف ناعماً (إعادة تعريف بنفس توقيع 0016/0001 + شرط واحد).
create or replace function public.is_teacher_owner(p_teacher_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.teachers t
    where t.id = p_teacher_id
      and t.owner_user_id = auth.uid()
      and t.deleted_at is null
  ) $$;

create or replace function public.is_teacher_member(p_teacher_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.teacher_members m
    join public.teachers t on t.id = m.teacher_id
    where m.teacher_id = p_teacher_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and t.deleted_at is null
  ) $$;

create or replace function public.member_has_permission(p_teacher_id uuid, p_perm text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.teacher_members m
    join public.teachers t on t.id = m.teacher_id
    where m.teacher_id = p_teacher_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and coalesce(m.permissions ->> p_perm, 'false') = 'true'
      and t.deleted_at is null
  ) $$;

-- 2ب) سياسة تحديث صف teachers نفسه: بلا هذا القيد يستطيع JWT ما زال
--     صالحاً أن يمسح deleted_at مباشرة عبر PostgREST فيستعيد الحساب
--     بنفسه متجاوزاً الحظر. التحديث على صف محذوف ناعماً ممنوع كلياً
--     (قراءته بـ teachers_self_select تبقى مسموحة حتى يعرض العميل
--     شاشة «الحساب محذوف» المصممة من قيمة deleted_at نفسها).
alter policy teachers_self_update on public.teachers
  using (owner_user_id = auth.uid() and deleted_at is null)
  with check (owner_user_id = auth.uid() and deleted_at is null);

-- 3) الدالة الجديدة: توقيع بحجة تأكيد — القديم بلا حجج يُسقَط حتى لا
--    يبقى مسار حذف بلا تأكيد قابلاً للاستدعاء بأي JWT.
drop function if exists public.delete_my_teacher_account();

create or replace function public.delete_my_teacher_account(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_primary_id uuid;
  v_now timestamptz := now();
  v_centres int := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- السنتر الأساسي: الصف التاريخي id = uid إن وُجد، وإلا أقدم سنتر
  -- مملوك (نفس قاعدة حلّ الهوية في العميل). غيابه = ليس مالكاً.
  select id into v_primary_id
  from public.teachers
  where owner_user_id = v_uid
  order by (id = v_uid) desc, created_at asc
  limit 1;
  if v_primary_id is null then
    raise exception 'no teacher profile';
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email = 'demo@teacher-app.com' then
    raise exception 'demo account cannot be deleted';
  end if;

  -- حذف ناعم قائم أصلاً؟ رفض صريح بدل نجاح وهمي.
  if exists (
    select 1 from public.teachers
    where owner_user_id = v_uid and deleted_at is not null
  ) then
    raise exception 'account already deleted';
  end if;

  -- حجة التأكيد: بريد الحساب نفسه كما يكتبه المالك في الواجهة.
  -- إصلاح QA على PR #71 (تعليق 7231230488): حساب هاتف فقط (بريد
  -- NULL) كان يتخطى التأكيد بحجة فارغة '' عبر coalesce(v_email, '') —
  -- البريد NULL أو الحجة الفارغة (بعد التقليم) يُرفضان صراحة قبل أي مسار حذف.
  if v_email is null
     or p_confirmation is null
     or btrim(p_confirmation) = ''
     or lower(btrim(p_confirmation)) <> lower(v_email) then
    raise exception 'confirmation mismatch';
  end if;

  -- الحذف الناعم: كل سناتر المالك تُعلَّم، والبيانات كلها تبقى.
  update public.teachers
  set deleted_at = v_now
  where owner_user_id = v_uid and deleted_at is null;
  get diagnostics v_centres = row_count;

  -- حسابات البوابات التابعة للسناتر المحذوفة تُعطَّل فوراً.
  update public.portal_accounts pa
  set is_active = false
  from public.teachers t
  where pa.teacher_id = t.id
    and t.owner_user_id = v_uid;

  -- قطع الجلسات على كل الأجهزة + حظر الدخول حتى نهاية النافذة
  -- (الرفع يدوي عند الاستعادة الموثقة — انظر الترويسة).
  delete from auth.sessions where user_id = v_uid;
  update auth.users
  set banned_until = v_now + interval '100 years'
  where id = v_uid;

  return jsonb_build_object(
    'teacher_id', v_primary_id,
    'soft_deleted', true,
    'deleted_at', v_now,
    'purge_after', v_now + interval '30 days',
    'centres_marked', v_centres
  );
end $$;

revoke execute on function public.delete_my_teacher_account(text) from public;
revoke execute on function public.delete_my_teacher_account(text) from anon;
grant execute on function public.delete_my_teacher_account(text) to authenticated;
