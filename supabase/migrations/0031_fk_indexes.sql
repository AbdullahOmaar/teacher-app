-- ===========================================================================
-- 0031 — فهارس المفاتيح الخارجية غير المفهرسة (17)
-- (الدفعة المولّدة #3؛ 3A-349 — unindexed_foreign_keys)
--
-- فهرس لكل عمود مفتاح خارجي كان بلا فهرس داعم، بالاسم القياسي
-- idx_<table>_<column>. فهارس فقط — لا تغيير في البيانات أو السلوك.
-- ===========================================================================

CREATE INDEX IF NOT EXISTS idx_activity_log_actor_id ON public.activity_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_assessment_questions_teacher_id ON public.assessment_questions (teacher_id);
CREATE INDEX IF NOT EXISTS idx_at_risk_followups_followed_by ON public.at_risk_followups (followed_by);
CREATE INDEX IF NOT EXISTS idx_at_risk_followups_student_id ON public.at_risk_followups (student_id);
CREATE INDEX IF NOT EXISTS idx_daily_closings_closed_by ON public.daily_closings (closed_by);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_student_id ON public.exam_attempts (student_id);
CREATE INDEX IF NOT EXISTS idx_guardian_access_tokens_student_id ON public.guardian_access_tokens (student_id);
CREATE INDEX IF NOT EXISTS idx_guardian_notifications_guardian_id ON public.guardian_notifications (guardian_id);
CREATE INDEX IF NOT EXISTS idx_invoices_group_id ON public.invoices (group_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_guardian_id ON public.payment_proofs (guardian_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_invoice_id ON public.payment_proofs (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_payment_id ON public.payment_proofs (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_reviewed_by ON public.payment_proofs (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_payments_reverses_payment_id ON public.payments (reverses_payment_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_guardian_id ON public.push_subscriptions (guardian_id);
CREATE INDEX IF NOT EXISTS idx_scores_exam_attempt_id ON public.scores (exam_attempt_id);
CREATE INDEX IF NOT EXISTS idx_sessions_origin_session_id ON public.sessions (origin_session_id);
