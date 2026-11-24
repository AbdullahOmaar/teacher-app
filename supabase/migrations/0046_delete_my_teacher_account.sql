-- ===========================================================================
-- 0046 — حذف الحساب من أوله لآخره (فجوة 32 من تقييم الـ45 — مهمة Phase 2 رقم 3)
-- ---------------------------------------------------------------------------
-- دالة واحدة بمعاملة ذرية واحدة: صفوف إثباتات الدفع في التخزين ← صف المدرس
-- (يتتابع عبر ON DELETE CASCADE إلى 40 جدولاً — القائمة الكاملة في
-- DELETION_TABLES أدناه، مطابقة لقيد FK الحي على teachers(id)) ← مستخدم
-- Auth نفسه (يتتابع إلى identities/sessions/mfa_factors/...).
--
-- لماذا دالة SQL لا Edge Function؟ لا قناة نشر دوال Edge في بيئة التنفيذ
-- هذه (لا supabase CLI)، ودالة SQL تُنشر بمسار الهجرات المعتاد
-- statement-by-statement، وتُختبر بنفس أدوات التحقق الحي. الحذف من
-- auth.users مباشرةً هو البديل الموثق لحذف الذات (لا Admin API من
-- العميل)؛ قيود FK في مخطط auth كلها CASCADE عدا SET NULL، فلا يبقى
-- أثر للجلسات أو الهويات بعد الحذف — وتتحقق منه اختبارات الحذف.
--
-- الحراس (تُنفَّذ داخل الدالة، لا في العميل وحده):
-- • auth.uid() غائب ⇒ رفض. لا صف مدرس للمالك ⇒ رفض.
-- • الحساب التجريبي العام (demo@teacher-app.com) مرفوض صراحةً — بياناته
--   معلنة وكلمة سره معروفة، وحذفه يدمر خط أساس الديمو. العميل يخفي
--   البطاقة عنه أيضاً، لكن الحارس هنا هو الضمان الحقيقي.
-- • الأعضاء (teacher_members) ليسوا مالكين: الدالة تبحث عن صف teachers
--   بـ owner_user_id = auth.uid()، فعضو الفريق بلا صف مدرس يُرفض.
--
-- ملاحظة التخزين (قيد موثق): حذف صف storage.objects لا يحذف الملف نفسه
-- من الـ bucket — الملف يبقى يتيماً غير قابل للوصول في bucket خاص
-- (payment-proofs) بلا أي صف يشير إليه. تنظيفه الدوري: مقارنة محتويات
-- الـ bucket بمعرّفات المدرسين الأحياء (مهمة لاحقة، لا تحجب الحذف).
--
-- الاستخدام من العميل: إعادة إدخال كلمة السر أولاً (signInWithPassword)
-- ثم استدعاء RPC واحد؛ بعد نجاحه يمسح العميل التخزين المحلي ويسجّل
-- الخروج. التقرير المُرجع: أعداد الصفوف المحذوفة لكل جدول + عدد كائنات
-- التخزين، للتدقيق لا للعرض.
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
  v_storage int := 0;
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

  -- 1) صفوف كائنات التخزين لإثباتات المدرس (المسار <teacher_id>/...).
  --    (الملفات نفسها تبقى أيتاماً غير قابلة للوصول — انظر الترويسة.)
  delete from storage.objects
  where bucket_id = 'payment-proofs'
    and name like v_teacher.id::text || '/%';
  get diagnostics v_storage = row_count;

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
    'storage_objects_deleted', v_storage
  );
end $$;

revoke execute on function public.delete_my_teacher_account() from public;
revoke execute on function public.delete_my_teacher_account() from anon;
grant execute on function public.delete_my_teacher_account() to authenticated;
