-- ============================================================================
-- 0065 — إعلانات المنصة + تذاكر الدعم (Phase 2 — T17 الباقي + T23،
--        الخطوة 8 من خطة الأدمن)
-- ----------------------------------------------------------------------------
-- • إعلانات المنصة: الأدمن ينشر تحديثات/صيانة مجدولة تظهر لكل المدرسين
--   داخل حساباتهم. القراءة للمدرس عبر RPC وحده (لا قراءة جدول مباشرة
--   عبر المستأجرين) — نفس نمط 0052 في تقييد القراءة، مع RPC نشر/حذف
--   إداريين موثّقين في سجل تدقيق المنصة.
-- • تذاكر الدعم: المدرس يفتح تذكرة من حسابه، والأدمن يرد عليها من
--   اللوحة، والرد يرجع جوه حساب المدرس (فوق قناة ملاحظات 0052 كمسار
--   حالات، لا قناة موازية لها). آلة الحالات:
--     new → (رد أدمن) waiting_teacher → (رد مدرس) in_progress
--     → (رد أدمن) waiting_teacher … → (إغلاق أدمن) closed.
--   الرد على تذكرة مغلقة مرفوض — تُفتح تذكرة جديدة بدلها.
-- • log_platform_audit(): تُعرَّف هنا بـ CREATE OR REPLACE بنفس
--   توقيع 0063 (الخطوة 6، PR #51) عمداً — التعريف متطابق دلالياً
--   فالاستبدال لا يغيّر شيئاً أيّاً كان ترتيب الدمج.
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): مهاجرة كود فقط — لا
-- تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 + بوابة QA. العميل
-- يتحمّل غياب جداولها ودوالها (أقسام اللوحة وصفحتا الدعم والإعلانات
-- تعرض «قريباً» مصممة) حتى البوابة. قسم authz الحي الخاص بها في
-- scripts/authz_tests.py يتخطى نفسه بتوثيق صريح ما دامت غائبة.
-- ترتيب التطبيق بعد 0063 (تعتمد is_platform_admin() من 0055 و
-- platform_audit_log من 0055 وis_teacher_owner() من 0016).
-- ⚠️ ترقيم: هذه 0065 لا 0064 — الرقم 0064 صار مهاجرة حدّ الفريق
-- المدموجة في main (PR #47، 0064_team_limit_enforcement). وPR #51
-- (الخطوة 6) مهاجرتها 0063 تصادمت مع 0063 قوالب الأدوار المدموجة
-- (PR #46) والـPR حالياً CONFLICTING — عند دمجها تُعاد ترقيمها
-- إلى 0066 (بعد هذه) لا 0064. لا تُستخدم 0064 هنا.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) log_platform_audit — إعادة تعريف متطابقة مع 0063 (الخطوة 6)
--    حتى تعمل هذه المهاجرة أيّاً كان ترتيب دمج #51. نفس التوقيع ونفس
--    الدلالة: حارس أدمن + اسم الفاعل قسراً من auth.uid().
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
-- 1) إعلانات المنصة
--    • لا سياسة SELECT للمدرس إطلاقاً: القراءة عبر RPC
--      platform_announcements_for_me() وحده (الجدول نفسه لا يُقرأ
--      مباشرة من جلسة مدرس، فلا تسريب عبر المستأجرين).
--    • الكتابة عبر RPCs الأدمن وحدها؛ سياسات الأدمن على الجدول دفاع
--      ثانٍ لا مسار أول (نفس نمط قائمة السماح بعد 0063).
-- ---------------------------------------------------------------------------
create table public.platform_announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  kind         text not null default 'general'
               check (kind in ('update', 'maintenance', 'general')),
  scheduled_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

alter table public.platform_announcements enable row level security;

revoke all on public.platform_announcements from public, anon, authenticated;
grant select, insert, update, delete on public.platform_announcements to authenticated;

