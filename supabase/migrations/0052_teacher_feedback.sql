-- ============================================================================
-- 0052 — قناة ملاحظات المدرس (Phase 2 T11 — 3A-715، بند 2 / ج11-2)
-- ----------------------------------------------------------------------------
-- لم تكن هناك أي قناة يصل بها صوت المدرس إلى المدير من داخل التطبيق:
-- لا جدول، لا شاشة، لا عدّاد. هذه المهاجرة تبني القناة كاملة بقاعدة
-- البيانات + سياسات RLS فقط — **بلا أي دالة Edge** (درس CORS المؤكد
-- 2026-11-25: أي سطح متصفحي جديد عبر دالة كان سيولد معطّلاً):
--
-- • الجدول `teacher_feedback`: نص + نوع (اقتراح/مشكلة/إشادة/أخرى)
--   + حالة (جديدة/مقروءة/مغلقة) + كاتبها (auth.uid() وقت الإرسال).
-- • القراءة وتغيير الحالة للمالك فقط عبر is_teacher_owner (سياسات
--   SELECT/UPDATE) — لا يرى مساعدٌ ملاحظات الحساب ولا يقرأها غير صاحبه.
-- • الإدخال عبر RPC ‏security definer بـ search_path مثبّت + حارس
--   auth.uid(): يقبل من مالك الحساب أو عضو نشط فيه فقط، ويُجبر
--   teacher_id/author على جلسة المتصل (لا انتحال لحساب آخر).
-- • عدّاد «غير المقروء» للمدير = عدد الصفوف بحالة 'new' لكل حساب —
--   يظهر شارةً على مدخل «المزيد» للمالك، ويقرأه مدير المنصة تجميعياً
--   من الجدول مباشرة (لا واجهة إدارة منصة داخل التطبيق بالتصميم).
-- • الجدول يُضاف لقائمة delete_my_teacher_account (قاعدة 0046).
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): هذه المهاجرة تُراجع وتُدمج
-- في الكود فقط — لا تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 وبعد
-- بوابة QA. قسم authz الحي الخاص بها مكتوب كاملاً في scripts/authz_tests.py
-- ويتخطى نفسه بتوثيق صريح ما دام الجدول غائباً.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) جدول ملاحظات المدرس
-- ---------------------------------------------------------------------------
create table public.teacher_feedback (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references public.teachers (id) on delete cascade,
  author_user_id  uuid not null references auth.users (id) on delete cascade,
  kind            text not null default 'suggestion'
                  check (kind in ('suggestion', 'problem', 'praise', 'other')),
  body            text not null check (char_length(btrim(body)) > 0),
  status          text not null default 'new'
                  check (status in ('new', 'read', 'closed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index teacher_feedback_teacher_status_idx
  on public.teacher_feedback (teacher_id, status, created_at desc);

create trigger teacher_feedback_updated_trg before update on public.teacher_feedback
  for each row execute function public.set_updated_at();

alter table public.teacher_feedback enable row level security;

-- القراءة للمالك فقط — حتى كاتب الملاحظة (مساعد) لا يقرأ قائمة الحساب
create policy teacher_feedback_owner_select on public.teacher_feedback
  for select using (public.is_teacher_owner(teacher_id));

-- تغيير الحالة (قراءة/إغلاق) للمالك فقط، وعلى صفوف حسابه فقط
create policy teacher_feedback_owner_update on public.teacher_feedback
  for update using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));

-- لا سياسة INSERT/DELETE مباشرة: الإدخال عبر RPC الإرسال وحده أدناه،
-- والحذف عبر حذف الحساب (cascade) فقط.
revoke all on public.teacher_feedback from public, anon, authenticated;
grant select, update on public.teacher_feedback to authenticated;
grant all on public.teacher_feedback to service_role;

-- ---------------------------------------------------------------------------
-- 2) RPC إرسال ملاحظة — مالك الحساب أو عضو نشط فيه فقط
-- ---------------------------------------------------------------------------
create or replace function public.submit_teacher_feedback(
  p_teacher_id uuid,
  p_kind text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.teacher_feedback;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not (
    public.is_teacher_owner(p_teacher_id)
    or exists (
      select 1 from public.teacher_members m
      where m.teacher_id = p_teacher_id
        and m.user_id = v_uid
        and m.status = 'active')
  ) then
    raise exception 'only the centre owner or an active member can send feedback';
  end if;
  if p_kind is null or p_kind not in ('suggestion', 'problem', 'praise', 'other') then
    raise exception 'invalid feedback kind';
  end if;
  if p_body is null or char_length(btrim(p_body)) = 0 then
    raise exception 'feedback body is required';
  end if;
  if char_length(p_body) > 4000 then
    raise exception 'feedback body too long';
  end if;

  insert into public.teacher_feedback (teacher_id, author_user_id, kind, body)
  values (p_teacher_id, v_uid, p_kind, btrim(p_body))
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id, 'kind', v_row.kind, 'status', v_row.status,
    'created_at', v_row.created_at);
end $$;

revoke execute on function public.submit_teacher_feedback(uuid, text, text)
  from public, anon;
grant execute on function public.submit_teacher_feedback(uuid, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3) delete_my_teacher_account: إعادة إنشاء نسخة 0051 + teacher_feedback
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
    'teacher_feedback'
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
-- نهاية 0052 — جدول جديد: teacher_feedback | RPC: submit_teacher_feedback
-- | سياسات RLS: قراءة/تحديث حالة للمالك فقط، إدخال عبر الـ RPC فقط.
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ============================================================================
