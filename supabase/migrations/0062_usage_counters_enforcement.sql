-- ============================================================================
-- 0062 — عدّادات الاستخدام وإنفاذ الحدود (Phase 2 T19 — 3A-894، الخطوة 5 من خطة الأدمن)
-- ----------------------------------------------------------------------------
-- هذه المهاجرة تبني **طبقة العدّ والإنفاذ** فوق 0058 (الباقات) و0059
-- (التجاوزات + effective_entitlements): الحدود الفعّالة = حدود الباقة ⊕
-- التجاوزات النشطة — والإنفاذ هنا يقرأها دائماً من
-- ‏effective_entitlements() نفسها، فلا نسخة ثانية من منطق الحلّ.
--
-- • الجدول `usage_counters`: عدّاد شهري واحد لكل (حساب، شهر، مفتاح) —
--   المفتاح المخزّن الوحيد هو 'messages_month' (رسائل واتساب الشهر):
--   يُحدَّث بتريجر عند كل إدراج في whatsapp_message_log (محاولة إرسال
--   واحدة = رسالة مستهلكة، حتى لو فشل الإرسال لاحقاً — المحاولة نفسها
--   استهلكت قالباً ونداء Graph). الطلاب والتخزين والفريق والذكاء
--   **محسوبون حياً** في usage_summary لا مخزّنون: الطلاب = عدّ
--   النشطين (paused = false)، التخزين = مجموع أحجام ملفات
--   ‏payment-proofs في storage.objects تحت بادئة الحساب، الفريق = عدّ
--   teacher_members، رسائل الذكاء = عدّ assistant_runs في الشهر —
--   فلا انحراف بين العدّاد والمصدر أبداً لتلك المفاتيح.
-- • الدالة `usage_summary(p_teacher_id)`: ملخص الاستخدام كاملاً
--   (الفترة + الخمسة مفاتيح: limit / used / remaining / at_limit) —
--   حد null = بلا حد (used يُحسب وremaining null وat_limit false).
--   بلا اشتراك/استحقاقات → كل الحدود null (لا إنفاذ، لا قيم مخترعة).
--   الحارس: مالك مساحة العمل أو عضو نشط فيها أو أدمن المنصة —
--   العضو النشط يضيف طلاباً أيضاً (مسار createStudent) فيحتاج
--   الفحص المسبق ليعمل له، وبيانات الاستخدام داخلية للمساحة أصلاً
--   (العضو يرى الطلاب والعدّادات في الشاشات).
-- • الدالة `check_usage_limit(p_teacher_id, p_key)`: فحص مفتاح واحد
--   (تستخدمه دالة Edge لإرسال واتساب وفحص العميل المسبق) — ترجع
--   ‏{key, allowed, limit, used, remaining}؛ مفتاح غير معروف يرفع
--   ‏'unknown usage key'.
-- • تريجر `students_limit_trg` ‏BEFORE INSERT على students: الإنفاذ
--   الخادمي غير القابل للتجاوز لحد الطلاب — إن كان الحد الفعّال
--   عدداً والنشطون بلغوه يرفع 'limit_reached:max_students' فيُترجم
--   في العميل لرسالة عربية (لا خطأ خام). متسامح عمداً: بلا
--   استحقاقات (null) يُسمح، وبلا جلسة (service role — تعبئة/سكربت
--   خادمي) يُسمح — الإنفاذ يطال كتابات المدرسين المصادق عليها فقط.
--   ملاحظة صدق: فحص العدّ + الإدراج ليسا ذرّيين — إدراجان
--   متزامنان قد يمرّان معاً فوق الحد بواحد؛ الضمان الصلب الكامل
--   يحتاج قفلاً استشارياً وهو خارج نطاق هذه الخطوة (نفس تحفظ
--   تشخيص 3A-910).
-- • RLS: قراءة المالك لعدّاداته والأدمن لكلها؛ **لا سياسات كتابة
--   للعميل إطلاقاً** — الكتابة من التريجر وservice role وحدهما.
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): مهاجرة كود فقط — لا
-- تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 + بوابة QA. العميل
-- يتحمّل غياب دوالها (الملخص null فيُخفى العرض، وفحص ما قبل
-- الإدراج يُتخطى) حتى البوابة؛ والتريجر لا يوجد أصلاً قبل التطبيق
-- فلا إنفاذ خادمي حتى ذلك الحين. قسم authz الحي الخاص بها في
-- ‏scripts/authz_tests.py يتخطى نفسه بتوثيق صريح ما دامت غائبة.
-- ترتيب التطبيق بعد 0055 و0058 و0059.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) جدول العدّادات الشهرية — رسائل واتساب وحدها تُخزَّن
-- ---------------------------------------------------------------------------
create table public.usage_counters (
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  period_month date not null,
  counter_key  text not null check (counter_key in ('messages_month')),
  value        integer not null default 0 check (value >= 0),
  updated_at   timestamptz not null default now(),
  primary key (teacher_id, period_month, counter_key)
);