create policy platform_announcements_admin_all
  on public.platform_announcements
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 2) تذاكر الدعم + رسائلها
--    • التذكرة بلا teacher_id مستحيلة (قيد NOT NULL + FK cascade).
--    • المدرس: يرى تذاكره هو فقط ويرسل رسائل باسمه ودوره هو فقط.
--    • الأدمن: يرى كل التذاكر والرسائل، ويرسل باسمه ودوره هو فقط.
--    • لا UPDATE/DELETE مباشرة من أي جلسة عميل: تغيير الحالة عبر
--      RPC الإداري وحده، والحذف عبر حذف الحساب (cascade) فقط.
-- ---------------------------------------------------------------------------
create table public.support_tickets (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  subject    text not null,
  status     text not null default 'new'
             check (status in ('new', 'in_progress', 'waiting_teacher', 'closed')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.support_tickets (id) on delete cascade,
  author_id  uuid references auth.users (id) on delete set null,
  author_kind text not null check (author_kind in ('teacher', 'admin')),
  body       text not null,
  created_at timestamptz not null default now()
);

create index support_tickets_teacher_idx on public.support_tickets (teacher_id, created_at desc);
create index support_ticket_messages_ticket_idx on public.support_ticket_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

revoke all on public.support_tickets from public, anon, authenticated;
revoke all on public.support_ticket_messages from public, anon, authenticated;
grant select, insert on public.support_tickets to authenticated;
grant select, insert on public.support_ticket_messages to authenticated;

create policy support_tickets_owner_select
  on public.support_tickets for select
  using (public.is_teacher_owner(teacher_id));

create policy support_tickets_owner_insert
  on public.support_tickets for insert
  with check (public.is_teacher_owner(teacher_id));

create policy support_tickets_admin_select
  on public.support_tickets for select
  using (public.is_platform_admin());

create policy support_ticket_messages_owner_select
  on public.support_ticket_messages for select
  using (exists (
    select 1 from public.support_tickets t
    where t.id = ticket_id and public.is_teacher_owner(t.teacher_id)
  ));

create policy support_ticket_messages_owner_insert
  on public.support_ticket_messages for insert
  with check (
    author_kind = 'teacher'
    and author_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and public.is_teacher_owner(t.teacher_id)
    )
  );

create policy support_ticket_messages_admin_select
  on public.support_ticket_messages for select
  using (public.is_platform_admin());

create policy support_ticket_messages_admin_insert
  on public.support_ticket_messages for insert
  with check (
    author_kind = 'admin'
    and author_id = auth.uid()
    and public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- 3) نشر/حذف إعلان — أدمن فقط + سطر تدقيق في نفس المعاملة
-- ---------------------------------------------------------------------------
create or replace function public.platform_announcement_publish(
  p_title text,
  p_body text,
  p_kind text default 'general',
  p_scheduled_at timestamptz default null
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
  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'announcement title is required';
  end if;
  if p_body is null or char_length(btrim(p_body)) = 0 then
    raise exception 'announcement body is required';
  end if;
  if p_kind is null or p_kind not in ('update', 'maintenance', 'general') then
    raise exception 'invalid announcement kind';
  end if;
  if char_length(p_title) > 200 then
    raise exception 'announcement title too long';
  end if;
  if char_length(p_body) > 4000 then
    raise exception 'announcement body too long';
  end if;

  insert into public.platform_announcements
    (title, body, kind, scheduled_at, published_by)
  values (btrim(p_title), btrim(p_body), p_kind, p_scheduled_at, auth.uid())
  returning id into v_id;

  perform public.log_platform_audit(
    'announcement_published', null,
    jsonb_build_object('announcement_id', v_id, 'kind', p_kind));

  return v_id;
end $$;

revoke execute on function public.platform_announcement_publish(text, text, text, timestamptz) from public, anon;
grant execute on function public.platform_announcement_publish(text, text, text, timestamptz) to authenticated;

create or replace function public.platform_announcement_delete(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_kind text;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select kind into v_kind
  from public.platform_announcements where id = p_id;
  if not found then
    raise exception 'announcement not found';
  end if;

  delete from public.platform_announcements where id = p_id;

  perform public.log_platform_audit(
    'announcement_deleted', null,
    jsonb_build_object('announcement_id', p_id, 'kind', v_kind));

  return true;
end $$;

revoke execute on function public.platform_announcement_delete(uuid) from public, anon;
grant execute on function public.platform_announcement_delete(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) قراءة الإعلانات
--    • للمدرس: إعلانات منشورة (published_at <= now()) فقط — بلا أي
--      تصفية بحساب، فالإعلان منصة كاملة؛ الدالة ترجع الصفوف كاملة
--      لأن الإعلان نفسه محتوى عام لا بيانات مستأجر.
--    • للأدمن: كل الإعلانات (بما فيها المجدولة مستقبلاً) للوحة.
-- ---------------------------------------------------------------------------
create or replace function public.platform_announcements_for_me()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.teachers t
    where t.owner_user_id = v_uid
    union all
    select 1 from public.teacher_members m
    where m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorized';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(a) order by a.published_at desc, a.created_at desc)
    from (
      select id, title, body, kind, scheduled_at, published_at, created_at
      from public.platform_announcements
      where published_at <= now()
      order by published_at desc, created_at desc
      limit 50
    ) a
  ), '[]'::jsonb);
