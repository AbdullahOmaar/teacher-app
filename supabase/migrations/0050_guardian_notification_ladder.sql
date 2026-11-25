-- ============================================================================
-- تطبيق المدرس — 0050_guardian_notification_ladder.sql
-- Phase 2 / المهمة 9 (3A-713): قناة إشعارات ولي الأمر داخل التطبيق تصبح
-- صندوقاً موحّداً لكل أحداث 3A-300 الأربعة + سلّم بدائل موثّق بسجل تسليم.
--
-- ما كان موجوداً قبل هذه الهجرة (لا يُعاد بناؤه):
-- • صندوق البوابة (0012): guardian_notifications للوصول/المغادرة فقط،
--   توليد بـ trigger على attendance، وقائمة/تعليم-مقروء بـ RPC بالتوكن.
-- • Web Push كامل (0013/0014/0015): اشتراكات + send-push + مشغّلات
--   pg_net لأحداث (وصول/مغادرة + دفعة + نتيجة امتحان) وسجل
--   push_delivery_log لكل اشتراك.
-- • واتساب (0026/0045 — 3A-300): إرسال بيد المدرس من التطبيق حصراً
--   (JWT + ملكية) بأنواعه الأربعة وسجل whatsapp_message_log.
--
-- فجوات هذه المهمة التي تبنيها الهجرة:
-- ١) الغياب وصدور الفاتورة لا يولّدان أي إشعار ولي أمر — لا في الصندوق
--    ولا Push. هنا: نوعان جديدان + مشغّلا توليد بنفس أنماط 0012
--    (fail-safe + idempotent بقيد فريد).
-- ٢) لا سجل موحّد يجيب «هذا الحدث: أي قنوات جُرّبت وماذا حدث؟» — هنا:
--    guardian_notification_deliveries يسجّل لكل إشعار قرار السلّم في
--    القنوات الثلاث بالترتيب: داخل البوابة (الصف نفسه = تسليم دائم)
--    ← Web Push (محاولة عبر push_dispatch القائم؛ نتيجتها لكل اشتراك
--    في push_delivery_log) ← واتساب الذاتي (درجة «بيد المدرس» بتصميم
--    3A-300: تُسجَّل queued إن كانت القناة جاهزة — الإرسال الفعلي فعل
--    مدرس من التطبيق ونتيجته في whatsapp_message_log — أو skipped
--    بسبب صريح). درجات SMS وInstagram Direct من سلّم الخطة (ج20-5)
--    غير مبنية عمداً: لا قنوات مدفوعة جديدة ولا ربط Meta جديداً في
--    هذه المهمة — توثيقها في دراسة المهمة 9.
--
-- نموذج البيانات:
-- • guardian_notifications: session_id يصبح اختيارياً (الفاتورة ليست
--   حصة)، وinvoice_id جديد يربط إشعار الفاتورة بفاتورتها. القيد الفريد
--   القائم (session, student, kind) يحرس الأنواع الحصّية، وفهرس فريد
--   جزئي (invoice_id, kind) يحرس إشعار الفاتورة (صفوف session_id null
--   لا يمسّها قيد الحصص لأن NULLs متميزة في قيود Postgres الفريدة).
-- • guardian_notification_deliveries: صف لكل (إشعار × قناة): channel
--   in_portal/web_push/whatsapp وstatus delivered/attempted/queued/
--   skipped وdetail نصي صادق. الكتابة من دالة السلّم (security
--   definer) حصراً — لا سياسات كتابة لأي عميل؛ القراءة للمالك فقط
--   عبر is_teacher_owner (الإشعارات قد تكشف مبالغ فواتير — نفس تشدد
--   whatsapp_message_log). سجل تشغيلي: خارج نطاق النسخة الاحتياطية
--   بوعي (كـ push_delivery_log وwhatsapp_message_log).
--
-- الأمان: كل الدوال الجديدة/المستبدلة security definer بـ search_path
-- مثبّت؛ دالتا التوليد والسلّم داخلية (مسحوبة من الجميع — تعمل عبر
-- المشغّلات فقط)؛ تحديث RPC قائمة البوابة يحافظ على تحقق التوكن
-- بـ portal_validate_token حرفياً وعلى شكل الرد القائم (حقول مضافة
-- فقط). وdelete_my_teacher_account تُعاد كتابتها بنسخة 0049 +
-- الجدول الجديد في قائمتها (قاعدة 0046).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- ١) أنواع إشعار جديدة — قيم enum تُضاف في كتلتها الخاصة (لا تُستخدم
--    إلا في كتل لاحقة).
-- ----------------------------------------------------------------------------
alter type public.guardian_notification_kind add value if not exists 'absence';
alter type public.guardian_notification_kind add value if not exists 'invoice_issued';

