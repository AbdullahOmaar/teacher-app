-- ===========================================================================
-- تطبيق المدرس — 0018_at_risk_followups.sql
-- Phase 5 / الخطوة 1: قائمة «معرّضون للفقد» (At-Risk) — سجلّ متابعاتها
--
-- القائمة نفسها مشتقّة في العميل من بيانات موجودة (حضور + invoice_balances)
-- بلا أي منطق خادمي جديد؛ الجدول الوحيد هنا هو سجلّ «تمت المتابعة»:
-- عندما يضغط المدرس/المساعد «تمت المتابعة» على طالب في القائمة يُسجَّل
-- صف هنا، فيختفي الطالب من القائمة حتى يقع حدث خطر جديد بعد المتابعة
-- (غياب جديد ضمن سلسلة الغياب المتتالي، أو فاتورة تصبح متأخرة بعدها) —
-- مقارنة «الحدث الأحدث» تتم في العميل من followed_at هنا.
--
-- نموذج الصف:
-- • teacher_id: نطاق السنتر (بعد 0016: النطاق بمعرّف السنتر لا بمعرّف
--   المستخدم — الفحوص عبر is_teacher_owner / is_teacher_member).
-- • student_id: الطالب المتابَع (FK بـ cascade: حذف الطالب يمحو متابعاته،
--   فلا صفوف يتيمة تظهر في النسخة الاحتياطية أو تربك الاشتقاق).
-- • followed_by: حساب الفاعل وقت المتابعة (يُصفَّر عند حذف حسابه)،
--   وتفرض سياسات الإدراج أن يكون هو auth.uid() نفسه فلا تزوير.
-- • followed_at: لحظة المتابعة (افتراضي now()) — مرجع المقارنة الوحيد.
-- • note: سبب/ملاحظة اختيارية حرّة من المدرس (قد تختصر أسباب الخطر
--   وقتها كنص) — لا تُستخدم في أي منطق، للذاكرة البشرية فقط.
--
-- RLS (نمط ما بعد 0016):
-- • القراءة: مالك النطاق أو عضو فعّال فيه.
-- • الإدراج: مالك أو عضو فعّال، وباسم الفاعل نفسه قسراً.
-- • الحذف: المالك فقط (تنظيف إداري) — لا تحديث إطلاقاً (المتابعة حدث
--   لحظي لا يُحرَّر؛ متابعة جديدة = صف جديد).
-- • لا سياسة لـ anon إطلاقاً.
--
-- النسخة الاحتياطية: الجدول يُضاف آخر نطاق النسخة (28 جدولاً) في نفس
-- الخطوة؛ followed_by فيها يُعاد ربطه بالمستورِد عند الاستيراد (نفس
-- معالجة activity_log.actor_id) حتى لا يفشل قيد auth.users في بيئة جديدة.
-- ===========================================================================

begin;

create table public.at_risk_followups (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  followed_by uuid references auth.users (id) on delete set null,
  followed_at timestamptz not null default now(),
  note        text
);

-- أحدث متابعة لكل طالب داخل النطاق — قراءة الاشتقاق الوحيدة
create index at_risk_followups_teacher_student_idx
  on public.at_risk_followups (teacher_id, student_id, followed_at desc);

alter table public.at_risk_followups enable row level security;

-- قراءة المالك: كل متابعات نطاقه
create policy at_risk_followups_owner_select on public.at_risk_followups
  for select to authenticated
  using (public.is_teacher_owner(teacher_id));

-- قراءة المساعد: متابعات نطاق عضويته الفعّالة
create policy at_risk_followups_member_select on public.at_risk_followups
  for select to authenticated
  using (public.is_teacher_member(teacher_id));

-- إدراج المالك: باسمه وداخل نطاقه فقط
create policy at_risk_followups_owner_insert on public.at_risk_followups
  for insert to authenticated
  with check (
    public.is_teacher_owner(teacher_id)
    and followed_by = auth.uid()
  );

-- إدراج المساعد: باسمه وداخل نطاق عضوية فعّالة فقط
create policy at_risk_followups_member_insert on public.at_risk_followups
  for insert to authenticated
  with check (
    public.is_teacher_member(teacher_id)
    and followed_by = auth.uid()
  );

-- حذف المالك فقط (تنظيف) — بلا أي سياسة تحديث
create policy at_risk_followups_owner_delete on public.at_risk_followups
  for delete to authenticated
  using (public.is_teacher_owner(teacher_id));

commit;

-- ===========================================================================
-- نهاية 0018 — جدول جديد: at_risk_followups | سياسات RLS: ‏5 (قراءة مالك
-- وعضو، إدراج باسم الفاعل نفسه فقط للمالك والعضو، حذف للمالك، بلا تحديث)
-- ===========================================================================
