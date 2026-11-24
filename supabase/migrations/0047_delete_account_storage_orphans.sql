-- ===========================================================================
-- 0047 — تصحيح حذف الحساب: إثباتات الدفع تبقى أيتاماً موثقة (فجوة 32 — T3)
-- ---------------------------------------------------------------------------
-- تصحيح 0046: الحذف المباشر من storage.objects محظور بمشغّل
-- storage.protect_delete() (يرفض بـ 42501 إلا بجلسة تضبط
-- storage.allow_delete_query='true' — مخرج صيانة، لا يُستخدم داخل دالة
-- منتج). لذلك الدالة الجديدة لا تحذف صفوف التخزين: تعدّها فقط وتعيدها
-- في التقرير كـ storage_objects_orphaned. الملفات نفسها تبقى في الـ bucket
-- الخاص payment-proofs بلا أي صف في جداول التطبيق يشير إليها (صفوف
-- payment_proofs تُحذف بالتتابع) — غير قابلة للوصول من التطبيق، وتنظيفها
-- الدوري مهمة صيانة لاحقة بمفتاح الخدمة أو بمخرج الجلسة الموثق.
-- باقي الدالة مطابق لـ 0046 (حراس + تتابع 40 جدولاً + حذف مستخدم Auth).
-- ===========================================================================

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
  -- كل الجداول ذات FK إلى teachers(id) بـ ON DELETE CASCADE — مطابقة
  -- للقيد الحي (استعلام pg_constraint) وقت كتابة الهجرة. أي جدول جديد
  -- بـ teacher_id يجب أن يُضاف هنا وإلا ظهر في تقرير الفحص الدوري.
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
    'whatsapp_message_log'
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

  -- 1) عدّ كائنات إثباتات المدرس في التخزين (المسار <teacher_id>/...).
  --    لا حذف هنا: مشغّل storage.protect_delete() يمنع الحذف المباشر من
  --    storage.objects (42501). تبقى أيتاماً غير قابلة للوصول — انظر الترويسة.
  select count(*) into v_storage_orphaned
  from storage.objects
  where bucket_id = 'payment-proofs'
    and name like v_teacher.id::text || '/%';

  -- 2) عدّادات التقرير قبل الحذف المتتابع.
  foreach v_tbl in array v_tables loop
    execute format('select count(*) from public.%I where teacher_id = $1', v_tbl)
      using v_teacher.id into v_n;
    v_counts := v_counts || jsonb_build_object(v_tbl, v_n);
  end loop;

  -- 3) صف المدرس — يتتابع إلى الجداول الأربعين كلها.
  delete from public.teachers where id = v_teacher.id;

  -- 4) مستخدم Auth نفسه — يتتابع إلى الهويات والجلسات وعوامل MFA.
  --    (الترتيب مقصود: daily_closings.closed_by وpayment_proofs.reviewed_by
  --    بلا إجراء FK، فحذف المدرس أولاً يزيل صفوفهما قبل حذف المستخدم.)
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
