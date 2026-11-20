-- ===========================================================================
-- تطبيق المدرس — 0009_activity_log.sql
-- Phase 3 / الخطوة 2: سجل النشاط (Activity Log / Audit Trail)
--
-- جدول تدقيق واحد `activity_log` تُسجَّل فيه الأحداث الجوهرية من طبقة
-- البيانات في العميل (لا triggers على الجداول التشغيلية): دفعات، فواتير،
-- حضور (تجميعي لكل حصة)، عضويات الفريق، مراجعة إثباتات الدفع، حذف/أرشفة
-- طالب أو مجموعة، وإغلاق الخزنة اليومي. التسجيل fail-safe من جهة العميل:
-- فشل إدراج صف السجل لا يُفشل العملية الأصلية أبداً (انظر
-- src/features/activity/api.ts).
--
-- نموذج الصف:
-- • teacher_id: نطاق المدرس صاحب البيانات (كل الاستعلامات والسياسات به).
-- • actor_id / actor_role / actor_name: لقطة الفاعل وقت الحدث — المعرّف
--   لحساب Auth، والدور داخل نطاق هذا المدرس ('owner' | 'assistant')،
--   والاسم المعروض وقتها (يبقى مقروءاً حتى لو تغيّر الاسم أو حُذف العضو
--   لاحقاً). actor_id يُصفَّر عند حذف حساب الفاعل (on delete set null)
--   وتبقى اللقطة النصية شاهدة.
-- • event_type: نص حرّ مقيّد بقائمة القيم التي ينتجها العميل (CHECK).
-- • entity_type / entity_id / entity_label: الكيان المرتبط (دفعة/فاتورة/
--   حصة/طالب/مجموعة/عضو/إثبات/إغلاق) بلقطة اسمه المعروض وقت الحدث، حتى
--   يبقى السجل مفهوماً بعد حذف الكيان نفسه (لهذا entity_id بلا مفتاح
--   خارجي إطلاقاً — قيد FK كان سيمنع حذف الكيانات المسجّلة أو يمحو
--   أثرها بـ cascade، وكلا السلوكين عكس غرض التدقيق).
-- • details: ‏jsonb مختصر بلا بيانات حساسة زائدة (مبالغ/أعداد/تواريخ/
--   أسباب) — لا صور ولا نصوص واتساب ولا أي سرّ.
--
-- RLS:
-- • القراءة: المالك يرى كل نشاط نطاقه (teacher_id = auth.uid()).
--   المساعد يرى نشاطه هو فقط داخل النطاق (actor_id = auth.uid() +
--   عضوية فعّالة عبر is_teacher_member من 0001) — سياستان SELECT
--   منفصلتان تُجمَعان بـ OR كما هو سلوك Postgres المعتاد.
-- • الإدراج: الفاعل يسجّل باسمه هو فقط (actor_id = auth.uid() قسراً)
--   وداخل نطاق يملكه أو عضو فعّال فيه — فلا أحد يزوّر حدثاً باسم غيره
--   أو في نطاق مدرس آخر.
-- • لا سياسات UPDATE/DELETE إطلاقاً: السجل غير قابل للتعديل أو الحذف
--   من أي جلسة عميل (المالك نفسه لا يمسحه من التطبيق) — الحذف ممكن فقط
--   بصلاحيات الخادم (service role / SQL مباشر) لأغراض التنظيف الإداري.
-- • لا سياسة لـ anon إطلاقاً.
--
-- النسخة الاحتياطية: الجدول يُضاف آخر نطاق النسخة (22 جدولاً) في نفس
-- الخطوة؛ actor_id فيها يُعاد ربطه بالمستورِد عند الاستيراد (نفس معالجة
-- daily_closings.closed_by) حتى لا يفشل قيد auth.users في بيئة جديدة.
-- ===========================================================================

begin;

create table public.activity_log (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  actor_id     uuid references auth.users (id) on delete set null,
  actor_role   text not null check (actor_role in ('owner', 'assistant')),
  actor_name   text,
  event_type   text not null check (event_type in (
    'payment_created', 'payment_voided',
    'invoice_created', 'invoices_generated',
    'attendance_saved',
    'member_invited', 'member_joined', 'member_removed',
    'member_invite_cancelled', 'member_permissions_updated',
    'proof_approved', 'proof_rejected',
    'student_deleted', 'student_archived', 'student_unarchived',
    'group_deleted', 'group_archived', 'group_unarchived',
    'cashbox_closed'
  )),
  entity_type  text,
  entity_id    uuid,
  entity_label text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- القائمة الزمنية للنطاق + فلاتر النوع والفاعل (شاشة سجل النشاط)
create index activity_log_teacher_created_idx
  on public.activity_log (teacher_id, created_at desc);
create index activity_log_teacher_type_idx
  on public.activity_log (teacher_id, event_type, created_at desc);
create index activity_log_teacher_actor_idx
  on public.activity_log (teacher_id, actor_id, created_at desc);

alter table public.activity_log enable row level security;

-- قراءة المالك: كل نشاط نطاقه
create policy activity_log_owner_select on public.activity_log
  for select to authenticated
  using (teacher_id = auth.uid());

-- قراءة المساعد: نشاطه هو فقط داخل نطاق عضويته الفعّالة
create policy activity_log_assistant_select_own on public.activity_log
  for select to authenticated
  using (
    actor_id = auth.uid()
    and public.is_teacher_member(teacher_id)
  );

-- إدراج المالك: باسمه وداخل نطاقه فقط
create policy activity_log_owner_insert on public.activity_log
  for insert to authenticated
  with check (
    teacher_id = auth.uid()
    and actor_id = auth.uid()
    and actor_role = 'owner'
  );

-- إدراج المساعد: باسمه وداخل نطاق عضوية فعّالة فقط
create policy activity_log_assistant_insert on public.activity_log
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and actor_role = 'assistant'
    and public.is_teacher_member(teacher_id)
  );

commit;

-- ===========================================================================
-- نهاية 0009 — جدول جديد: activity_log | سياسات RLS: ‏4 (قراءة مالك كاملة،
-- قراءة مساعد لنشاطه فقط، إدراج باسم الفاعل نفسه فقط، وبلا تعديل/حذف)
-- ===========================================================================
