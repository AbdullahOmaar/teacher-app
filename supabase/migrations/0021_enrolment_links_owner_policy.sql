-- ============================================================================
-- 0021 — إصلاح (مراجعة الكود والأمان 2026-11-20): سياسة enrolment_links
-- ----------------------------------------------------------------------------
-- الخلل: سياسة 0019 قارنت teacher_id (معرّف السنتر) بـ auth.uid() مباشرة.
-- صدف أن السناتر القديمة id = uid مالكها فعملت، لكن أي سنتر إضافي ينشئه
-- نفس المالك (تعدد السناتر 0016) يصير رابطه مستحيل الإدارة (أُثبت حياً:
-- إدراج المالك الشرعي لسنتره الثاني يُرفض 403 RLS).
-- الإصلاح: نفس نمط بقية جداول التوكنات — is_teacher_owner(teacher_id).
-- ============================================================================

drop policy enrolment_links_owner_all on public.enrolment_links;

create policy enrolment_links_owner_all on public.enrolment_links
  for all using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
