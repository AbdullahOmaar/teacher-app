-- ============================================================================
-- 0048 — المساعد المنفّذ: سجل التشغيلات + آلة التأكيد (Phase 2 T6 — خطة ب)
-- ----------------------------------------------------------------------------
-- قرار المدير ق1 (2026-11-25 ~01:07 EET): التنفيذ بلا إطار — كود صريح
-- على بنية التطبيق الحالية (نمط دوال الواتساب 0045). هذه المهاجرة تبني
-- ما لا يحتاج مزوّد ذكاء (ق5 عند المالك — لا نداء نموذج في هذه الجولة):
--
-- • assistant_runs: سجل تدقيق تشغيلات المساعد وآلة حالات التأكيد معاً —
--   كل قراءة مجابة، وكل إجراء مقترح يمر: proposed ← confirmed ← executed
--   (أو cancelled/stopped/expired/failed). التوصية (ب) من وثيقة التجهيز
--   PHASE2-T6-PREP §2-5: جدول مستقل عن activity_log البشري.
-- • القراءة للمالك فقط (is_teacher_owner)؛ لا كتابة مباشرة من العميل
--   إطلاقاً: لا منح إدخال/تعديل/حذف لـ authenticated، والكتابة الوحيدة
--   عبر دوال RPC محروسة (security definer + search_path مثبّت + حارس
--   auth.uid()) تستدعيها دالة Edge ‏assistant-chat بتوكن المستدعي نفسه.
-- • التأكيد مرتبط بهاش الحمولة المخزّنة خادمياً: التأكيد لا يقبل إلا
--   الهاش المطابق للحمولة المخزّنة، والتنفيذ يقرأ الحمولة المخزّنة لا
--   ما يرسله العميل عند التنفيذ — فلا تبديل للحمولة بعد المعاينة.
-- • assistant_runs يُضاف لقائمة جداول delete_my_teacher_account
--   (إعادة إنشاء الدالة بنسخة 0047 + الجدول الجديد) — تعليق 0046 يفرض
--   إضافة أي جدول جديد بـ teacher_id هنا.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) جدول تشغيلات المساعد / آلة التأكيد
-- ---------------------------------------------------------------------------
create table public.assistant_runs (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.teachers (id) on delete cascade,
  actor_user_id uuid not null,
  actor_role    text not null check (actor_role in ('owner', 'assistant')),
  kind          text not null check (kind in ('read', 'action')),
  tool          text not null,
  request_text  text,
  payload       jsonb,
  payload_hash  text,
  status        text not null check (status in (
                  'answered', 'proposed', 'confirmed', 'executed',
                  'cancelled', 'stopped', 'expired', 'failed')),
  result        jsonb,
  error         text,
  expires_at    timestamptz,
  confirmed_at  timestamptz,
  executed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index assistant_runs_teacher_created_idx
  on public.assistant_runs (teacher_id, created_at desc);

alter table public.assistant_runs enable row level security;

-- المالك يرى الكل؛ لا سياسات كتابة لأي عميل — الكتابة عبر RPC فقط
create policy assistant_runs_owner_select on public.assistant_runs
  for select using (public.is_teacher_owner(teacher_id));

create trigger assistant_runs_updated_trg
  before update on public.assistant_runs
  for each row execute function public.set_updated_at();

-- المنح الصريحة (قاعدة ما بعد Data API 2026): قراءة فقط لـ authenticated
-- (السياسة فوق تحصرها في المالك)، ولا شيء لـ anon.
revoke all on public.assistant_runs from public, anon, authenticated;
grant select on public.assistant_runs to authenticated;
grant all on public.assistant_runs to service_role;

-- ---------------------------------------------------------------------------
-- 2) حارس الممثل: دور المستدعي داخل سنتر (داخلي — لا تنفيذ للعملاء)
-- ---------------------------------------------------------------------------
create or replace function public.assistant_actor_role(p_teacher_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when public.is_teacher_owner(p_teacher_id) then 'owner'
    when exists (
      select 1 from public.teacher_members m
      where m.teacher_id = p_teacher_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    ) then 'assistant'
    else null
  end;
$$;

revoke execute on function public.assistant_actor_role(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) تسجيل قراءة مجابة (أدوات القراءة الحتمية — بلا أي كتابة أعمال)
-- ---------------------------------------------------------------------------
create or replace function public.assistant_begin_read(
  p_teacher_id uuid,
  p_tool text,
  p_request text,
  p_result jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_role text := public.assistant_actor_role(p_teacher_id);
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if v_role is null then
    raise exception 'not authorized for this teacher';
  end if;
  insert into public.assistant_runs
    (teacher_id, actor_user_id, actor_role, kind, tool, request_text, status, result)
  values
    (p_teacher_id, auth.uid(), v_role, 'read', p_tool, p_request, 'answered', p_result)
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.assistant_begin_read(uuid, text, text, jsonb) from public, anon;
grant execute on function public.assistant_begin_read(uuid, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) إنشاء مقترح إجراء (لا ينفّذ شيئاً — يخزّن الحمولة وهاشها وانتهاءها)
-- ---------------------------------------------------------------------------
create or replace function public.assistant_create_proposal(
  p_teacher_id uuid,
  p_tool text,
  p_request text,
  p_payload jsonb,
  p_payload_hash text,
  p_ttl_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_role text := public.assistant_actor_role(p_teacher_id);
  v_id uuid;
  v_expires timestamptz := now() + make_interval(
    secs => greatest(30, least(coalesce(p_ttl_seconds, 600), 3600)));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if v_role is null then
    raise exception 'not authorized for this teacher';
  end if;
  if p_payload is null or p_payload_hash is null or length(p_payload_hash) <> 64 then
    raise exception 'payload and its sha-256 hash are required';
  end if;
  insert into public.assistant_runs
    (teacher_id, actor_user_id, actor_role, kind, tool, request_text,
     payload, payload_hash, status, expires_at)
  values
    (p_teacher_id, auth.uid(), v_role, 'action', p_tool, p_request,
     p_payload, p_payload_hash, 'proposed', v_expires)
  returning id into v_id;
  return jsonb_build_object(
    'id', v_id, 'payload_hash', p_payload_hash, 'expires_at', v_expires);
end $$;

revoke execute on function public.assistant_create_proposal(uuid, text, text, jsonb, text, integer) from public, anon;
grant execute on function public.assistant_create_proposal(uuid, text, text, jsonb, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) تأكيد مقترح: المقترح نفسه فقط، هاش مطابق، غير منتهٍ — ويرجع الحمولة
--    المخزّنة خادمياً حتى ينفّذ المساعد ما عُرض فعلاً لا ما يُرسل لاحقاً.
-- ---------------------------------------------------------------------------
create or replace function public.assistant_confirm_proposal(
  p_run_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_run public.assistant_runs;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select * into v_run from public.assistant_runs where id = p_run_id;
  if not found then
    raise exception 'run not found';
  end if;
  if v_run.actor_user_id <> auth.uid() then
    raise exception 'only the proposer can confirm';
  end if;
  if v_run.status = 'proposed'
     and v_run.expires_at is not null and v_run.expires_at < now() then
    update public.assistant_runs set status = 'expired' where id = p_run_id;
    raise exception 'proposal expired';
  end if;
  if v_run.status <> 'proposed' then
    raise exception 'proposal not pending';
  end if;
  if v_run.payload_hash is distinct from p_payload_hash then
    raise exception 'payload hash mismatch';
  end if;
  update public.assistant_runs
  set status = 'confirmed', confirmed_at = now()
  where id = p_run_id;
  return jsonb_build_object(
    'id', v_run.id, 'teacher_id', v_run.teacher_id,
    'tool', v_run.tool, 'payload', v_run.payload);
end $$;

revoke execute on function public.assistant_confirm_proposal(uuid, text) from public, anon;
grant execute on function public.assistant_confirm_proposal(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) إتمام تشغيل مؤكد: executed أو failed (من confirmed فقط، وبنفس الممثل)
-- ---------------------------------------------------------------------------
create or replace function public.assistant_complete_run(
  p_run_id uuid,
  p_success boolean,
  p_result jsonb default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_run public.assistant_runs;
  v_status text := case when p_success then 'executed' else 'failed' end;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select * into v_run from public.assistant_runs where id = p_run_id;
  if not found then
    raise exception 'run not found';
  end if;
  if v_run.actor_user_id <> auth.uid() then
    raise exception 'only the proposer can complete the run';
  end if;
  if v_run.status <> 'confirmed' then
    raise exception 'run is not confirmed';
  end if;
  update public.assistant_runs
  set status = v_status,
      result = p_result,
      error = p_error,
      executed_at = case when p_success then now() else executed_at end
  where id = p_run_id;
  return jsonb_build_object('id', v_run.id, 'status', v_status);
end $$;

revoke execute on function public.assistant_complete_run(uuid, boolean, jsonb, text) from public, anon;
grant execute on function public.assistant_complete_run(uuid, boolean, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) إلغاء/إيقاف مقترح معلّق: المقترح نفسه أو مالك السنتر — من proposed
--    أو confirmed فقط. دلالته البنيوية: صفر كتابات أعمال (التنفيذ لا
--    يحدث إلا بعد confirmed عبر complete لاحقاً، والإلغاء يغلق الباب).
-- ---------------------------------------------------------------------------
create or replace function public.assistant_cancel_run(
  p_run_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_run public.assistant_runs;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_reason not in ('cancelled', 'stopped') then
    raise exception 'reason must be cancelled or stopped';
  end if;
  select * into v_run from public.assistant_runs where id = p_run_id;
  if not found then
    raise exception 'run not found';
  end if;
  if v_run.actor_user_id <> auth.uid()
     and not public.is_teacher_owner(v_run.teacher_id) then
    raise exception 'not authorized to cancel this run';
  end if;
  if v_run.status not in ('proposed', 'confirmed') then
    raise exception 'run already finished';
  end if;
  update public.assistant_runs set status = p_reason where id = p_run_id;
  return jsonb_build_object('id', v_run.id, 'status', p_reason);
end $$;

revoke execute on function public.assistant_cancel_run(uuid, text) from public, anon;
grant execute on function public.assistant_cancel_run(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) delete_my_teacher_account: إعادة إنشاء نسخة 0047 + assistant_runs
--    في قائمة الجداول (تعليق 0046: أي جدول جديد بـ teacher_id يُضاف هنا).
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
    'whatsapp_message_log', 'assistant_runs'
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
