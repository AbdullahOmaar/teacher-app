-- ============================================================================
-- تطبيق المدرس — 0073_whatsapp_auto_send_and_feature_seen.sql
-- Phase 2 / المهمة 24 (3A-900): مسار الإرسال الآلي لواتساب فوق سلّم
-- المهمة 9 + نظام «جديد» العام (توجيه المالك ٥).
--
-- ⚠️ هجرة كود فقط — لا تُطبَّق على الإنتاج إلا عند بوابة تجميد فيز 2
-- + QA (قاعدة 2026-11-25). الرقم 0073 اختير لتجنّب تصادم ترقيم مع
-- فروع شقيقة قيد المراجعة حجزت 0070–0072.
--
-- الجزء أ — الإرسال الآلي لواتساب (مقترح ١٤):
-- ما كان قائماً قبل هذه الهجرة (لا يُعاد بناؤه):
-- • سلّم 0050 يسجّل درجة واتساب «queued» بمعنى «الإرسال بيد المدرّس من
--   التطبيق» — لأن send-whatsapp-message تشترط JWT مدرّس بالتصميم.
-- • دراسة المهمة 15 (§1.2) حسمت شكل الأتمتة: «مسار خادمي جديد (مشغّل
--   داخلي بلا JWT مستخدم) — بناء جديد، ليس قلب علم»، وضوابط الإطلاق:
--   قوالب معتمدة + موافقة/مخرج إيقاف + حصة إرسال لكل مركز معتمدة من
--   المدير 2026-11-25 (قابلة للضبط لكل مركز).
-- • شوكة نموذج ق4 (رقم منصة واحد × أرقام المدرسين) لم تُحسم — هذه
--   الهجرة تبني المسار فوق معمارية أرقام المدرسين القائمة (0026/0045)
--   لأنها الموجودة؛ اختيار نموذج المنصة لاحقاً يبدّل حلّال القناة داخل
--   الدالة فقط، والسلّم والضوابط هنا لا تتغير.
--
-- ما تبنيه هذه الهجرة:
-- ١) ضوابط لكل سنتر على teacher_whatsapp_config: ‏auto_send_enabled
--    (opt-in صريح من المدرس — افتراضي false) + ‏auto_send_daily_quota
--    (حصة رسائل آلية/يوم لكل مركز — افتراضي 100، قابلة للضبط من
--    الإعدادات، وقيد ‏> 0).
-- ٢) مخرج الإيقاف لولي الأمر: ‏guardians.whatsapp_opt_out (افتراضي
--    false) — رسائل Utility الحدثية تقوم على علاقة خدمة قائمة + مخرج
--    إيقاف واضح (سياسة المهمة 15 §1.2)؛ السلم يتخطى من فعّله بسبب صريح.
-- ٣) بوابة المنصة: ‏platform_settings.whatsapp_auto_send_enabled =
--    false — لا إرسال آلياً من أي سنتر قبل قلبها بقرار تشغيل (ق4).
-- ٤) ‏whatsapp_message_log.source ‏('manual'|'auto') — تمييز مصدر كل
--    رسالة في السجل (عدّ الحصة + مراقبة الكلفة لكل مركز).
-- ٥) دالة الإرسال الداخلي whatsapp_auto_dispatch (مسحوبة من الجميع):
--    نمط push_dispatch ‏(0014) حرفياً — تقرأ سرّ
--    'whatsapp_auto_internal_secret' من Vault وتنادي
--    send-whatsapp-message عبر pg_net بترويسة السرّ المشترك؛ بلا سرّ
--    مضبوط لا نداء إطلاقاً. وضع الدالة الداخلي نفسه مبني في نفس
--    الدفعة (core.ts: ترويسة x-wa-internal-secret بمقارنة ثابتة الزمن
--    + ‏internal:true — يتخطى بوابة JWT/الملكية وحدها؛ Kill switch
--    المنصة وفحوص الإعداد/القالب/التوكن/حد الشهر 0062 والسجل-أولاً
--    كلها تبقى كما هي).
-- ٦) استبدال دالة السلّم بنسخة 0050 حرفياً + امتداد درجة الواتساب:
--    بعد نجاح فحوص الجاهزية الأربعة القائمة، بوابات آلية بالترتيب —
--    (بوابة المنصة أو opt-in السنتر مطفأ ⇒ نفس صف queued القائم بلا أي
--    تغيير سلوكي) ← opt-out ولي الأمر ⇒ skipped ← سرّ داخلي غائب ⇒
--    skipped ← حصة اليوم ممتلئة (عدّ صفوف source='auto' اليوم) ⇒
--    skipped ← وإلا بناء المعاملات خادمياً + dispatch + صف attempted
--    (النتيجة الفعلية تهبط في whatsapp_message_log كالمعتاد).
--    المعاملات: الوصول/المغادرة [اسم الطالب، وقت الحدث ‏HH24:MI من
--    ‏event_at — الوقت الفعلي لا وقت بداية الحصة]، الغياب [اسم
--    الطالب، تاريخ الحصة]، الفاتورة [''، اسم الطالب] مع تمرير
--    invoice_id: مبلغ الفاتورة يُحلّ داخل الدالة لحظة التنفيذ من
--    invoice_balances — لا مبلغ وقت الحدث أبداً (درس المهمة 9: سطور
--    الفاتورة قد تُدرج بعد صفّها، فمبلغ وقت المحفّز قد يكون جزئياً
--    وكذباً على الولي؛ ‏pg_net ينفّذ بعد تثبيت المعاملة أصلاً).
--    حدود صادقة: عدّ الحصة best-effort (حدثان متزامنان قد يتجاوزانها
--    برسالة) — الحد الصلب الشهري 0062 داخل الدالة يبقى هو السقف
--    الفعلي؛ و«الدرجات» لا مصدر حدث لها في guardian_notifications
--    ولا نوع قالب لها بعد (المهمة 15: قالب نتيجة امتحان اعتماد Meta
--    جديد) — إضافتها لاحقاً = نوع إشعار + قالب + سطر في خريطة أنواع
--    السلم، بلا تغيير في هذا المسار.
--
-- الجزء ب — نظام «جديد» العام (توجيه المالك ٥):
-- • جدول teacher_feature_seen: ‏(teacher_id, feature_id) + seen_by +
--   seen_at — حالة «شوهدت» لكل مدرس (الخاصية تُختم عند أول استخدام
--   فتختفي شارتها وبطاقتها نهائياً لهذا المدرس).
-- • ‏RLS بنمط سجل النشاط (0009): قراءة/إدخال/تحديث للمالك أو عضو فعّال
--   (is_teacher_owner / is_teacher_member) — الحالة حالة السنتر لا
--   الفرد، فأي عضو يفتح الخاصية يختمها للسنتر كما يوجّه التوجيه
--   («حالة لكل مدرس»).
-- • سجل الخصائص نفسه في كود العميل (features/newFeatures/registry.ts):
--   ‏id + sinceVersion + مفاتيح نصوص التعريف + مسار الدخول — إضافة
--   خاصية مستقبلاً = سطر سجل + بطاقة في صفحتها، بلا تغيير في الآلة.
-- • أُضيف الجدول لقائمة delete_my_teacher_account (قاعدة 0046 —
--   إعادة بناء بنسخة 0065 حرفياً + الجدول).
--
-- الأمان: الدوال الجديدة/المستبدلة security definer بـ search_path
-- مثبّت؛ دالة الإرسال الداخلي مسحوبة من الجميع (تعمل من السلم فقط)؛
-- لا أسرار في الكود — السرّ في Vault باسمه فقط، ورابط الدالة بنمط
-- 0014 الموثّق (مرجع مشروع «ديمو» الحالي؛ يُراجع عند نقل البرودكشن).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- أ١) ضوابط الإرسال الآلي لكل سنتر + مخرج إيقاف ولي الأمر + مصدر السجل
-- ----------------------------------------------------------------------------
alter table public.teacher_whatsapp_config
  add column auto_send_enabled boolean not null default false,
  add column auto_send_daily_quota int not null default 100;