alter table public.usage_counters enable row level security;

-- القراءة للمالك (عدّاداته هو فقط) ولأدمن المنصة — لا كتابة للعميل.
create policy usage_counters_owner_select on public.usage_counters
  for select using (public.is_teacher_owner(teacher_id));
create policy usage_counters_admin_select on public.usage_counters
  for select using (public.is_platform_admin());

revoke all on public.usage_counters from public, anon, authenticated;
grant select on public.usage_counters to authenticated;
grant all on public.usage_counters to service_role;

create trigger usage_counters_updated_trg
  before update on public.usage_counters
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) تريجر عدّ رسائل واتساب — محاولة إرسال واحدة = رسالة مستهلكة
-- ---------------------------------------------------------------------------
create or replace function public.bump_usage_counter_messages()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.usage_counters
    (teacher_id, period_month, counter_key, value)
  values (new.teacher_id, date_trunc('month', new.created_at)::date,
          'messages_month', 1)
  on conflict (teacher_id, period_month, counter_key)
  do update set value = public.usage_counters.value + 1,
                updated_at = now();
  return new;
end $$;

-- مساعد تريجر فقط: لا استدعاء مباشر من العميل — بلا هذا السحب أي
-- مستخدم مصادق يستطيع تضخيم عدّاد رسائل معلّم آخر باستدعاء مباشر.
-- (نفس نمط set_updated_at في 0023؛ التريجر نفسه لا يتأثر.)
revoke execute on function public.bump_usage_counter_messages()
  from public, anon, authenticated;

create trigger whatsapp_message_log_count_trg
  after insert on public.whatsapp_message_log
  for each row execute function public.bump_usage_counter_messages();

-- تعبئة رجعية للشهر الحالي من السجل القائم — آمنة التكرار.
insert into public.usage_counters
  (teacher_id, period_month, counter_key, value)
select teacher_id, date_trunc('month', created_at)::date,
       'messages_month', count(*)
  from public.whatsapp_message_log
 where created_at >= date_trunc('month', now())
 group by teacher_id, date_trunc('month', created_at)::date
on conflict (teacher_id, period_month, counter_key) do nothing;