commit;

begin;

-- ----------------------------------------------------------------------------
-- ٢) توسيع guardian_notifications: الفاتورة حدث بلا حصة
-- ----------------------------------------------------------------------------
alter table public.guardian_notifications
  alter column session_id drop not null;

alter table public.guardian_notifications
  add column invoice_id uuid references public.invoices (id) on delete cascade;

create index guardian_notifs_invoice_idx
  on public.guardian_notifications (invoice_id) where invoice_id is not null;

-- Idempotency إشعار الفاتورة: إشعار واحد كحد أقصى لكل (فاتورة، نوع)
create unique index guardian_notifs_invoice_uniq
  on public.guardian_notifications (invoice_id, kind) where invoice_id is not null;

commit;

begin;

-- ----------------------------------------------------------------------------
-- ٣) سجل تسليم السلّم — صف لكل محاولة قناة على إشعار
-- ----------------------------------------------------------------------------
create table public.guardian_notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.guardian_notifications (id) on delete cascade,
  teacher_id      uuid not null references public.teachers (id) on delete cascade,
  channel         text not null check (channel in ('in_portal', 'web_push', 'whatsapp')),
  status          text not null check (status in ('delivered', 'attempted', 'queued', 'skipped')),
  detail          text,
  created_at      timestamptz not null default now()
);
create index guardian_notif_deliveries_notif_idx
  on public.guardian_notification_deliveries (notification_id, created_at);
create index guardian_notif_deliveries_teacher_idx
  on public.guardian_notification_deliveries (teacher_id, created_at desc);

alter table public.guardian_notification_deliveries enable row level security;

-- قراءة للمالك فقط — لا أي سياسة كتابة: الإدخال من دالة السلّم
-- (security definer) حصراً
create policy guardian_notif_deliveries_owner_select
  on public.guardian_notification_deliveries
  for select using (public.is_teacher_owner(teacher_id));

grant select on public.guardian_notification_deliveries to authenticated;
grant all on public.guardian_notification_deliveries to service_role;

commit;

begin;

-- ============================================================================
-- ٤) التوليد — الغياب: نفس دالة 0012 مع فرع غياب مضاف (الوصول/المغادرة
--    بحرفيتهما). «غاب» = أول انتقال لحالة 'a' في الحصة (إدراج مباشر أو
--    تحديث من أي حالة غير غياب) — والقيد الفريد يجعل أي تكرار no-op.
-- ============================================================================
create or replace function public.guardian_notify_on_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guardian_id uuid;
begin
  begin
    -- المستلم: أول ولي أمر مرتبط بالطالب إن وُجد (قد لا يوجد بعد)
    select gs.guardian_id into v_guardian_id
    from public.guardian_students gs
    where gs.teacher_id = new.teacher_id
      and gs.student_id = new.student_id
    limit 1;

    -- وصول: أول انتقال لحضور فعلي (p/l/m) — إدراج جديد بحالة حضورية،
    -- أو تحديث من حالة غير حضورية (null/غائب) لحالة حضورية
    if new.status in ('p', 'l', 'm')
       and (tg_op = 'INSERT' or old.status is null or old.status = 'a') then
      insert into public.guardian_notifications
        (teacher_id, student_id, guardian_id, session_id, kind, event_at)
      values
        (new.teacher_id, new.student_id, v_guardian_id, new.session_id, 'arrived', now())
      on conflict (session_id, student_id, kind) do nothing;
    end if;

    -- مغادرة: أول ضبط لـ left_at (من null لقيمة) — وقت الحدث هو
    -- left_at نفسه لا لحظة كتابة الصف
    if new.left_at is not null
       and (tg_op = 'INSERT' or old.left_at is null) then
      insert into public.guardian_notifications
        (teacher_id, student_id, guardian_id, session_id, kind, event_at)
      values
        (new.teacher_id, new.student_id, v_guardian_id, new.session_id, 'left', new.left_at)
      on conflict (session_id, student_id, kind) do nothing;
    end if;

    -- غياب (0050): أول انتقال لحالة غياب 'a' في الحصة — إدراج مباشر
    -- بغياب أو تحديث من حالة غير غياب (null/حاضر/متأخر/تعويضي)
    if new.status = 'a'
       and (tg_op = 'INSERT' or old.status is null or old.status <> 'a') then
      insert into public.guardian_notifications
        (teacher_id, student_id, guardian_id, session_id, kind, event_at)
      values
        (new.teacher_id, new.student_id, v_guardian_id, new.session_id, 'absence', now())
      on conflict (session_id, student_id, kind) do nothing;
    end if;
  exception when others then
    -- fail-safe مقصود وموثّق: تنبيه فاشل لا يكسر حفظ الحضور أبداً
    null;
  end;
  return new;
