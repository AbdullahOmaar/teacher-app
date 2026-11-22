-- ===========================================================================
-- 0033 — تشديد teachers_self_insert (SEC-L10 — الدفعة المولّدة #11؛ 3A-377)
--
-- المشكلة: السياسة السابقة (0030) كانت تقبل أي id ما دام
-- owner_user_id = auth.uid()، فيستطيع مهاجم أن يحجز (squat) صفاً
-- بـ id = uid الضحية: الصف المحجوز (owner=المهاجم) لا يظهر للضحية في
-- teachers_self_select (USING owner_user_id = auth.uid())، فـ
-- ensureTeacherProfile لا تجد ملفاً وتحاول الإدراج فتصطدم بـ 23505
-- على مفتاح id، والضحية لا تستطيع حذف الصف لأنها ليست مالكته —
-- فتُمنع من إنشاء ملفها نهائياً (authApiTeacherProfileFailed).
--
-- لماذا ليست الصياغة المقترحة أصلاً (id = auth.uid())؟ لأن createCentre
-- (auth/api.ts) يُدرج صفاً بلا id فيولّد المخطط uuid عشوائياً (افتراضي
-- gen_random_uuid؛ FK إلى auth.users أُسقط في 0016 عمداً لدعم مراكز
-- متعددة مستقلة) — وسياسة id = auth.uid() كانت سترفض كل إنشاء سنتر
-- وتكسر ميزة مشحونة. المسار الوحيد الآخر هو ensureTeacherProfile
-- بـ id = auth.uid() دائماً. (انظر 3A-377 للتفصيل والأدلة.)
--
-- الحل: دالة حارس security definer تسمح بالـ id حين يكون id المتصل
-- نفسه، أو حين لا يكون مستخدماً موجوداً في auth.users أصلاً (uuid
-- عشوائي من createCentre) — وترفضه حين يكون uid مستخدم آخر.
-- الدالة مثبّتة search_path = '' (كل مرجع مؤهل بالمخطط صراحةً) وتعيد
-- false عندما auth.uid() غائب، فلا يمرّ إدراج مجهول.
--
-- تُطبَّق بياناً ببيان عبر run_migration.py — لا ككتلة واحدة.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.teacher_id_claimable(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (select auth.uid()) IS NOT NULL
    AND (
      p_id = (select auth.uid())
      OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_id)
    )
$$;

DROP POLICY IF EXISTS teachers_self_insert ON public.teachers;

CREATE POLICY teachers_self_insert ON public.teachers
  FOR INSERT TO public
  WITH CHECK (
    owner_user_id = (select auth.uid())
    AND public.teacher_id_claimable(id)
  );
