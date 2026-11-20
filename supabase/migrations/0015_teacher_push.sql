-- ============================================================================
-- تطبيق المدرس — 0015_teacher_push.sql
-- Phase 4 / الخطوة 3: Push للمدرس (فوري + ملخص يومي مجدول)
--
-- ما تبنيه هذه الهجرة فوق بنية الخطوتين 1 و2 (0013/0014):
-- • مرسِل موازٍ للمدرس push_dispatch_teacher: نفس نمط push_dispatch
--   حرفياً (السرّ المشترك من Vault ‏push_internal_secret + pg_net إلى
--   Edge Function ‏send-push + fail-safe كامل) لكن بمحدد
--   teacher_id + subscriber_kind='teacher' — لأن push_dispatch في 0014
--   يحدد بـ student_id عمداً فلا تصل اشتراكات المدرس (بلا student_id)
--   لأحداث الطلاب. الدالتان منفصلتان بوعي: توسيع محددات 0014 كان
--   سيغيّر عقداً أمنياً موثّقاً، والمحاذاة هنا بالمحدد الصريح للمدرس.
-- • حدثان فوريان بمشغّلات fail-safe (معالج استثناءات يبتلع أي خطأ —
--   فشل الإرسال لا يكسر رفع الإثبات ولا تسليم الامتحان أبداً):
--   1) إثبات دفع جديد من البوابة (payment_proofs ‏0005): يُطلَق عند
--      اكتمال الرفع فعلياً (uploaded_at يُضبط من RPC التأكيد) لا عند
--      إنشاء الصف — فالإثباتات اليتيمة من رفع فاشل (uploaded_at خالٍ
--      ولا تظهر للمدرس أصلاً) لا تُنتج تنبيهاً كاذباً.
--   2) امتحان إلكتروني مُسلَّم (exam_attempts ‏0010): عند الانتقال إلى
--      submitted — مشغّل مستقل عن مشغّل 0014 الخاص بالطالب/ولي الأمر
--      (ذاك لم يُمسّ إطلاقاً)، والانتقال يحدث مرة واحدة لكل محاولة
--      فلا تكرار.
-- • ملخص يومي مجدول: pg_cron (يُفعَّل هنا إن غاب) بوظيفة دورية كل
--   15 دقيقة تنادي push_send_daily_digests، وهي لكل مدرس: مفعِّل
--   للملخص من إعداداته + حان وقته اليوم (بتوقيت Africa/Cairo) + لم
--   يُرسل له اليوم بعد + عنده اشتراك teacher نشط واحد على الأقل.
--   منع التكرار بطبقتين (توثيق التصميم):
--   أ) عمود teacher_settings.push_daily_digest_last_sent_on يُدّعى
--      (claim) بتحديث مشروط (لا يساوي تاريخ اليوم القاهري) قبل أي
--      حساب/إرسال — فالاستدعاءات المتزامنة أو المتكررة في نفس اليوم
--      تجد الادعاء قائماً فتتخطى، حتى لو فشل الإرسال نفسه بعدها
--      (لا عواصف إعادة محاولة؛ الإرسال نفسه مسجّل في
--      push_delivery_log من الـ Edge Function).
--   ب) جدول push_digest_log بقيد فريد (teacher_id, digest_date)
--      سجلّ تدقيقي لكل ملخص مُرسل (محتواه العددي كما بُني) — الإدراج
--      ON CONFLICT DO NOTHING بوابة ثانية: إن وُجد سجلّ اليوم لا
--      يُرسل مرة أخرى مهما حدث للعمود.
--   المحتوى: حصص اليوم (عدد الحصص المجدولة اليوم + أقرب حصة قادمة
--   اليوم بمجموعتها ووقتها إن وُجدت) + المتأخرات (فواتير أشهر سابقة
--   برصيد موجب من invoice_balances: العدد والإجمالي).
-- • إعدادات المدرس الجديدة على teacher_settings (لا جدول إعدادات
--   جديداً): push_daily_digest_enabled (افتراضي true) و
--   push_daily_digest_time (افتراضي 07:30 — صباحاً قبل حصص اليوم
--   بتوقيت القاهرة) وpush_daily_digest_last_sent_on (يديره النظام
--   فقط كعلامة ادعاء، لا تحرّره الواجهة).
--
-- النسخة الاحتياطية: جدول جديد واحد push_digest_log يدخل النسخة
-- قسماً اختيارياً أخيراً (26 ← 27 جدولاً، إصدار الصيغة يبقى 1 بنفس
-- قاعدة الأقسام الاختيارية). الأعمدة الثلاثة الجديدة على
-- teacher_settings تنتقل ضمن صف الإعدادات عبر SETTINGS_COLS
-- (التفعيل والوقت يُدمجان عند الاستيراد؛ last_sent_on علامة تشغيلية
-- لا تُستورد أبداً فتبقى قيمة الحساب الحالي). امتدادا pg_cron وجدولته
-- بنية تشغيلية لا تدخل أي نسخة.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- pg_cron: جدولة قاعدة البيانات (الملخص اليومي) — pg_net موجود من 0014
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;

