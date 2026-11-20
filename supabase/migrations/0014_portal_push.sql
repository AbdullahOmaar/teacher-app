-- ============================================================================
-- تطبيق المدرس — 0014_portal_push.sql
-- Phase 4 / الخطوة 2: Push لأولياء الأمور والطلاب عبر البوابات
--
-- اشتراك اختياري من بوابة ولي الأمر وبوابة الطالب (ربط الاشتراك بتوكن
-- البوابة الذي أذن به)، وإرسال خادمي عند ثلاثة أحداث تخص الطالب:
-- وصول/انصراف (من guardian_notifications ‏0012)، تسجيل دفعة (يشمل
-- اعتماد إثبات الدفع 0005 لأنه ينشئ دفعة حقيقية بنفس المسار)، وإتاحة
-- نتيجة امتحان إلكتروني مُسلَّم (0010). الإرسال الفعلي من Edge Function
-- ‏send-push (0013) حصراً — هذه الهجرة تبني الربط والمشغّلات فقط.
--
-- نموذج الاشتراك من البوابات (RPC بـ security definer، نمط 0005/0011):
-- • لا وصول anon مباشر لجدول push_subscriptions إطلاقاً (لا سياسات له
--   من 0013) — كل وصول البوابات عبر ست دوال: اشتراك/إيقاف/حالة لكل
--   بوابة، تتحقق من التوكن بدوال التحقق القائمة حرفياً:
--   portal_validate_token لبوابة ولي الأمر (هاش + ربط الطالب بوليّ
--   التوكن) وstudent_portal_resolve_token لبوابة الطالب.
-- • الاشتراك يُحفظ بـ upsert على endpoint الفريد: نفس المتصفح يعيد
--   التفعيل فيُنشَّط الصف نفسه وتُحدَّث مفاتيحه وربطه (portal_token_id
--   لقطة صف التوكن المُصادِق + guardian_id لاشتراك ولي الأمر)، فلا
--   صفوف مكررة لنفس المتصفح أبداً.
-- • الإيقاف من البوابة يعطّل الصف (is_active=false + سبب) ولا يحذفه،
--   والعميل يلغي اشتراك المتصفح نفسه أيضاً — والمرسِل (0013) لا يختار
--   إلا النشط، فالموقوف لا يصله شيء بأي مسار.
--
-- آلية إرسال الأحداث — من جهة الخادم بـ pg_net (قرار موثّق):
-- • دالة داخلية واحدة push_dispatch (مسحوبة من الجميع): تقرأ السرّ
--   المشترك من Supabase Vault (سرّ باسم push_internal_secret في مخطط
--   vault — لا يصل إليه أي عميل ولا أي سياسة RLS، والدالة security
--   definer بصلاحيات مالكها فقط)، وتبني جسم طلب send-push بمحدد
--   student_id (يغطي اشتراكات guardian وstudent للطالب معاً — اشتراكات
--   teacher ليس لها student_id فلا تصلها أحداث الطلاب أبداً)، وتسجّله
--   عبر net.http_post (إرسال غير متزامن: الحدث الأصلي لا ينتظر الشبكة).
-- • السرّ دُوِّر عند تنفيذ هذه الخطوة: قيمة PUSH_INTERNAL_SECRET
--   الأصلية من الخطوة 1 غير قابلة للقراءة راجعاً، فوُلّدت قيمة جديدة
--   ضُبطت سرّاً للـ Edge Function وخُزّنت هي نفسها في Vault — دون أن
--   تظهر القيمة في أي ملف أو مخرجات (إجراء تشغيلي خارج هذه الهجرة).
-- • كل مشغّل حدث داخل معالج استثناءات يبتلع أي خطأ (نفس نمط 0012):
--   فشل الإرسال — أو غياب السرّ/الامتداد — لا يكسر حفظ الحضور ولا
--   تسجيل الدفعة ولا تسليم الامتحان أبداً. والنتيجة تُسجَّل في
--   push_delivery_log من الـ Edge Function نفسها كما في 0013.
--
-- عدم التكرار (idempotency) ببنية المصادر نفسها:
-- • الوصول/المغادرة: المشغّل على إدراج guardian_notifications، وقيده
--   الفريد (session, student, kind) يضمن صفاً واحداً للحدث — فلا Push
--   مكرراً أبداً لنفس الوصول/المغادرة.
-- • الدفع: مشغّل على إدراج payments للمبالغ الموجبة غير العكسية فقط —
--   اعتماد الإثبات يمرّ بهذا الإدراج نفسه (createPayment) فلا إشعاران
--   لاعتماد واحد، والدفعات العكسية/المبطلة لا تُشعِر.
-- • الامتحان: مشغّل على انتقال exam_attempts إلى submitted من حالة
--   غير مُسلَّمة — إعادة التسليم في RPC ‏0010 ترجع مبكراً بلا تحديث
--   حالة، والانتقال نفسه يحدث مرة واحدة لكل محاولة.
--
-- النسخة الاحتياطية: لا جدول جديداً في هذه الخطوة (push_subscriptions
-- دخل النسخة في 0013) — تبقى 26 جدولاً كما هي، وسرّ Vault وامتداد
-- pg_net بنية تشغيلية لا تدخل أي نسخة.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- pg_net: قناة HTTP غير المتزامنة من القاعدة إلى الـ Edge Function
-- ----------------------------------------------------------------------------
create extension if not exists pg_net;

