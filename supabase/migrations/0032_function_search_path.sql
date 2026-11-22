-- ===========================================================================
-- 0032 — تثبيت search_path للدوال الخمس (function_search_path_mutable)
-- (الدفعة المولّدة #4؛ 3A-353)
--
-- ALTER FUNCTION ... SET search_path = public لكل دالة من الخمس التي أبلغ
-- عنها Supabase Advisors (lint 0011). تغيير إعداد (proconfig) فقط — لا
-- تغيير في التوقيع أو الجسم أو السلوك: التعريفات الحية فُحصت من pg_proc
-- قبل التطبيق مباشرة، والأجساد تستخدم كائنات public مؤهلة صراحةً أو دوال
-- pg_catalog مدمجة فقط (now/random/make_interval/least/lpad/extract —
-- وpg_catalog متاح ضمنياً دائماً)، فالتثبيت على public مطابق لمسار البحث
-- الفعّال الحالي. الدوال معرّفة أصلاً في 0001 و0010.
-- ===========================================================================

ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.generate_public_code() SET search_path = public;
ALTER FUNCTION public.students_set_public_code() SET search_path = public;
ALTER FUNCTION public.next_receipt_no(uuid, date) SET search_path = public;
ALTER FUNCTION public.exam_attempt_deadline(timestamp with time zone, integer, timestamp with time zone) SET search_path = public;