end $$;

revoke execute on function public.platform_announcements_for_me() from public, anon;
grant execute on function public.platform_announcements_for_me() to authenticated;

create or replace function public.platform_announcements_list()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(a) order by a.published_at desc, a.created_at desc)
    from (
      select id, title, body, kind, scheduled_at, published_at, created_at
      from public.platform_announcements
      order by published_at desc, created_at desc
      limit 100
    ) a
  ), '[]'::jsonb);
end $$;

revoke execute on function public.platform_announcements_list() from public, anon;
grant execute on function public.platform_announcements_list() to authenticated;

-- ---------------------------------------------------------------------------
-- 5) تذاكر الدعم — إنشاء/قراءة/رد/تغيير حالة
--    • الإنشاء: مالك الحساب أو عضو نشط فيه فقط (نفس حارس 0052).
--    • الرد: الدور يُشتق من الجلسة لا من المدخل — أدمن يكتب admin
--      ومدرس يكتب teacher؛ الرد على مغلقة مرفوض.
--    • آلة الحالات: رد الأدمن → waiting_teacher، رد المدرس →
--      in_progress؛ الإغلاق/إعادة الفتح عبر set_ticket_status.
-- ---------------------------------------------------------------------------
create or replace function public.submit_support_ticket(
  p_teacher_id uuid,
  p_subject text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_ticket public.support_tickets;
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
    raise exception 'only the centre owner or an active member can open a ticket';
  end if;
  if p_subject is null or char_length(btrim(p_subject)) = 0 then
    raise exception 'ticket subject is required';
  end if;
  if p_body is null or char_length(btrim(p_body)) = 0 then
    raise exception 'ticket body is required';
  end if;
  if char_length(p_subject) > 200 then
    raise exception 'ticket subject too long';
  end if;
  if char_length(p_body) > 4000 then
    raise exception 'ticket body too long';
  end if;

  insert into public.support_tickets (teacher_id, subject, created_by)
  values (p_teacher_id, btrim(p_subject), v_uid)
  returning * into v_ticket;

  insert into public.support_ticket_messages
    (ticket_id, author_id, author_kind, body)
  values (v_ticket.id, v_uid, 'teacher', btrim(p_body));

  return jsonb_build_object(
    'id', v_ticket.id, 'status', v_ticket.status,
    'created_at', v_ticket.created_at);
end $$;

revoke execute on function public.submit_support_ticket(uuid, text, text) from public, anon;
grant execute on function public.submit_support_ticket(uuid, text, text) to authenticated;

create or replace function public.my_support_tickets(p_teacher_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
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
    raise exception 'not authorized';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(t) order by t.updated_at desc, t.created_at desc)
    from (
      select
        tk.id, tk.subject, tk.status, tk.created_at, tk.updated_at,
        (select count(*) from public.support_ticket_messages m
         where m.ticket_id = tk.id) as message_count,
        (select max(m.created_at) from public.support_ticket_messages m
         where m.ticket_id = tk.id) as last_message_at
      from public.support_tickets tk
      where tk.teacher_id = p_teacher_id
      order by tk.updated_at desc, tk.created_at desc
      limit 100
    ) t
  ), '[]'::jsonb);
end $$;

revoke execute on function public.my_support_tickets(uuid) from public, anon;
grant execute on function public.my_support_tickets(uuid) to authenticated;