end $$;

commit;

begin;

-- ============================================================================
-- ٥) التوليد — صدور فاتورة: الفاتورة في هذا النظام «صادرة» لحظة
--    إنشائها (لا عمود حالة — الصف نفسه هو الإصدار). Idempotent
--    بالفهرس الجزئي (invoice_id, kind).
-- ============================================================================
create or replace function public.guardian_notify_on_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guardian_id uuid;
begin
  begin
    select gs.guardian_id into v_guardian_id
    from public.guardian_students gs
    where gs.teacher_id = new.teacher_id
      and gs.student_id = new.student_id
    limit 1;

    insert into public.guardian_notifications
      (teacher_id, student_id, guardian_id, session_id, kind, event_at, invoice_id)
    values
      (new.teacher_id, new.student_id, v_guardian_id, null, 'invoice_issued', now(), new.id)
    on conflict (invoice_id, kind) where invoice_id is not null do nothing;
  exception when others then
    -- fail-safe مقصود وموثّق: تنبيه فاشل لا يكسر إنشاء الفاتورة أبداً
    null;
  end;
  return new;
end $$;

create trigger invoices_guardian_notify_trg
  after insert on public.invoices
  for each row execute function public.guardian_notify_on_invoice();

revoke execute on function public.guardian_notify_on_invoice() from public, anon, authenticated;

commit;

begin;

-- ============================================================================
-- ٦) نص الـ Push للأنواع الجديدة — استبدال دالة 0014 بنسخة واعية
--    بالنوع. الأنواع الحصّية بنصّها القائم حرفياً؛ الغياب من حصته؛
--    الفاتورة بلا مبلغ في نص الـ Push عمداً (سطور الفاتورة قد تُدرج
--    بعد صفّها لحظياً — المبلغ الحي يظهر في صندوق البوابة من
--    invoice_balances، ونص Push بمبلغ صفري/ناقص كذبٌ على ولي الأمر).
-- ============================================================================
create or replace function public.push_on_guardian_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_name text;
  v_group_name text;
  v_centre text;
  v_verb text;
  v_body text;
begin
  begin
    select name into v_student_name from public.students where id = new.student_id;
    v_centre := public.push_centre_name(new.teacher_id);

    if new.kind = 'invoice_issued' then
      select to_char(i.period_month, 'YYYY-MM') into v_group_name
      from public.invoices i where i.id = new.invoice_id;
      v_body := 'صدرت فاتورة شهر ' || coalesce(v_group_name, '') ||
        ' للطالب ' || coalesce(v_student_name, '') ||
        ' — المبلغ والتفاصيل في بوابة ولي الأمر';
    else
      select g.name into v_group_name
      from public.sessions se
      join public.groups g on g.id = se.group_id
      where se.id = new.session_id;
      v_verb := case new.kind
        when 'arrived' then 'وصل'
        when 'left' then 'غادر'
        else 'غاب'
      end;
      v_body := v_verb || ' الطالب ' || coalesce(v_student_name, '') ||
        ' — حصة ' || coalesce(v_group_name, '');
    end if;

    perform public.push_dispatch(
      v_centre,
      v_body,
      new.student_id,
      'guardian-notif-' || new.id::text,
      '/'
    );
  exception when others then
    null;
  end;
  return new;
end $$;

commit;

begin;