alter table public.teacher_whatsapp_config
  add constraint teacher_whatsapp_config_auto_quota_check
  check (auto_send_daily_quota > 0);

comment on column public.teacher_whatsapp_config.auto_send_enabled is
  '0073 (3A-900): opt-in المدرس للإرسال الآلي الحدثي لواتساب — افتراضي false، ولا أثر له قبل بوابة المنصة platform_settings.whatsapp_auto_send_enabled';
comment on column public.teacher_whatsapp_config.auto_send_daily_quota is
  '0073 (3A-900): حصة الرسائل الآلية لكل مركز/يوم (معتمدة من المدير 2026-11-25 — قابلة للضبط لكل مركز)؛ تُعدّ من whatsapp_message_log بـ source=auto';

alter table public.guardians
  add column whatsapp_opt_out boolean not null default false;

comment on column public.guardians.whatsapp_opt_out is
  '0073 (3A-900): مخرج إيقاف ولي الأمر عن رسائل واتساب الآلية (سياسة المهمة 15: علاقة خدمة قائمة + مخرج إيقاف واضح) — السلم يتخطى من فعّله';

alter table public.whatsapp_message_log
  add column source text not null default 'manual';

alter table public.whatsapp_message_log
  add constraint whatsapp_message_log_source_check
  check (source in ('manual', 'auto'));