commit;

begin;

-- ============================================================================
-- المرسِل الداخلي — يقرأ السرّ من Vault وينادي send-push عبر pg_net.
-- داخلي فقط: يُسحب من الجميع ولا يُستدعى إلا من مشغّلات الأحداث أدناه
-- (تعمل بصلاحيات مالكها). Fail-safe بالكامل: أي فشل يُبتلع بصمت.
-- ============================================================================
create or replace function public.push_dispatch(
  p_title text,
  p_body text,
  p_student_id uuid,
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
        'student_id', p_student_id
      )
    );
  exception when others then
    -- fail-safe مقصود وموثّق: إرسال فاشل لا يكسر العملية الأصلية أبداً
    null;
  end;
end $$;

revoke execute on function public.push_dispatch(text, text, uuid, text, text)
  from public, anon, authenticated;

-- اسم السنتر لعناوين الإشعارات: الاسم التجاري الأبيض (0008) وإلا اسم
-- المدرس — داخلية لمشغّلات الأحداث فقط.
create or replace function public.push_centre_name(p_teacher_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(ts.brand_name), ''),
    nullif(btrim(t.display_name), ''),
    'السنتر'
  )
  from public.teachers t
  left join public.teacher_settings ts on ts.teacher_id = t.id
  where t.id = p_teacher_id;
$$;

revoke execute on function public.push_centre_name(uuid)
  from public, anon, authenticated;

commit;

begin;

-- ============================================================================
-- بوابة ولي الأمر — اشتراك/إيقاف/حالة Push (بالتوكن، نمط 0005 حرفياً)
-- ============================================================================