create or replace function public.support_ticket_thread(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_ticket public.support_tickets;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_ticket
  from public.support_tickets where id = p_ticket_id;
  if not found then
    raise exception 'ticket not found';
  end if;

  if not (
    public.is_platform_admin()
    or public.is_teacher_owner(v_ticket.teacher_id)
    or exists (
      select 1 from public.teacher_members m
      where m.teacher_id = v_ticket.teacher_id
        and m.user_id = v_uid
        and m.status = 'active')
  ) then
    raise exception 'not authorized';
  end if;

  return jsonb_build_object(
    'id', v_ticket.id,
    'teacher_id', v_ticket.teacher_id,
    'subject', v_ticket.subject,
    'status', v_ticket.status,
    'created_at', v_ticket.created_at,
    'updated_at', v_ticket.updated_at,
    'messages', coalesce((
      select jsonb_agg(row_to_json(m) order by m.created_at)
      from (
        select id, author_kind, body, created_at
        from public.support_ticket_messages
        where ticket_id = p_ticket_id
        order by created_at
      ) m
    ), '[]'::jsonb));
end $$;

revoke execute on function public.support_ticket_thread(uuid) from public, anon;
grant execute on function public.support_ticket_thread(uuid) to authenticated;

create or replace function public.reply_support_ticket(
  p_ticket_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_ticket public.support_tickets;
  v_is_admin boolean := public.is_platform_admin();
  v_kind text;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_body is null or char_length(btrim(p_body)) = 0 then
    raise exception 'reply body is required';
  end if;
  if char_length(p_body) > 4000 then
    raise exception 'reply body too long';
  end if;

  select * into v_ticket
  from public.support_tickets where id = p_ticket_id
  for update;
  if not found then
    raise exception 'ticket not found';
  end if;
  if v_ticket.status = 'closed' then
    raise exception 'ticket is closed';
  end if;

  if v_is_admin then
    v_kind := 'admin';
    v_status := 'waiting_teacher';
  elsif public.is_teacher_owner(v_ticket.teacher_id)
    or exists (
      select 1 from public.teacher_members m
      where m.teacher_id = v_ticket.teacher_id
        and m.user_id = v_uid
        and m.status = 'active')
  then
    v_kind := 'teacher';
    v_status := 'in_progress';
  else
    raise exception 'not authorized';
  end if;

  insert into public.support_ticket_messages
    (ticket_id, author_id, author_kind, body)
  values (p_ticket_id, v_uid, v_kind, btrim(p_body));

  update public.support_tickets
  set status = v_status, updated_at = now()
  where id = p_ticket_id;

  return jsonb_build_object(
    'id', p_ticket_id, 'status', v_status, 'author_kind', v_kind);
end $$;

revoke execute on function public.reply_support_ticket(uuid, text) from public, anon;
grant execute on function public.reply_support_ticket(uuid, text) to authenticated;

create or replace function public.set_ticket_status(
  p_ticket_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_prev text;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if p_status is null
    or p_status not in ('new', 'in_progress', 'waiting_teacher', 'closed')
  then
    raise exception 'invalid ticket status';
  end if;

  select status into v_prev
  from public.support_tickets where id = p_ticket_id;
  if not found then
    raise exception 'ticket not found';
  end if;

  update public.support_tickets
  set status = p_status, updated_at = now()
  where id = p_ticket_id;

  perform public.log_platform_audit(
    'ticket_status_changed', null,
    jsonb_build_object(
      'ticket_id', p_ticket_id,
      'previous_status', v_prev, 'new_status', p_status));

  return jsonb_build_object('id', p_ticket_id, 'status', p_status);
end $$;

revoke execute on function public.set_ticket_status(uuid, text) from public, anon;
grant execute on function public.set_ticket_status(uuid, text) to authenticated;

create or replace function public.platform_support_tickets(
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if p_status is not null
    and p_status not in ('new', 'in_progress', 'waiting_teacher', 'closed')
  then
    raise exception 'invalid ticket status';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(t) order by t.updated_at desc, t.created_at desc)
    from (
      select
        tk.id, tk.teacher_id, tk.subject, tk.status,
        tk.created_at, tk.updated_at,
        te.display_name as teacher_name,
        (select count(*) from public.support_ticket_messages m
         where m.ticket_id = tk.id) as message_count,
        (select max(m.created_at) from public.support_ticket_messages m
         where m.ticket_id = tk.id) as last_message_at
      from public.support_tickets tk
      join public.teachers te on te.id = tk.teacher_id
      where p_status is null or tk.status = p_status
      order by tk.updated_at desc, tk.created_at desc
      limit 100
    ) t
  ), '[]'::jsonb);
end $$;

revoke execute on function public.platform_support_tickets(text) from public, anon;
grant execute on function public.platform_support_tickets(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) delete_my_teacher_account (قاعدة 0046): أي جدول جديد بـ teacher_id
--    يُضاف لقائمة الحذف. إعادة إنشاء نسخة 0052 + support_tickets
--    (الرسائل تُحذف cascade من التذكرة نفسها).
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
    'teacher_feedback', 'support_tickets'
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
-- نهاية 0065 — جداول جديدة: platform_announcements / support_tickets /
-- support_ticket_messages | دوال: platform_announcement_publish/delete،
-- platform_announcements_for_me/list، submit_support_ticket،
-- my_support_tickets، support_ticket_thread، reply_support_ticket،
-- set_ticket_status، platform_support_tickets (+ log_platform_audit
-- إعادة تعريف متطابقة مع 0063).
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ============================================================================