-- ============================================================================
-- ٧) سلّم البدائل — يُسجّل قرار القنوات الثلاث لكل إشعار جديد.
--    داخلي بالكامل (مسحوب من الجميع) وfail-safe: فشله لا يكسر توليد
--    الإشعار ولا الحدث الأصلي أبداً.
--    • in_portal: delivered دائماً — صف الإشعار نفسه هو التسليم
--      (صندوق دائم بحالة قراءة، لا «محاولة» فيه).
--    • web_push: attempted إن وُجد اشتراك بوابة نشط للطالب (الإرسال
--      الفعلي من مشغّل 0014 عبر push_dispatch، ونتائجه لكل اشتراك في
--      push_delivery_log) — وإلا skipped بسبب صريح.
--    • whatsapp: درجة المدرس بتصميم 3A-300 — queued إن اكتملت
--      الجاهزية (قناة مفعّلة + توكن محفوظ + قالب النوع ready + رقم
--      ولي أمر) ومعناها «الإرسال متاح للمدرس من التطبيق ونتيجته في
--      whatsapp_message_log» — وإلا skipped بأول سبب ناقص.
-- ============================================================================
create or replace function public.guardian_notification_ladder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_push_count int;
  v_wa_kind text;
  v_cfg record;
  v_template_status text;
  v_phone text;
begin
  begin
    -- الدرجة ١: داخل البوابة — التسليم هو الصف نفسه
    insert into public.guardian_notification_deliveries
      (notification_id, teacher_id, channel, status, detail)
    values
      (new.id, new.teacher_id, 'in_portal', 'delivered',
       'persisted in the guardian portal inbox');

    -- الدرجة ٢: Web Push — محاولة إن وُجد اشتراك نشط لهذا الطالب
    select count(*) into v_push_count
    from public.push_subscriptions ps
    where ps.student_id = new.student_id
      and ps.teacher_id = new.teacher_id
      and ps.subscriber_kind in ('guardian', 'student')
      and ps.is_active;
    if v_push_count > 0 then
      insert into public.guardian_notification_deliveries
        (notification_id, teacher_id, channel, status, detail)
      values
        (new.id, new.teacher_id, 'web_push', 'attempted',
         'push dispatch fired; per-subscription outcomes in push_delivery_log (' ||
           v_push_count || ' active subscription(s))');
    else
      insert into public.guardian_notification_deliveries
        (notification_id, teacher_id, channel, status, detail)
      values
        (new.id, new.teacher_id, 'web_push', 'skipped',
         'no active portal push subscription for this student');
    end if;

    -- الدرجة ٣: واتساب الذاتي — جاهزية قناة المدرس لنوع هذا الحدث
    v_wa_kind := case new.kind
      when 'arrived' then 'arrival_notice'
      when 'left' then 'departure_notice'
      when 'absence' then 'absence_notice'
      when 'invoice_issued' then 'invoice_issued'
    end;

    select c.enabled, c.token_vault_secret_id
    into v_cfg
    from public.teacher_whatsapp_config c
    where c.teacher_id = new.teacher_id;

    select g.phone into v_phone
    from public.guardians g
    where g.id = new.guardian_id;

    if v_phone is null then
      select g.phone into v_phone
      from public.guardian_students gs
      join public.guardians g on g.id = gs.guardian_id
      where gs.teacher_id = new.teacher_id
        and gs.student_id = new.student_id
        and btrim(g.phone) <> ''
      limit 1;
    end if;

    select t.status into v_template_status
    from public.teacher_whatsapp_templates t
    where t.teacher_id = new.teacher_id and t.kind = v_wa_kind;

    if v_cfg is null or not coalesce(v_cfg.enabled, false) then
      insert into public.guardian_notification_deliveries
        (notification_id, teacher_id, channel, status, detail)
      values
        (new.id, new.teacher_id, 'whatsapp', 'skipped',
         'teacher WhatsApp channel is not enabled');
    elsif v_cfg.token_vault_secret_id is null then
      insert into public.guardian_notification_deliveries
        (notification_id, teacher_id, channel, status, detail)
      values
        (new.id, new.teacher_id, 'whatsapp', 'skipped',
         'teacher WhatsApp token is not saved');
    elsif coalesce(v_template_status, 'missing') <> 'ready' then
      insert into public.guardian_notification_deliveries
        (notification_id, teacher_id, channel, status, detail)
      values
        (new.id, new.teacher_id, 'whatsapp', 'skipped',
         'template for kind ' || v_wa_kind || ' is not ready');
    elsif v_phone is null or btrim(v_phone) = '' then
      insert into public.guardian_notification_deliveries
        (notification_id, teacher_id, channel, status, detail)
      values
        (new.id, new.teacher_id, 'whatsapp', 'skipped',
         'no guardian phone on file');
    else
      insert into public.guardian_notification_deliveries
        (notification_id, teacher_id, channel, status, detail)
      values
        (new.id, new.teacher_id, 'whatsapp', 'queued',
         'teacher channel ready — send is teacher-initiated from the app (3A-300); outcome lands in whatsapp_message_log');
    end if;
  exception when others then
    -- fail-safe مقصود وموثّق: سجل السلّم لا يكسر الإشعار أبداً
    null;
  end;
  return new;