-- تسجيل اشتراك متصفح البوابة الحالي لهذا الطالب: upsert على endpoint
-- الفريد يربطه بتوكن البوابة المُصادِق وبوليّ أمره، ويعيد تنشيط أي صف
-- موقوف لنفس نقطة النهاية (إعادة تفعيل = نفس الصف بمفاتيح محدّثة).
create or replace function public.portal_push_subscribe(
  p_token text,
  p_student_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.guardian_access_tokens;
  v_id uuid;
begin
  tok := public.portal_validate_token(p_token, p_student_id);

  if p_endpoint is null or btrim(p_endpoint) = ''
     or p_p256dh is null or btrim(p_p256dh) = ''
     or p_auth is null or btrim(p_auth) = '' then
    raise exception 'invalid subscription';
  end if;

  insert into public.push_subscriptions (
    teacher_id, subscriber_kind, portal_token_id, guardian_id, student_id,
    endpoint, p256dh, auth, user_agent, is_active, disabled_at, disabled_reason
  ) values (
    tok.teacher_id, 'guardian', tok.id, tok.guardian_id, p_student_id,
    p_endpoint, p_p256dh, p_auth,
    nullif(left(coalesce(p_user_agent, ''), 300), ''),
    true, null, null
  )
  on conflict (endpoint) do update set
    teacher_id = excluded.teacher_id,
    subscriber_kind = excluded.subscriber_kind,
    user_id = null,
    portal_token_id = excluded.portal_token_id,
    guardian_id = excluded.guardian_id,
    student_id = excluded.student_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    is_active = true,
    disabled_at = null,
    disabled_reason = null
  returning id into v_id;

  return jsonb_build_object('subscribed', true, 'subscription_id', v_id);
end $$;

-- إيقاف اشتراك هذا المتصفح من البوابة نفسها: تعطيل الصف (لا حذف) —
-- مقيد بنقطة النهاية وبطالب التوكن وبنوع guardian معاً، فلا يقدر
-- توكن أن يعطّل اشتراك طالب آخر أو اشتراك مدرس.
create or replace function public.portal_push_unsubscribe(
  p_token text,
  p_student_id uuid,
  p_endpoint text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.guardian_access_tokens;
  v_updated int;
begin
  tok := public.portal_validate_token(p_token, p_student_id);

  update public.push_subscriptions
  set is_active = false,
      disabled_at = now(),
      disabled_reason = 'unsubscribed by user'
  where endpoint = p_endpoint
    and student_id = p_student_id
    and teacher_id = tok.teacher_id
    and subscriber_kind = 'guardian';
  get diagnostics v_updated = row_count;

  return jsonb_build_object('unsubscribed', true, 'updated', v_updated);
end $$;

-- حالة اشتراك متصفح البوابة الحالي: هل نقطة النهاية هذه مشتركة ونشطة
-- كاشتراك guardian لهذا الطالب؟ (لبناء حالة الزر في الواجهة)
create or replace function public.portal_push_status(
  p_token text,
  p_student_id uuid,
  p_endpoint text
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

  return jsonb_build_object('subscribed', exists (
    select 1 from public.push_subscriptions
    where endpoint = p_endpoint
      and student_id = p_student_id
      and teacher_id = tok.teacher_id
      and subscriber_kind = 'guardian'
      and is_active
  ));
end $$;

grant execute on function public.portal_push_subscribe(text, uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.portal_push_unsubscribe(text, uuid, text) to anon, authenticated;
grant execute on function public.portal_push_status(text, uuid, text) to anon, authenticated;

commit;

begin;

-- ============================================================================
-- بوابة الطالب — اشتراك/إيقاف/حالة Push (بالتوكن، نمط 0011 حرفياً)
-- ============================================================================

create or replace function public.student_portal_push_subscribe(
  p_token text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_id uuid;
begin
  select * into r from public.student_portal_resolve_token(p_token);

  if p_endpoint is null or btrim(p_endpoint) = ''
     or p_p256dh is null or btrim(p_p256dh) = ''
     or p_auth is null or btrim(p_auth) = '' then
    raise exception 'invalid subscription';
  end if;

  insert into public.push_subscriptions (
    teacher_id, subscriber_kind, portal_token_id, guardian_id, student_id,
    endpoint, p256dh, auth, user_agent, is_active, disabled_at, disabled_reason
  ) values (
    r.teacher_id, 'student', r.token_id, null, r.student_id,
    p_endpoint, p_p256dh, p_auth,
    nullif(left(coalesce(p_user_agent, ''), 300), ''),
    true, null, null
  )
  on conflict (endpoint) do update set
    teacher_id = excluded.teacher_id,
    subscriber_kind = excluded.subscriber_kind,
    user_id = null,
    portal_token_id = excluded.portal_token_id,
    guardian_id = excluded.guardian_id,
    student_id = excluded.student_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    is_active = true,
    disabled_at = null,
    disabled_reason = null
  returning id into v_id;

  return jsonb_build_object('subscribed', true, 'subscription_id', v_id);
end $$;

create or replace function public.student_portal_push_unsubscribe(
  p_token text,
  p_endpoint text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_updated int;
begin
  select * into r from public.student_portal_resolve_token(p_token);

  update public.push_subscriptions
  set is_active = false,
      disabled_at = now(),
      disabled_reason = 'unsubscribed by user'
  where endpoint = p_endpoint
    and student_id = r.student_id
    and teacher_id = r.teacher_id
    and subscriber_kind = 'student';
  get diagnostics v_updated = row_count;

  return jsonb_build_object('unsubscribed', true, 'updated', v_updated);
end $$;

create or replace function public.student_portal_push_status(
  p_token text,
  p_endpoint text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
begin
  select * into r from public.student_portal_resolve_token(p_token);

  return jsonb_build_object('subscribed', exists (
    select 1 from public.push_subscriptions
    where endpoint = p_endpoint
      and student_id = r.student_id
      and teacher_id = r.teacher_id
      and subscriber_kind = 'student'
      and is_active
  ));
end $$;

grant execute on function public.student_portal_push_subscribe(text, text, text, text, text) to anon, authenticated;
grant execute on function public.student_portal_push_unsubscribe(text, text) to anon, authenticated;
grant execute on function public.student_portal_push_status(text, text) to anon, authenticated;

commit;

begin;

-- ============================================================================
-- مشغّلات الأحداث — كلها fail-safe (معالج استثناءات يبتلع أي خطأ) وتمرّ
-- عبر push_dispatch وحدها. النصوص تُبنى هنا خادمياً من بيانات الحدث.
-- ============================================================================

-- ١) وصول/انصراف: عند إدراج تنبيه ولي الأمر (0012) — القيد الفريد هناك
-- يضمن حدثاً واحداً فلا Push مكرراً أبداً لنفس الوصول/المغادرة.
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
begin
  begin
    select name into v_student_name from public.students where id = new.student_id;
    select g.name into v_group_name
    from public.sessions se
    join public.groups g on g.id = se.group_id
    where se.id = new.session_id;
    v_centre := public.push_centre_name(new.teacher_id);
    v_verb := case when new.kind = 'arrived' then 'وصل' else 'غادر' end;

    perform public.push_dispatch(
      v_centre,
      v_verb || ' الطالب ' || coalesce(v_student_name, '') ||
        ' — حصة ' || coalesce(v_group_name, ''),
      new.student_id,
      'guardian-notif-' || new.id::text,
      '/'
    );
  exception when others then
    null;
  end;
  return new;
end $$;

create trigger guardian_notifications_push_trg
  after insert on public.guardian_notifications
  for each row execute function public.push_on_guardian_notification();

-- ٢) دفعة مسجلة لطالب (تشمل دفعة اعتماد إثبات الدفع — نفس الإدراج):
-- الموجبة غير العكسية فقط؛ العكسية (سالبة) والمبطلة لا تُشعِر أبداً.
create or replace function public.push_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_student_name text;
  v_centre text;
begin
  begin
    if new.amount <= 0 or new.reverses_payment_id is not null then
      return new;
    end if;

    select i.student_id into v_student_id
    from public.invoices i where i.id = new.invoice_id;
    if v_student_id is null then
      return new;
    end if;
    select name into v_student_name from public.students where id = v_student_id;
    v_centre := public.push_centre_name(new.teacher_id);

    perform public.push_dispatch(
      v_centre,
      'تم تسجيل دفعة بقيمة ' ||
        rtrim(rtrim(to_char(new.amount, 'FM999999999990.00'), '0'), '.') ||
        ' ج لصالح الطالب ' || coalesce(v_student_name, '') ||
        ' — إيصال ' || new.receipt_no,
      v_student_id,
      'payment-' || new.id::text,
      '/'
    );
  exception when others then
    null;
  end;
  return new;
end $$;

create trigger payments_push_trg
  after insert on public.payments
  for each row execute function public.push_on_payment();

-- ٣) نتيجة امتحان إلكتروني: عند انتقال محاولة إلى submitted (مرة
-- واحدة لكل محاولة — إعادة التسليم لا تحدّث الحالة فلا تكرر).
create or replace function public.push_on_exam_submitted()
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

    perform public.push_dispatch(
      v_centre,
      'نتيجة امتحان «' || coalesce(v_title, '') || '» بقت متاحة للطالب ' ||
        coalesce(v_student_name, '') || ': ' ||
        rtrim(rtrim(to_char(new.score, 'FM999999999990.00'), '0'), '.') ||
        ' من ' ||
        rtrim(rtrim(to_char(new.max_score, 'FM999999999990.00'), '0'), '.') ||
        ' (' || rtrim(rtrim(to_char(new.pct, 'FM999990.00'), '0'), '.') || '%)',
      new.student_id,
      'exam-attempt-' || new.id::text,
      '/'
    );
  exception when others then
    null;
  end;
  return new;
end $$;

create trigger exam_attempts_push_trg
  after update on public.exam_attempts
  for each row execute function public.push_on_exam_submitted();

commit;

-- ============================================================================
-- نهاية 0014 — امتداد: pg_net | دوال بوابات: portal_push_subscribe /
-- portal_push_unsubscribe / portal_push_status + student_portal_push_*
-- (نفس الثلاثة) | داخلية مسحوبة: push_dispatch + push_centre_name |
-- مشغّلات: guardian_notifications_push_trg + payments_push_trg +
-- exam_attempts_push_trg (كلها fail-safe عبر push_dispatch).
-- لا جدول جديداً — النسخة الاحتياطية تبقى 26 جدولاً.
-- السرّ المشترك يُقرأ من Vault (push_internal_secret) وقت الإرسال —
-- تدويره وضبطه إجراء تشغيلي موثّق في ترويسة الهجرة، لا في أي ملف.
-- ============================================================================
