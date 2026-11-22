-- ===========================================================================
-- 0030 — أداء RLS: تغليف auth.uid() بـ (select auth.uid()) في 14 سياسة
-- (الدفعة المولّدة #3؛ 3A-349 — auth_rls_initplan)
--
-- التغليف يجعل Postgres يقيّم auth.uid() مرة واحدة لكل استعلام (initplan)
-- بدل مرة لكل صف. لا تغيير سلوكي: كل سياسة تُعاد بنفس الاسم والجدول
-- والأدوار والأمر حرفياً، والعبارة نفسها مع استبدال auth.uid() بـ
-- (select auth.uid()) فقط لا غير. التعريفات مأخوذة من pg_policies الحية
-- قبل التطبيق مباشرة.
-- ===========================================================================

DROP POLICY IF EXISTS activity_log_assistant_insert ON public.activity_log;
CREATE POLICY activity_log_assistant_insert ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK ((actor_id = (select auth.uid())) AND (actor_role = 'assistant'::text) AND is_teacher_member(teacher_id));

DROP POLICY IF EXISTS activity_log_assistant_select_own ON public.activity_log;
CREATE POLICY activity_log_assistant_select_own ON public.activity_log
  FOR SELECT TO authenticated
  USING ((actor_id = (select auth.uid())) AND is_teacher_member(teacher_id));

DROP POLICY IF EXISTS activity_log_owner_insert ON public.activity_log;
CREATE POLICY activity_log_owner_insert ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (is_teacher_owner(teacher_id) AND (actor_id = (select auth.uid())) AND (actor_role = 'owner'::text));

DROP POLICY IF EXISTS at_risk_followups_member_insert ON public.at_risk_followups;
CREATE POLICY at_risk_followups_member_insert ON public.at_risk_followups
  FOR INSERT TO authenticated
  WITH CHECK (is_teacher_member(teacher_id) AND (followed_by = (select auth.uid())));

DROP POLICY IF EXISTS at_risk_followups_owner_insert ON public.at_risk_followups;
CREATE POLICY at_risk_followups_owner_insert ON public.at_risk_followups
  FOR INSERT TO authenticated
  WITH CHECK (is_teacher_owner(teacher_id) AND (followed_by = (select auth.uid())));

DROP POLICY IF EXISTS guardians_self_select ON public.guardians;
CREATE POLICY guardians_self_select ON public.guardians
  FOR SELECT TO public
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS push_subs_self_delete ON public.push_subscriptions;
CREATE POLICY push_subs_self_delete ON public.push_subscriptions
  FOR DELETE TO public
  USING ((user_id = (select auth.uid())) AND (subscriber_kind = 'teacher'::push_subscriber_kind));

DROP POLICY IF EXISTS push_subs_self_insert ON public.push_subscriptions;
CREATE POLICY push_subs_self_insert ON public.push_subscriptions
  FOR INSERT TO public
  WITH CHECK ((subscriber_kind = 'teacher'::push_subscriber_kind) AND (user_id = (select auth.uid())) AND (is_teacher_owner(teacher_id) OR is_teacher_member(teacher_id)));

DROP POLICY IF EXISTS push_subs_self_select ON public.push_subscriptions;
CREATE POLICY push_subs_self_select ON public.push_subscriptions
  FOR SELECT TO public
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS push_subs_self_update ON public.push_subscriptions;
CREATE POLICY push_subs_self_update ON public.push_subscriptions
  FOR UPDATE TO public
  USING ((user_id = (select auth.uid())) AND (subscriber_kind = 'teacher'::push_subscriber_kind))
  WITH CHECK ((user_id = (select auth.uid())) AND (subscriber_kind = 'teacher'::push_subscriber_kind));

DROP POLICY IF EXISTS members_self_select ON public.teacher_members;
CREATE POLICY members_self_select ON public.teacher_members
  FOR SELECT TO public
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS teachers_self_insert ON public.teachers;
CREATE POLICY teachers_self_insert ON public.teachers
  FOR INSERT TO public
  WITH CHECK (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS teachers_self_select ON public.teachers;
CREATE POLICY teachers_self_select ON public.teachers
  FOR SELECT TO public
  USING (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS teachers_self_update ON public.teachers;
CREATE POLICY teachers_self_update ON public.teachers
  FOR UPDATE TO public
  USING (owner_user_id = (select auth.uid()))
  WITH CHECK (owner_user_id = (select auth.uid()));