end $$;

create trigger guardian_notifications_ladder_trg
  after insert on public.guardian_notifications
  for each row execute function public.guardian_notification_ladder();

revoke execute on function public.guardian_notification_ladder() from public, anon, authenticated;

commit;

begin;

-- ============================================================================
-- ٨) قائمة البوابة — نفس التحقق والشكل القائم، بانضمامات يسارية حتى
--    تظهر صفوف الفاتورة (بلا حصة) وحقول فاتورة حية من invoice_balances
--    (المبلغ والباقي لحظة القراءة لا لحظة التوليد).
-- ============================================================================
create or replace function public.portal_list_guardian_notifications(
  p_token text,
  p_student_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.guardian_access_tokens;
begin
  tok := public.portal_validate_token(p_token, p_student_id);

  return jsonb_build_object(
    'unread_count', (
      select count(*) from public.guardian_notifications gn
      where gn.student_id = p_student_id and gn.read_at is null
    ),
    'notifications', coalesce((
      select jsonb_agg(t order by event_at desc)
      from (
        select jsonb_build_object(
          'id', gn.id,
          'kind', gn.kind,
          'event_at', gn.event_at,
          'read_at', gn.read_at,
          'session_date', se.session_date,
          'start_time', se.start_time,
          'group_name', coalesce(sg.name, ig.name),
          'invoice_period', case when gn.invoice_id is not null
            then to_char(i.period_month, 'YYYY-MM') end,
          'invoice_total', ib.total,
          'invoice_balance', ib.balance
        ) as t, gn.event_at
        from public.guardian_notifications gn
        left join public.sessions se on se.id = gn.session_id
        left join public.groups sg on sg.id = se.group_id
        left join public.invoices i on i.id = gn.invoice_id
        left join public.groups ig on ig.id = i.group_id
        left join public.invoice_balances ib on ib.invoice_id = gn.invoice_id
        where gn.student_id = p_student_id
          and gn.teacher_id = tok.teacher_id
        order by gn.event_at desc
        limit 30
      ) x
    ), '[]'::jsonb)
  );
end $$;

grant execute on function public.portal_list_guardian_notifications(text, uuid) to anon, authenticated;

commit;

begin;

-- ============================================================================
-- ٩) delete_my_teacher_account: إعادة إنشاء نسخة 0049 +
--    guardian_notification_deliveries في قائمة الجداول (قاعدة 0046:
--    أي جدول جديد بـ teacher_id يُضاف هنا).
-- ============================================================================
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
    'guardian_notification_deliveries'
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
-- نهاية 0050 — نوعا enum جديدان (absence/invoice_issued) | عمود
-- guardian_notifications.invoice_id + session_id اختياري + فهرس فريد
-- جزئي للفواتير | جدول guardian_notification_deliveries (مالك-قراءة
-- فقط) | توليد غياب (فرع في دالة 0012) + توليد فاتورة (مشغّل جديد) |
-- نص Push واعٍ بالنوع | مشغّل سلّم البدائل | قائمة بوابة موسّعة |
-- delete_my_teacher_account بقائمة 0049 + الجدول الجديد.
-- لا قنوات جديدة ولا إرسال واتساب تلقائي: درجات SMS/Direct من سلّم
-- الخطة غير مبنية عمداً (توثيق دراسة المهمة 9).
-- ============================================================================
