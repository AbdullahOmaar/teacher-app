-- ============================================================================
-- 0053 — سجل أخطاء الإنتاج الداخلي (Phase 2 T11 — 3A-715، بند 3 / فجوة 21)
-- ----------------------------------------------------------------------------
-- فجوة QA 21: لا قياس أخطاء إنتاجياً — ErrorBoundary كان يطبع في وحدة
-- التحكم فقط، فلا يعرف أحد أن مدرساً حقيقياً اصطدم بخطأ. القرار المديري
-- (2026-11-25): سجل داخلي في قاعدة بياناتنا نفسها — لا Sentry ولا أي
-- حساب/مفتاح خارجي، والبيانات لا تغادر المنصة:
--
-- • الجدول `error_reports`: نوع الخطأ (تصيير/غير مُعالج/وعد مرفوض) +
--   رسالة + أثر مكدّس مقصوص + المسار (pathname فقط) + إصدار التطبيق.
--   **لا بيانات مدرس حساسة بالتصميم**: المُرسِل العميل يُجرّد الحمولة
--   (لا قيم مدخلات، لا بريد، لا توكنات) والخادم يقصّ الأطوال قسراً.
-- • الاستقبال عبر RPC ‏security definer وحده (`report_client_error`):
--   حارسه هو التحقق الصارم من المدخلات + قصّ الأطوال (دالة استقبال
--   سجلّات بطبيعتها — قد يعمل قبل تسجيل الدخول)، وteacher_id لا يُقبل
--   إلا إن كان المتصل مالكه/عضواً نشطاً فيه أو غائباً (خطأ قبل السياق).
-- • القراءة للمالك فقط عبر is_teacher_owner — عدّاد الإعدادات اليومي
--   وتنبيه العتبة يقرآن صفوف حساب المالك وحده؛ صفوف بلا سياق مدرس
--   (teacher_id null) لا يقرأها أي عميل — يراها مدير المنصة من القاعدة.
-- • عتبة التنبيه الافتراضية: 10 أخطاء/يوم للحساب (ثابت موثق في
--   src/lib/errorReporter.ts ‏ERROR_ALERT_THRESHOLD — يُراجع بعد البايلوت).
-- • الجدول يُضاف لقائمة delete_my_teacher_account (قاعدة 0046).
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): هذه المهاجرة تُراجع وتُدمج
-- في الكود فقط — لا تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 وبعد
-- بوابة QA. قسم authz الحي الخاص بها في scripts/authz_tests.py يتخطى
-- نفسه بتوثيق صريح ما دام الجدول غائباً، والمُرسِل العميل يبقى صامتاً
-- (مصير واضح في وحدة التحكم فقط) حتى التطبيق.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) جدول سجل الأخطاء
-- ---------------------------------------------------------------------------
create table public.error_reports (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid references public.teachers (id) on delete cascade,
  reporter_user_id uuid references auth.users (id) on delete set null,
  kind             text not null check (kind in ('render', 'unhandled', 'rejection')),
  message          text not null check (char_length(message) between 1 and 2000),
  stack            text check (stack is null or char_length(stack) <= 8000),
  route            text check (route is null or char_length(route) <= 300),
  app_version      text check (app_version is null or char_length(app_version) <= 40),
  created_at       timestamptz not null default now()
);
create index error_reports_teacher_created_idx
  on public.error_reports (teacher_id, created_at desc);
create index error_reports_created_idx
  on public.error_reports (created_at desc);

alter table public.error_reports enable row level security;

-- القراءة للمالك فقط، وعلى صفوف حسابه فقط (صفوف teacher_id null لا
-- يقرأها أي عميل — is_teacher_owner(null) ترجع false بطبيعتها)
create policy error_reports_owner_select on public.error_reports
  for select using (public.is_teacher_owner(teacher_id));

-- لا سياسات INSERT/UPDATE/DELETE مباشرة: الاستقبال عبر RPC الاستقبال
-- وحده أدناه، والحذف عبر حذف الحساب (cascade) أو إدارة المنصة.
revoke all on public.error_reports from public, anon, authenticated;
grant select on public.error_reports to authenticated;
grant all on public.error_reports to service_role;

-- ---------------------------------------------------------------------------
-- 2) RPC استقبال خطأ — تحقق صارم + قصّ قسري، بلا ثقة في العميل
-- ---------------------------------------------------------------------------
create or replace function public.report_client_error(
  p_teacher_id uuid,
  p_kind text,
  p_message text,
  p_stack text,
  p_route text,
  p_app_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.error_reports;
begin
  if p_kind is null or p_kind not in ('render', 'unhandled', 'rejection') then
    raise exception 'invalid error kind';
  end if;
  if p_message is null or char_length(btrim(p_message)) = 0 then
    raise exception 'error message is required';
  end if;
  -- سياق المدرس لا يُنتحل: إما غائب (خطأ قبل حلّ الهوية) أو حساب
  -- يملكه المتصل/عضو نشط فيه فعلاً
  if p_teacher_id is not null and v_uid is not null and not (
    public.is_teacher_owner(p_teacher_id)
    or exists (
      select 1 from public.teacher_members m
      where m.teacher_id = p_teacher_id
        and m.user_id = v_uid
        and m.status = 'active')
  ) then
    raise exception 'teacher context does not belong to the reporter';
  end if;
  if p_teacher_id is not null and v_uid is null then
    raise exception 'anonymous reports carry no teacher context';
  end if;

  insert into public.error_reports
    (teacher_id, reporter_user_id, kind, message, stack, route, app_version)
  values (
    p_teacher_id,
    v_uid,
    p_kind,
    left(btrim(p_message), 2000),
    left(p_stack, 8000),
    left(p_route, 300),
    left(p_app_version, 40)
  )
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'created_at', v_row.created_at);
end $$;

-- دالة استقبال بطبيعتها: تعمل أيضاً قبل تسجيل الدخول (أخطاء شاشة
-- الدخول جزء من فجوة 21) — حارسها التحقق أعلاه لا الهوية.
revoke execute on function public.report_client_error(uuid, text, text, text, text, text)
  from public;
grant execute on function public.report_client_error(uuid, text, text, text, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) delete_my_teacher_account: إعادة إنشاء نسخة 0052 + error_reports
--    (قاعدة 0046: أي جدول جديد بـ teacher_id يُضاف هنا.)
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
    'sales', 'sale_lines',
    'teacher_feedback',
    'error_reports'
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
-- نهاية 0053 — جدول جديد: error_reports | RPC: report_client_error
-- | سياسات RLS: قراءة للمالك فقط، استقبال عبر الـ RPC فقط.
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ============================================================================
