-- ============================================================================
-- تطبيق المدرس — 0013_web_push.sql
-- Phase 4 / الخطوة 1: بنية Web Push (اشتراكات + سجل إرسال)
--
-- بنية تحتية فقط: جدول اشتراكات يخدم كل المراحل التالية، وEdge Function
-- للإرسال (supabase/functions/send-push) بمفتاح VAPID خاص محفوظ كسرّ في
-- Supabase فقط. الربط الفعلي من الواجهات يأتي في الخطوتين 2 (البوابات)
-- و3 (المدرس) — هذه الخطوة تبني الأعمدة والسياسات والعميل الأساسي.
--
-- نموذج البيانات:
-- • push_subscriptions: صف لكل اشتراك متصفح (PushSubscription) واحد.
--   endpoint فريد عالمياً (هو هوية الاشتراك عند خدمة الـ Push)، ومعه
--   مفتاحا التشفير p256dh/auth كما يسلّمهما المتصفح (ليست أسرار حساب —
--   هي مفاتيح إرسال لذلك المتصفح تحديداً، وتُحفظ كنص عادي بنمط جداول
--   التوكنات في هذا المشروع).
-- • subscriber_kind + المراجع يخدم الأنواع الثلاثة من الآن:
--   - teacher: مستخدم مسجل (مالك/مساعد) — user_id = حساب Auth (إلزامي
--     بقيد CHECK) وteacher_id = السنتر الذي يعمل فيه.
--   - guardian/student: اشتراك بوابة مرتبط بتوكن وصول — portal_token_id
--     لقطة معرّف صف التوكن الذي أذن بالاشتراك (بلا FK عمداً: التوكنات
--     تُبطل وتُحذف دورياً ويجب ألا يحذف انتهاؤها الاشتراك تلقائياً —
--     الخطوة 2 تتحقق من صلاحية التوكن وقت الربط ووقت الإرسال)،
--     وstudent_id إلزامي (بوابات هذا التطبيق كلها بروابط طالب محدد)،
--     وguardian_id لقطة وليّ الأمر لاشتراكات guardian (قد تكون null).
-- • حالة الاشتراك: is_active + disabled_at/disabled_reason (تعطيل صريح
--   من المستخدم أو تنظيف تلقائي عند 404/410)، وfailure_count وآخر
--   نجاح/فشل للتشخيص — الإرسال نفسه يحدّثها من الـ Edge Function
--   بالـ service role فقط.
-- • push_delivery_log: سجل نتيجة كل محاولة إرسال (subscription_id قد
--   يُصفَّر عند حذف الاشتراك ويبقى السجل، وendpoint_host لقطة مضيف
--   خدمة الـ Push بلا المسار الكامل/المفاتيح). الكتابة فيه من الـ
--   Edge Function (service role) حصراً؛ المالك يقرأ سجل سنتره فقط.
--
-- نموذج الأمان:
-- • لا أي سياسة لـ anon إطلاقاً في الجدولين: البوابات لن تلمس الجدول
--   مباشرة أبداً — الخطوة 2 تضيف RPC بـ security definer تتحقق من
--   التوكن بنمط 0002/0003/0005 حرفياً.
-- • المستخدم المسجل يدير اشتراكات «مدرس» الخاصة به فقط: قراءة/إدراج/
--   تحديث/حذف مقيدة بـ user_id = auth.uid() وsubscriber_kind='teacher'
--   وقيد الإدراج يشترط أن يكون teacher_id حسابه أو سنتر هو عضو فعّال
--   فيه (is_teacher_member من 0001) — فلا أحد يزرع اشتراكاً باسم غيره.
-- • المالك يقرأ كل اشتراكات سنتره (teacher_id = auth.uid()) للمتابعة
--   والعدّادات في الخطوات التالية، بلا تحديث/حذف لاشتراكات غيره.
-- • الـ Edge Function تعمل بالـ service role (تتجاوز RLS) ولا تُستدعى
--   إلا بسرّ مشترك داخلي في ترويسة — التحقق داخل الدالة نفسها.
--
-- النسخة الاحتياطية: push_subscriptions جدول بيانات حقيقي فيدخل نطاق
-- النسخة كقسم اختياري أخير (25 ← 26 جدولاً) بنفس قاعدة الأقسام
-- الاختيارية (إصدار الصيغة يبقى 1). ملحوظة موثّقة: الاشتراكات مرتبطة
-- بأجهزة/متصفحات المصدر — الصفوف المستعادة على بيئة جديدة قد تشير
-- لأجهزة لم تعد موجودة، وأول إرسال لها سيرد 404/410 فينظّفها النظام
-- تلقائياً. عند الاستيراد يُعاد ربط user_id لاشتراكات teacher بحساب
-- المستورِد (مرجع auth.users — انظر toInsertRow في settings/api.ts).
-- push_delivery_log سجل تشخيصي عابر فلا يدخل النسخة (كبقية السجلات
-- التشخيصية المؤقتة — لا بيانات أعمال فيه).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- أنواع الاشتراك والإرسال
-- ----------------------------------------------------------------------------
create type push_subscriber_kind as enum ('teacher', 'guardian', 'student');
create type push_delivery_status as enum ('sent', 'failed', 'gone', 'skipped_inactive');

