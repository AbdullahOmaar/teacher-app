-- 0023 — SEC-3 (جزئي، POST-WAVE-REVIEW مرحلة 0): تقليص سطح التنفيذ العام
-- 1) حذف portal_student_overview: دالة security definer قابلة للتنفيذ من
--    anon ولا يستدعيها أي كود عميل (مسار OTP ميت — guardians.user_id لا
--    يُضبط أبداً)؛ البديل الحي هو portal_overview_by_token.
-- 2) دوال التريغر فقط: سحب EXECUTE من PUBLIC/anon/authenticated —
--    استدعاء التريغر لا يفحص صلاحية التنفيذ، فالسحب لا يكسر عملها.
-- 3) next_receipt_no + generate_public_code: تُستدعى من authenticated
--    فقط (عميل الفواتير / تريغر كود الطالب) — سحب PUBLIC/anon.
-- ملحوظة مقصودة: دوال مساعدة RLS الأربع (is_teacher_owner،
-- is_teacher_member، member_has_permission، owns_storage_prefix) تبقى
-- كما هي: تقييم السياسات يحتاج صلاحية تنفيذ المتصل نفسه، وقد تحققت
-- المراجعة من سلامتها (فحوص عضوية على auth.uid() لا تسرّب شيئاً).

drop function if exists public.portal_student_overview(uuid);

revoke execute on function public.guardian_notify_on_attendance() from public, anon, authenticated;
revoke execute on function public.push_on_exam_submitted() from public, anon, authenticated;
revoke execute on function public.push_on_guardian_notification() from public, anon, authenticated;
revoke execute on function public.push_on_payment() from public, anon, authenticated;
revoke execute on function public.push_teacher_on_exam_submitted() from public, anon, authenticated;
revoke execute on function public.push_teacher_on_payment_proof() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.students_set_public_code() from public, anon, authenticated;

revoke execute on function public.next_receipt_no(uuid, date) from public, anon;
revoke execute on function public.generate_public_code() from public, anon;