commit;

begin;

-- ----------------------------------------------------------------------------
-- إعدادات الملخص اليومي على teacher_settings + علامة منع التكرار
-- ----------------------------------------------------------------------------
alter table public.teacher_settings
  add column push_daily_digest_enabled boolean not null default true,
  add column push_daily_digest_time time not null default '07:30',
  add column push_daily_digest_last_sent_on date;

-- ----------------------------------------------------------------------------
-- سجل إرسال الملخص اليومي — تدقيقي + بوابة منع تكرار ثانية بقيد فريد
-- ----------------------------------------------------------------------------
create table public.push_digest_log (
  id             uuid primary key default gen_random_uuid(),
  teacher_id     uuid not null references public.teachers (id) on delete cascade,
  -- تاريخ اليوم بتوقيت القاهرة الذي يخصّه هذا الملخص
  digest_date    date not null,
  sessions_count int not null default 0,
  overdue_count  int not null default 0,
  overdue_amount numeric(12,2) not null default 0,
  sent_at        timestamptz not null default now(),
  unique (teacher_id, digest_date)
);
create index push_digest_log_teacher_idx
  on public.push_digest_log (teacher_id, digest_date desc);

alter table public.push_digest_log enable row level security;

-- المالك يقرأ سجل ملخصات سنتره فقط — لا كتابة لأي عميل إطلاقاً
-- (الكتابة من دالة الملخص security definer فقط)
create policy push_digest_log_owner_select on public.push_digest_log
  for select using (teacher_id = auth.uid());

commit;

begin;

-- ============================================================================
-- المرسِل الداخلي للمدرس — موازٍ لـ push_dispatch ‏(0014) بنفس النمط:
-- السرّ من Vault + pg_net إلى send-push، لكن بمحدد teacher_id +
-- subscriber_kind='teacher' فيختار اشتراكات المدرس/المساعدين لسنتر
-- الحدث حصراً. داخلي فقط (مسحوب من الجميع) ولا يُستدعى إلا من
-- مشغّلات/دالة الملخص أدناه. Fail-safe بالكامل: أي فشل يُبتلع بصمت.
-- ============================================================================
create or replace function public.push_dispatch_teacher(
  p_title text,
  p_body text,
  p_teacher_id uuid,
  p_tag text default null,
  p_url text default null
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
    where name = 'push_internal_secret'
    limit 1;

    -- بلا سرّ مضبوط لا إرسال — الحدث الأصلي لا يتأثر إطلاقاً
    if v_secret is null or v_secret = '' then
      return;
    end if;

    perform net.http_post(
      url := 'https://qkwdyqocazwhojpyifbv.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-secret', v_secret
      ),
      body := jsonb_build_object(
        'payload', jsonb_build_object(
          'title', p_title,
          'body', p_body,
          'url', coalesce(p_url, '/'),
          'tag', p_tag
        ),
        'teacher_id', p_teacher_id,
        'subscriber_kind', 'teacher'
      )
    );
  exception when others then
    -- fail-safe مقصود وموثّق: إرسال فاشل لا يكسر العملية الأصلية أبداً
    null;
  end;
end $$;

revoke execute on function public.push_dispatch_teacher(text, text, uuid, text, text)
  from public, anon, authenticated;

commit;

begin;

-- ============================================================================
-- مشغّلات الأحداث الفورية للمدرس — كلها fail-safe عبر
-- push_dispatch_teacher وحدها.
-- ============================================================================

-- ١) إثبات دفع جديد اكتمل رفعه من البوابة: الإدراج المباشر بـ
-- uploaded_at مضبوطاً، أو انتقال uploaded_at من خالٍ لقيمة (خطوة
-- تأكيد الرفع في RPC ‏0005) — وبشرط بقائه pending (حالة المراجعة).
create or replace function public.push_teacher_on_payment_proof()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_name text;
  v_centre text;