-- ---------------------------------------------------------------------------
-- 3) ملخص الاستخدام — الحدود الفعّالة ⊕ الاستخدام المحسوب حياً
-- ---------------------------------------------------------------------------
create or replace function public.usage_summary(p_teacher_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_ent jsonb;
  v_limits jsonb;
  v_period date := date_trunc('month', now())::date;
  v_students integer;
  v_messages integer;
  v_storage_bytes bigint;
  v_storage_mb integer;
  v_team integer;
  v_ai integer;
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_limit integer;
  v_used integer;
begin
  -- الحارس يعمل أيضاً عند غياب الجلسة: بلا auth.uid() يرفض الكل.
  -- العضو النشط مشمول: مسار إضافة الطالب يمر به أيضاً.
  if not (public.is_teacher_owner(p_teacher_id)
          or public.is_teacher_member(p_teacher_id)
          or public.is_platform_admin()) then
    raise exception 'not authorized';
  end if;

  -- الحدود الفعّالة من 0059 (باقة ⊕ تجاوزات) — بلا اشتراك ترجع null
  -- فتكون كل الحدود null (بلا حد) بدل قيم مخترعة.
  v_ent := public.effective_entitlements(p_teacher_id);
  v_limits := case when v_ent is null then null
                   else v_ent -> 'limits' end;

  -- الطلاب النشطون (paused = false) — محسوب حياً، لا عدّاد مخزّن.
  select count(*) into v_students
    from public.students
   where teacher_id = p_teacher_id and paused = false;

  -- رسائل الشهر: العدّاد المخزّن؛ وإن غاب الصف (قبل أول رسالة) يُحسب
  -- من السجل مباشرة — فلا يظهر استخدام صفري كاذب بعد التطبيق.
  select value into v_messages
    from public.usage_counters
   where teacher_id = p_teacher_id
     and period_month = v_period
     and counter_key = 'messages_month';
  if v_messages is null then
    select count(*) into v_messages
      from public.whatsapp_message_log
     where teacher_id = p_teacher_id
       and created_at >= v_period;
  end if;

  -- التخزين: مجموع أحجام ملفات payment-proofs تحت بادئة الحساب
  -- (المسار '{teacher_id}/...' — انظر 0039) — محسوب حياً من
  -- ‏storage.objects؛ الملف بلا حجم مسجّل يُحسب صفراً.
  select coalesce(sum((metadata ->> 'size')::bigint), 0) into v_storage_bytes
    from storage.objects
   where bucket_id = 'payment-proofs'
     and name like p_teacher_id::text || '/%';
  v_storage_mb := ceil(v_storage_bytes::numeric / 1048576)::integer;

  -- أعضاء الفريق: كل صفوف العضوية (المدعو يحسب ضمن حجم الفريق).
  select count(*) into v_team
    from public.teacher_members
   where teacher_id = p_teacher_id;

  -- رسائل الذكاء هذا الشهر: كل تشغيلات المساعد (أي حالة — المحاولة
  -- نفسها استهلكت نداء نموذج).
  select count(*) into v_ai
    from public.assistant_runs
   where teacher_id = p_teacher_id
     and created_at >= v_period;

  for v_key in
    select unnest(array['max_students', 'max_messages_month',
                         'max_storage_mb', 'max_team_members',
                         'max_ai_messages_month'])
  loop
    -- حد jsonb: عدد صحيح ≥ 0، أو JSON null / غائب = بلا حد.
    v_limit := case
      when v_limits is null then null
      when (v_limits -> v_key) is null then null
      when jsonb_typeof(v_limits -> v_key) <> 'number' then null
      else floor((v_limits ->> v_key)::numeric)::integer
    end;
    v_used := case v_key
      when 'max_students' then v_students
      when 'max_messages_month' then v_messages
      when 'max_storage_mb' then v_storage_mb
      when 'max_team_members' then v_team
      else v_ai
    end;
    v_out := jsonb_set(
      v_out,
      array[v_key],
      jsonb_build_object(
        'limit', v_limit,
        'used', v_used,
        'remaining', case when v_limit is null then null
                          else greatest(v_limit - v_used, 0) end,
        'at_limit', case when v_limit is null then false
                          else v_used >= v_limit end
      )
    );
  end loop;

  return jsonb_build_object(
    'teacher_id', p_teacher_id,
    'period_month', v_period,
    'students', v_out -> 'max_students',
    'messages_month', v_out -> 'max_messages_month',
    'storage_mb', v_out -> 'max_storage_mb',
    'team_members', v_out -> 'max_team_members',
    'ai_messages_month', v_out -> 'max_ai_messages_month'
  );
end $$;

revoke execute on function public.usage_summary(uuid) from public, anon;
grant execute on function public.usage_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) فحص مفتاح واحد — لدالة Edge والفحص المسبق في العميل
-- ---------------------------------------------------------------------------
create or replace function public.check_usage_limit(
  p_teacher_id uuid,
  p_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_summary jsonb;
  v_entry jsonb;
begin
  if p_key not in ('max_students', 'max_messages_month', 'max_storage_mb',
                   'max_team_members', 'max_ai_messages_month') then
    raise exception 'unknown usage key';
  end if;

  -- الحارس داخل usage_summary (مالك أو عضو نشط أو أدمن) — لا حارس ثانٍ هنا.
  v_summary := public.usage_summary(p_teacher_id);

  v_entry := case p_key
    when 'max_students' then v_summary -> 'students'
    when 'max_messages_month' then v_summary -> 'messages_month'
    when 'max_storage_mb' then v_summary -> 'storage_mb'
    when 'max_team_members' then v_summary -> 'team_members'
    else v_summary -> 'ai_messages_month'
  end;

  return jsonb_build_object(
    'key', p_key,
    'allowed', not (v_entry ->> 'at_limit')::boolean,
    'limit', v_entry -> 'limit',
    'used', v_entry -> 'used',
    'remaining', v_entry -> 'remaining'
  );
end $$;

revoke execute on function public.check_usage_limit(uuid, text) from public, anon;
grant execute on function public.check_usage_limit(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) إنفاذ حد الطلاب خادمياً — تريجر BEFORE INSERT على students
-- ---------------------------------------------------------------------------
create or replace function public.enforce_student_limit()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ent jsonb;
  v_limit integer;
  v_active integer;
begin
  -- بلا جلسة (service role — تعبئة/سكربت خادمي) لا إنفاذ: الإنفاذ
  -- يطال كتابات المدرسين المصادق عليها فقط.
  if auth.uid() is null then
    return new;
  end if;

  -- الحد الفعّال: للمالك/الأدمن من effective_entitlements() (باقة ⊕
  -- تجاوزات)؛ وللعضو النشط من حدود الباقة مباشرة — لأن
  -- ‏effective_entitlements محصورة بالمالك/الأدمن في 0059، والعضو
  -- يُنفَّذ له التجاوز عبر فحص العميل المسبق (check_usage_limit
  -- يقبله عضواً). بلا اشتراك/حد لا إنفاذ — متسامح عمداً.
  if public.is_teacher_owner(new.teacher_id)
     or public.is_platform_admin() then
    v_ent := public.effective_entitlements(new.teacher_id);
    if v_ent is null then
      return new;
    end if;
    v_limit := case
      when (v_ent -> 'limits' -> 'max_students') is null then null
      when jsonb_typeof(v_ent -> 'limits' -> 'max_students') <> 'number' then null
      else floor(((v_ent -> 'limits' ->> 'max_students'))::numeric)::integer
    end;
  else
    select case
      when (p.limits -> 'max_students') is null then null
      when jsonb_typeof(p.limits -> 'max_students') <> 'number' then null
      else floor(((p.limits ->> 'max_students'))::numeric)::integer
    end into v_limit
      from public.subscriptions s
      join public.plans p on p.slug = s.plan_slug
     where s.teacher_id = new.teacher_id;
  end if;
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_active
    from public.students
   where teacher_id = new.teacher_id and paused = false;

  if v_active >= v_limit then
    raise exception 'limit_reached:max_students';
  end if;
  return new;
end $$;

-- مساعد تريجر فقط — نفس نمط bump أعلاه وset_updated_at في 0023.
revoke execute on function public.enforce_student_limit()
  from public, anon, authenticated;

create trigger students_limit_trg
  before insert on public.students
  for each row execute function public.enforce_student_limit();

commit;

-- ============================================================================
-- نهاية 0062 — جدول: usage_counters | دوال: usage_summary /
-- ‏check_usage_limit / bump_usage_counter_messages / enforce_student_limit
-- | تريجر: students_limit_trg + whatsapp_message_log_count_trg.
-- ترتيب التطبيق بعد 0055 و0058 و0059.
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ⚠️ الإنفاذ الخادمي (تريجر الطلاب + فحص دالة Edge) لا يعمل قبل
--    التطبيق؛ فحص العميل المسبق متسامح مع غياب الدوال (يتخطى).
-- ============================================================================