-- ----------------------------------------------------------------------------
-- أ٢) بوابة المنصة — مطفأة افتراضياً (التفعيل قرار ق4/تشغيل لاحق)
-- ----------------------------------------------------------------------------
insert into public.platform_settings (key, value)
values ('whatsapp_auto_send_enabled', 'false'::jsonb)
on conflict (key) do nothing;

commit;

begin;

-- ----------------------------------------------------------------------------
-- ب) جدول حالة «شوهدت» لنظام «جديد» — حالة لكل مدرس
-- ----------------------------------------------------------------------------
create table public.teacher_feature_seen (
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  feature_id text not null,
  seen_by    uuid references auth.users (id) on delete set null,
  seen_at    timestamptz not null default now(),
  primary key (teacher_id, feature_id)
);

alter table public.teacher_feature_seen enable row level security;

-- نمط سجل النشاط (0009): المالك أو أي عضو فعّال يقرأ ويختم — الحالة
-- حالة السنتر، والختم عند أول استخدام من أيٍّ منهم هو السلوك المقصود
create policy teacher_feature_seen_member_select
  on public.teacher_feature_seen
  for select using (
    public.is_teacher_owner(teacher_id) or public.is_teacher_member(teacher_id)
  );
create policy teacher_feature_seen_member_insert
  on public.teacher_feature_seen
  for insert with check (
    public.is_teacher_owner(teacher_id) or public.is_teacher_member(teacher_id)
  );
create policy teacher_feature_seen_member_update
  on public.teacher_feature_seen
  for update using (
    public.is_teacher_owner(teacher_id) or public.is_teacher_member(teacher_id)
  ) with check (
    public.is_teacher_owner(teacher_id) or public.is_teacher_member(teacher_id)
  );

grant select, insert, update on public.teacher_feature_seen to authenticated;
grant all on public.teacher_feature_seen to service_role;

commit;

begin;

