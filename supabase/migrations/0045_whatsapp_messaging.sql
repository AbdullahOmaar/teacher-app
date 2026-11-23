-- ============================================================================
-- 0045 — مسار إرسال واتساب الكامل في الكود (3A-300 — قرار المالك
-- 2026-11-23 ~20:09: «جهّز كل حاجة في الكود، والتفعيل بموافقة المدرس
-- جوه التطبيق»). لا تفعيل فعلي هنا: لا رقم Meta ولا إرسال — جداول
-- الدعم فقط، وكل الأعلام تبقى OFF (انظر دوال Edge المرافقة).
--
-- النموذج (وثيقة التصميم WHATSAPP-OTP-DESIGN.md §٩ — ما كان ينقص
-- P5-3 الكاملة على نفس قناة 0026):
-- • teacher_whatsapp_templates: سجل قوالب Utility لكل مدرس — القوالب
--   تُنشأ وتُعتمد في حساب Meta بتاع المدرس نفسه؛ التطبيق يحتاج أن
--   يعرف لكل نوع إشعار: اسم القالب ولغته وحالته عنده (جاهز/غير موجود)
--   حتى يرسل بالقالب الصحيح ولا يدّعي الجاهزية كذباً.
-- • whatsapp_message_log: سجل كل محاولة إرسال وحالتها عبر دورة
--   التسليم (queued ← sent ← delivered/read أو failed مع رمز/رسالة
--   خطأ Meta) — الفشل يظهر في نموذج البيانات بصراحة لا يختفي.
--   القراءة للمالك فقط؛ الكتابة لدوال Edge بالـ service role فقط
--   (لا سياسات إدخال/تعديل للعملاء إطلاقاً).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) سجل قوالب Utility لكل مدرس
-- ---------------------------------------------------------------------------
create table public.teacher_whatsapp_templates (
  teacher_id    uuid not null references public.teachers (id) on delete cascade,
  kind          text not null check (kind in (
                  'arrival_notice', 'departure_notice',
                  'absence_notice', 'invoice_issued')),
  template_name text not null default '',
  language      text not null default 'ar',
  status        text not null default 'unknown'
                check (status in ('unknown', 'ready', 'missing')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (teacher_id, kind)
);

alter table public.teacher_whatsapp_templates enable row level security;

-- مالك فقط (كـ teacher_whatsapp_config): المساعد لا يرى ولا يعدّل
create policy whatsapp_templates_owner_all on public.teacher_whatsapp_templates
  for all using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));

create trigger teacher_whatsapp_templates_updated_trg
  before update on public.teacher_whatsapp_templates
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.teacher_whatsapp_templates to authenticated;
grant all on public.teacher_whatsapp_templates to service_role;

-- ---------------------------------------------------------------------------
-- 2) سجل إرسال/تسليم رسائل واتساب
-- ---------------------------------------------------------------------------
create table public.whatsapp_message_log (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references public.teachers (id) on delete cascade,
  kind            text not null check (kind in (
                    'arrival_notice', 'departure_notice',
                    'absence_notice', 'invoice_issued')),
  template_name   text not null,
  recipient_phone text not null,
  status          text not null default 'queued'
                  check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  meta_message_id text,
  error_code      integer,
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index whatsapp_message_log_teacher_created_idx
  on public.whatsapp_message_log (teacher_id, created_at desc);
create index whatsapp_message_log_meta_id_idx
  on public.whatsapp_message_log (meta_message_id)
  where meta_message_id is not null;

alter table public.whatsapp_message_log enable row level security;

-- قراءة للمالك فقط — ولا أي سياسة كتابة: الإدخال والتحديث من دوال
-- Edge بالـ service role وحده (إرسال + Webhook حالات التسليم)
create policy whatsapp_message_log_owner_select on public.whatsapp_message_log
  for select using (public.is_teacher_owner(teacher_id));

create trigger whatsapp_message_log_updated_trg
  before update on public.whatsapp_message_log
  for each row execute function public.set_updated_at();

grant select on public.whatsapp_message_log to authenticated;
grant all on public.whatsapp_message_log to service_role;

commit;

-- ============================================================================
-- نهاية 0045 — جدولان جديدان، بلا دوال جديدة وبلا أي تغيير في 0026.
-- نطاق النسخة الاحتياطية JSON: الجدولان خارج النطاق بوعي — القوالب
-- تابعة لإعداد واتساب المستثنى أصلاً في 0026 (بعد أي استعادة يعيد
-- المدرس تأكيد حالات قوالبه من الإعدادات)، وسجل الرسائل بيانات
-- تشغيلية تاريخية لا تُستعاد.
-- ============================================================================
