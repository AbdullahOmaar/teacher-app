-- 0079: قراءة تشغيلية للمساعد — عيب صلاحيات المساعد (رد سند 93، 2026-11-28).
--
-- التشخيص (مثبت من قاعدة الديمو الحية + كود 0001):
--   • سياسات SELECT على الطلاب/المجموعات/التسجيلات (0001) كانت تشترط
--     صلاحية الإدارة نفسها (can_manage_students / can_manage_groups)،
--     فمساعد الحضور — can_take_attendance=true وباقي الصلاحيات false —
--     يقرأ صفر طلاب وصفر مجموعات رغم أن السنتر فيه 6 طلاب و3 مجموعات،
--     فتظهر له حالة الفراغ المضللة «لسه مفيش طلاب هنا».
--   • هذا ليس حجب RLS مقصوداً كحالة مصممة: لا توجد صلاحية قراءة في
--     النموذج أصلاً، والقراءة والكتابة كانتا مدمجتين في مفتاح واحد،
--     فمساعد الحضور لا يستطيع أداء عمله (تسجيل الحضور يتطلب رؤية
--     الطلاب والمجموعات). الفراغ كان عيب نطاق قراءة، لا قرار منتج.
--   • الكتابة لم تكن مكسورة أبداً: سياسات FOR ALL الحالية تشترط مفتاح
--     الإدارة في WITH CHECK، فأي إنشاء من مساعد بلا الصلاحية مرفوض
--     خادمياً — العيب كان في القراءة وفي أزرار الإنشاء الظاهرة بالواجهة.
--
-- الإصلاح (قراءة فقط — الكتابة كما هي بلا أي تغيير):
--   • دالة member_has_operational_permission: العضو الفعّال الذي يملك
--     صلاحية تشغيلية واحدة على الأقل (حضور/طلاب/مجموعات/درجات).
--   • خمس سياسات FOR SELECT جديدة (تُجمع OR مع سياسات FOR ALL
--     الحالية): الطلاب وملاحظاتهم والتسجيلات والمجموعات وقائمة
--     الانتظار — قراءة لأي عضو تشغيلي، وكتابة مقيدة بمفتاح الإدارة.
--   • المالية (فواتير/مدفوعات/مصروفات) مالك-فقط كما هي — بلا أي مساس.
--   • مساعد بلا أي صلاحية تشغيلية (الأربعة false) يبقى بلا قراءة
--     بالتصميم، والواجهة تعرض له بطاقة صلاحية صريحة (نمط المالية)
--     بدل حالة الفراغ المضللة — انظر StudentsPage/GroupsPage.
--
-- التطبيق: عند بوابة تجميد فيز 2 + QA (نفس قاعدة 0070–0078) —
-- القسم الجديد في scripts/authz_tests.py يتخطى نفسه بنعومة حتى تُطبَّق.

create or replace function public.member_has_operational_permission(p_teacher_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.teacher_members
    where teacher_id = p_teacher_id
      and user_id = auth.uid()
      and status = 'active'
      and (
        coalesce(permissions ->> 'can_manage_students', 'false') = 'true'
        or coalesce(permissions ->> 'can_take_attendance', 'false') = 'true'
        or coalesce(permissions ->> 'can_manage_grades', 'false') = 'true'
        or coalesce(permissions ->> 'can_manage_groups', 'false') = 'true'
      )
  ) $$;

-- الطلاب: قراءة تشغيلية (الكتابة تبقى على students_assistant_all).
drop policy if exists students_assistant_read on public.students;
create policy students_assistant_read on public.students
  for select using (public.member_has_operational_permission(teacher_id));

-- ملاحظات الطلاب: نفس قاعدة القراءة كعائلة الطلاب.
drop policy if exists student_notes_assistant_read on public.student_notes;
create policy student_notes_assistant_read on public.student_notes
  for select using (public.member_has_operational_permission(teacher_id));

-- التسجيلات: قائمة الحضور تُبنى منها (roster) — بلا قراءتها لا حضور.
drop policy if exists enrollments_assistant_read on public.enrollments;
create policy enrollments_assistant_read on public.enrollments
  for select using (public.member_has_operational_permission(teacher_id));

-- المجموعات: اختيار المجموعة للحضور + التنقل للدرجات.
drop policy if exists groups_assistant_read on public.groups;
create policy groups_assistant_read on public.groups
  for select using (public.member_has_operational_permission(teacher_id));

-- قائمة الانتظار: عائلة المجموعات — نفس قاعدة القراءة.
drop policy if exists waitlist_assistant_read on public.group_waitlist;
create policy waitlist_assistant_read on public.group_waitlist
  for select using (public.member_has_operational_permission(teacher_id));