begin
  begin
    if new.status <> 'pending' or new.uploaded_at is null then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.uploaded_at is not null then
      return new;
    end if;

    select name into v_student_name from public.students where id = new.student_id;
    v_centre := public.push_centre_name(new.teacher_id);

    perform public.push_dispatch_teacher(
      v_centre,
      'إثبات دفع جديد بانتظار الاعتماد من الطالب ' ||
        coalesce(v_student_name, '') || ' بقيمة ' ||
        rtrim(rtrim(to_char(new.amount, 'FM999999999990.00'), '0'), '.') || ' ج',
      new.teacher_id,
      'payment-proof-' || new.id::text,
      '/invoices'
    );
  exception when others then
    null;
  end;
  return new;
end $$;

create trigger payment_proofs_teacher_push_trg
  after insert or update of uploaded_at on public.payment_proofs
  for each row execute function public.push_teacher_on_payment_proof();

-- ٢) امتحان إلكتروني مُسلَّم: انتقال exam_attempts إلى submitted (مرة
-- واحدة لكل محاولة — إعادة التسليم في RPC ‏0010 لا تحدّث الحالة).
-- مشغّل مستقل تماماً عن exam_attempts_push_trg ‏(0014، للطالب/ولي
-- الأمر) الذي يبقى كما هو بلا أي تعديل.
create or replace function public.push_teacher_on_exam_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_student_name text;
  v_centre text;
begin
  begin
    if new.status <> 'submitted' or old.status = 'submitted' then
      return new;
    end if;

    select a.title into v_title
    from public.online_exams oe
    join public.assessments a on a.id = oe.assessment_id
    where oe.id = new.exam_id;
    select name into v_student_name from public.students where id = new.student_id;
    v_centre := public.push_centre_name(new.teacher_id);

    perform public.push_dispatch_teacher(
      v_centre,
      'الطالب ' || coalesce(v_student_name, '') || ' سلّم امتحان «' ||
        coalesce(v_title, '') || '»: ' ||
        rtrim(rtrim(to_char(new.score, 'FM999999999990.00'), '0'), '.') ||
        ' من ' ||
        rtrim(rtrim(to_char(new.max_score, 'FM999999999990.00'), '0'), '.') ||
        ' (' || rtrim(rtrim(to_char(new.pct, 'FM999990.00'), '0'), '.') || '%)',
      new.teacher_id,
      'exam-attempt-teacher-' || new.id::text,
      '/'
    );
  exception when others then
    null;
  end;
  return new;
end $$;

create trigger exam_attempts_teacher_push_trg
  after update on public.exam_attempts
  for each row execute function public.push_teacher_on_exam_submitted();

commit;

begin;

-- ============================================================================
-- الملخص اليومي — دالة الإرسال (تستدعيها جدولة pg_cron كل 15 دقيقة،
-- وتُستدعى يدوياً في الاختبارات/الصيانة). داخلية: مسحوبة من الجميع.
-- تعيد عدد الملخصات المُرسلة في هذا الاستدعاء.
--
-- لكل مدرس مستحقّ (مفعِّل + حان وقته القاهري اليوم + لم يُدَّعَ اليوم
-- + عنده اشتراك teacher نشط): يُدّعى اليوم أولاً بتحديث مشروط على
-- push_daily_digest_last_sent_on (منع التكرار — الطبقة أ)، ثم يُبنى
-- المحتوى ويُسجَّل في push_digest_log (الطبقة ب: قيد فريد + ON
-- CONFLICT DO NOTHING — بلا سجلّ جديد لا إرسال)، ثم يُرسل Push واحد
-- عبر push_dispatch_teacher. فشل مدرس واحد لا يوقف الباقين (معالج
-- استثناءات لكل مدرس)، وفشل الإرسال نفسه لا يكسر شيئاً أبداً.
-- ============================================================================
create or replace function public.push_send_daily_digests()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_now_time time := (now() at time zone 'Africa/Cairo')::time;
  r record;
  v_sessions int;
  v_next_time time;
  v_next_group text;
  v_overdue_count int;
  v_overdue_amount numeric;
  v_body text;
  v_logged boolean;
  v_sent int := 0;