-- ----------------------------------------------------------------------------
-- أ٣) الإرسال الداخلي — نمط push_dispatch (0014): سرّ Vault + pg_net،
--     داخلي بالكامل (مسحوب من الجميع؛ المستدعي الوحيد هو السلم).
-- ----------------------------------------------------------------------------
create or replace function public.whatsapp_auto_dispatch(
  p_teacher_id uuid,
  p_kind text,
  p_phone text,
  p_params text[],
  p_invoice_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'whatsapp_auto_internal_secret'
    limit 1;

    -- بلا سرّ مضبوط لا نداء — الحدث الأصلي لا يتأثر إطلاقاً
    if v_secret is null or v_secret = '' then
      return;
    end if;

    perform net.http_post(
      url := 'https://qkwdyqocazwhojpyifbv.supabase.co/functions/v1/send-whatsapp-message',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-wa-internal-secret', v_secret
      ),
      body := jsonb_build_object(
        'internal', true,
        'teacher_id', p_teacher_id,
        'kind', p_kind,
        'to', p_phone,
        'params', to_jsonb(p_params),
        'invoice_id', p_invoice_id
      )
    );
  exception when others then
    -- fail-safe مقصود وموثّق: إرسال فاشل لا يكسر العملية الأصلية أبداً
    null;
  end;
end $$;

revoke execute on function public.whatsapp_auto_dispatch(uuid, text, text, text[], uuid)
  from public, anon, authenticated;

commit;

begin;

-- ----------------------------------------------------------------------------
-- أ٤) السلّم — نسخة 0050 حرفياً + امتداد درجة الواتساب بالإرسال الآلي.
--     الدرجتان ١ و٢ والفحوص الأربعة الأولى لدرجة الواتساب بلا أي تغيير؛
--     الامتداد يبدأ فقط بعد اكتمال الجاهزية، وصفّا queued القائمان
--     (بوابة/ opt-in مطفأة) يحتفظان بنصّهما الحرفي.
-- ----------------------------------------------------------------------------
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
  v_guardian_used uuid;
  v_platform_auto boolean;
  v_opt_out boolean;
  v_secret_ready boolean;
  v_auto_today int;
  v_student_name text;
  v_session_date date;
  v_params text[];
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

    -- الدرجة ٣: واتساب — جاهزية قناة المدرس لنوع هذا الحدث
    v_wa_kind := case new.kind
      when 'arrived' then 'arrival_notice'
      when 'left' then 'departure_notice'
      when 'absence' then 'absence_notice'
      when 'invoice_issued' then 'invoice_issued'
    end;

    select c.enabled, c.token_vault_secret_id,
           c.auto_send_enabled, c.auto_send_daily_quota
    into v_cfg
    from public.teacher_whatsapp_config c
    where c.teacher_id = new.teacher_id;

    select g.phone, g.id into v_phone, v_guardian_used
    from public.guardians g
    where g.id = new.guardian_id;

    if v_phone is null then
      select g.phone, g.id into v_phone, v_guardian_used
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
      -- اكتملت جاهزية 0050 — امتداد 0073: بوابات الإرسال الآلي
      select coalesce(
        (select (value)::text = 'true'
           from public.platform_settings
          where key = 'whatsapp_auto_send_enabled'),
        false)
      into v_platform_auto;

      if not v_platform_auto or not coalesce(v_cfg.auto_send_enabled, false) then
        -- السلوك القائم حرفياً: متاح للمدرس يدوياً من التطبيق
        insert into public.guardian_notification_deliveries
          (notification_id, teacher_id, channel, status, detail)
        values
          (new.id, new.teacher_id, 'whatsapp', 'queued',
           'teacher channel ready — send is teacher-initiated from the app (3A-300); outcome lands in whatsapp_message_log');
      else
        select coalesce(g.whatsapp_opt_out, false) into v_opt_out
        from public.guardians g
        where g.id = v_guardian_used;

        select exists (
          select 1 from vault.decrypted_secrets
          where name = 'whatsapp_auto_internal_secret'
            and decrypted_secret <> '')
        into v_secret_ready;

        select count(*) into v_auto_today
        from public.whatsapp_message_log l
        where l.teacher_id = new.teacher_id
          and l.source = 'auto'
          and l.created_at >= date_trunc('day', now());

        if coalesce(v_opt_out, false) then
          insert into public.guardian_notification_deliveries
            (notification_id, teacher_id, channel, status, detail)
          values
            (new.id, new.teacher_id, 'whatsapp', 'skipped',
             'guardian opted out of WhatsApp auto-notifications');
        elsif not v_secret_ready then
          insert into public.guardian_notification_deliveries
            (notification_id, teacher_id, channel, status, detail)
          values
            (new.id, new.teacher_id, 'whatsapp', 'skipped',
             'auto-send internal secret is not configured');
        elsif v_auto_today >= v_cfg.auto_send_daily_quota then
          insert into public.guardian_notification_deliveries
            (notification_id, teacher_id, channel, status, detail)
          values
            (new.id, new.teacher_id, 'whatsapp', 'skipped',
             'centre daily auto-send quota reached (' ||
               v_cfg.auto_send_daily_quota || '/day)');
        else
          -- بناء المعاملات خادمياً (ترتيب كتالوج القوالب 0045):
          -- وصول/مغادرة [الطالب، وقت الحدث] — غياب [الطالب، تاريخ
          -- الحصة] — فاتورة ['', الطالب] والمبلغ يُحلّ في الدالة
          -- لحظة التنفيذ من invoice_balances (انظر الترويسة).
          select s.name into v_student_name
          from public.students s
          where s.id = new.student_id;

          if new.session_id is not null then
            select se.session_date into v_session_date
            from public.sessions se
            where se.id = new.session_id;
          end if;

          v_params := case v_wa_kind
            when 'arrival_notice' then
              array[v_student_name, to_char(new.event_at, 'HH24:MI')]
            when 'departure_notice' then
              array[v_student_name, to_char(new.event_at, 'HH24:MI')]
            when 'absence_notice' then
              array[v_student_name, v_session_date::text]
            when 'invoice_issued' then
              array['', v_student_name]
          end;

          perform public.whatsapp_auto_dispatch(
            new.teacher_id, v_wa_kind, v_phone, v_params, new.invoice_id);

          insert into public.guardian_notification_deliveries
            (notification_id, teacher_id, channel, status, detail)
          values
            (new.id, new.teacher_id, 'whatsapp', 'attempted',
             'auto-send dispatched via internal channel (0073); outcome lands in whatsapp_message_log (source=auto)');
        end if;
      end if;
    end if;
  exception when others then
    -- fail-safe مقصود وموثّق: سجل السلّم لا يكسر الإشعار أبداً
    null;
  end;
  return new;