-- ----------------------------------------------------------------------------
-- جدول اشتراكات الـ Push
-- ----------------------------------------------------------------------------
create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references public.teachers (id) on delete cascade,
  subscriber_kind push_subscriber_kind not null,
  -- اشتراك مدرس: حساب Auth صاحب المتصفح (إلزامي لهذا النوع بقيد أسفله)
  user_id         uuid references auth.users (id) on delete cascade,
  -- اشتراك بوابة: معرّف صف توكن الوصول الذي أذن بالاشتراك — لقطة بلا FK
  -- عمداً (انظر الترويسة)؛ الخطوة 2 تملؤه وتتحقق منه
  portal_token_id uuid,
  -- لقطة وليّ الأمر لاشتراكات guardian (تُحذف معه إن حُذف صف الوليّ)
  guardian_id     uuid references public.guardians (id) on delete cascade,
  -- الطالب صاحب البوابة/الاشتراك — إلزامي لأنواع البوابات بقيد أسفله
  student_id      uuid references public.students (id) on delete cascade,
  -- نقطة نهاية خدمة الـ Push كما سلّمها المتصفح — هوية الاشتراك العالمية
  endpoint        text not null unique,
  -- مفتاحا تشفير الحمولة (RFC 8291) بصيغة base64url من المتصفح
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  -- الحالة: نشط/موقوف + سبب ووقت التعطيل (يدوي أو تنظيف 404/410)
  is_active       boolean not null default true,
  disabled_at     timestamptz,
  disabled_reason text,
  -- عدّادات تشخيص يحدّثها مرسِل الـ Edge Function فقط
  failure_count   int not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint push_subs_teacher_needs_user
    check (subscriber_kind <> 'teacher' or user_id is not null),
  constraint push_subs_portal_needs_student
    check (subscriber_kind = 'teacher' or student_id is not null)
);
create index push_subs_teacher_kind_idx
  on public.push_subscriptions (teacher_id, subscriber_kind) where is_active;
create index push_subs_user_idx
  on public.push_subscriptions (user_id) where user_id is not null;
create index push_subs_student_idx
  on public.push_subscriptions (student_id) where student_id is not null;

create trigger push_subs_updated_trg before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- سجل نتائج الإرسال (تشخيص + توثيق التنظيف)
-- ----------------------------------------------------------------------------
create table public.push_delivery_log (
  id              uuid primary key default gen_random_uuid(),
  -- يُصفَّر عند حذف الاشتراك ويبقى السجل شاهداً على المحاولة
  subscription_id uuid references public.push_subscriptions (id) on delete set null,
  teacher_id      uuid references public.teachers (id) on delete cascade,
  -- مضيف خدمة الـ Push فقط (بلا مسار الاشتراك ولا أي مفتاح)
  endpoint_host   text,
  title           text,
  status          push_delivery_status not null,
  http_status     int,
  error           text,
  created_at      timestamptz not null default now()
);
create index push_delivery_log_teacher_idx
  on public.push_delivery_log (teacher_id, created_at desc);
create index push_delivery_log_sub_idx
  on public.push_delivery_log (subscription_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RLS — مقيدة: لا anon إطلاقاً، والمستخدم يدير اشتراكات مدرّسه فقط
-- ----------------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;
alter table public.push_delivery_log enable row level security;

-- المالك: قراءة كل اشتراكات سنتره (متابعة وعدّادات — بلا تعديل لغيره)
create policy push_subs_owner_select on public.push_subscriptions
  for select using (teacher_id = auth.uid());

-- المستخدم المسجل: يدير اشتراكات «مدرس» الخاصة به حصراً (قراءة فوق
-- قراءة المالك أعلاه، وإدراج/تحديث/حذف) — الإدراج يشترط أن يكون
-- السنتر حسابه نفسه أو عضوية فعّالة عنده
create policy push_subs_self_select on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy push_subs_self_insert on public.push_subscriptions
  for insert with check (
    subscriber_kind = 'teacher'
    and user_id = auth.uid()
    and (teacher_id = auth.uid() or public.is_teacher_member(teacher_id))
  );
create policy push_subs_self_update on public.push_subscriptions
  for update using (user_id = auth.uid() and subscriber_kind = 'teacher')
  with check (user_id = auth.uid() and subscriber_kind = 'teacher');
create policy push_subs_self_delete on public.push_subscriptions
  for delete using (user_id = auth.uid() and subscriber_kind = 'teacher');

-- سجل الإرسال: المالك يقرأ سجل سنتره فقط — لا كتابة لأي عميل إطلاقاً
-- (الكتابة من الـ Edge Function بالـ service role حصراً)
create policy push_log_owner_select on public.push_delivery_log
  for select using (teacher_id = auth.uid());

commit;