begin
  for r in
    select ts.teacher_id
    from public.teacher_settings ts
    where ts.push_daily_digest_enabled
      and ts.push_daily_digest_time <= v_now_time
      and ts.push_daily_digest_last_sent_on is distinct from v_today
      and exists (
        select 1 from public.push_subscriptions ps
        where ps.teacher_id = ts.teacher_id
          and ps.subscriber_kind = 'teacher'
          and ps.is_active
      )
  loop
    begin
      -- الطبقة أ: ادعاء اليوم بتحديث مشروط — الاستدعاء المتزامن/المكرر
      -- في نفس اليوم لا يجد صفاً ليحدّثه فيتخطى هذا المدرس بصمت.
      update public.teacher_settings
      set push_daily_digest_last_sent_on = v_today
      where teacher_id = r.teacher_id
        and push_daily_digest_last_sent_on is distinct from v_today;
      if not found then
        continue;
      end if;

      -- حصص اليوم: المجدولة غير الملغاة + أقرب حصة قادمة اليوم
      select count(*) into v_sessions
      from public.sessions s
      where s.teacher_id = r.teacher_id
        and s.session_date = v_today
        and s.status <> 'cancelled';

      select s.start_time, g.name into v_next_time, v_next_group
      from public.sessions s
      join public.groups g on g.id = s.group_id
      where s.teacher_id = r.teacher_id
        and s.session_date = v_today
        and s.status = 'scheduled'
        and s.start_time >= v_now_time
      order by s.start_time
      limit 1;

      -- المتأخرات: فواتير أشهر قبل الشهر الحالي برصيد موجب
      select count(*), coalesce(sum(ib.balance), 0)
        into v_overdue_count, v_overdue_amount
      from public.invoice_balances ib
      where ib.teacher_id = r.teacher_id
        and ib.balance > 0
        and ib.period_month < date_trunc('month', v_today)::date;

      -- الطبقة ب: سجلّ اليوم الفريد — بلا إدراج جديد لا إرسال
      insert into public.push_digest_log (
        teacher_id, digest_date, sessions_count, overdue_count, overdue_amount
      ) values (
        r.teacher_id, v_today, v_sessions, v_overdue_count, v_overdue_amount
      )
      on conflict (teacher_id, digest_date) do nothing
      returning true into v_logged;
      if v_logged is null then
        continue;
      end if;

      v_body := 'حصص اليوم: ' || v_sessions;
      if v_next_time is not null then
        v_body := v_body || ' — أقرب حصة: ' || coalesce(v_next_group, '') ||
          ' الساعة ' || to_char(v_next_time, 'HH24:MI');
      end if;
      v_body := v_body || ' • متأخرات: ' || v_overdue_count ||
        ' فاتورة بقيمة ' ||
        rtrim(rtrim(to_char(v_overdue_amount, 'FM999999999990.00'), '0'), '.') ||
        ' ج';

      perform public.push_dispatch_teacher(
        public.push_centre_name(r.teacher_id),
        'ملخص اليوم — ' || v_body,
        r.teacher_id,
        'daily-digest-' || v_today::text,
        '/'
      );
      v_sent := v_sent + 1;
    exception when others then
      -- مدرس واحد فاشل لا يوقف ملخصات الباقين أبداً
      null;
    end;
  end loop;

  return v_sent;
end $$;

revoke execute on function public.push_send_daily_digests()
  from public, anon, authenticated;

commit;

begin;

-- ----------------------------------------------------------------------------
-- الجدولة العملية: فحص دوري قصير كل 15 دقيقة — الدالة نفسها تقرر من
-- حان وقته القاهري اليوم ولم يُرسل له بعد (الوقت لكل مدرس من إعداداته
-- لا من الجدولة، فتغيير المدرس لوقته يسري بلا لمس للجدولة).
-- cron.schedule باسم ثابت يجعل إعادة التطبيق تحديثاً لا تكراراً.
-- ----------------------------------------------------------------------------
select cron.schedule(
  'teacher-push-daily-digest',
  '*/15 * * * *',
  $$select public.push_send_daily_digests()$$
);

commit;

-- ============================================================================
-- نهاية 0015 — امتداد: pg_cron | أعمدة teacher_settings:
-- push_daily_digest_enabled / push_daily_digest_time /
-- push_daily_digest_last_sent_on | جدول جديد: push_digest_log (يدخل
-- النسخة الاحتياطية 26 ← 27) | دوال داخلية مسحوبة:
-- push_dispatch_teacher + push_send_daily_digests | مشغّلات:
-- payment_proofs_teacher_push_trg + exam_attempts_teacher_push_trg
-- (fail-safe) | جدولة cron: teacher-push-daily-digest كل 15 دقيقة.
-- مشغّلات ودوال 0014 (للبوابات) لم تُمسّ إطلاقاً.
-- ============================================================================