end $$;

commit;

begin;

-- ----------------------------------------------------------------------------
-- ب٢) حذف الحساب (قاعدة 0046): إعادة بناء بنسخة 0065 حرفياً +
--     teacher_feature_seen في القائمة.
-- ----------------------------------------------------------------------------
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
    'teacher_feedback', 'support_tickets', 'teacher_feature_seen'
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
-- نهاية 0073 — أعمدة جديدة: teacher_whatsapp_config.auto_send_enabled /
-- auto_send_daily_quota + guardians.whatsapp_opt_out +
-- whatsapp_message_log.source | جدول جديد: teacher_feature_seen |
-- دالة جديدة: whatsapp_auto_dispatch | مستبدلة: guardian_notification_
-- ladder (امتداد آلي) + delete_my_teacher_account (+ جدول «جديد») |
-- بذرة: platform_settings.whatsapp_auto_send_enabled = false.
-- التفعيل (عند قرار ق4 فقط): ضبط سرّ Vault ‏'whatsapp_auto_internal_secret'
-- + سرّ الدالة WHATSAPP_AUTO_INTERNAL_SECRET بنفس القيمة + نشر الدالة
-- بالوضع الداخلي + قلب مفتاح المنصة + تفعيل كل سنتر من إعداداته.
-- ============================================================================
