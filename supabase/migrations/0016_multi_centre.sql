-- ============================================================================
-- 0016 — تعدد السناتر لحساب واحد (Phase 4 خطوة 4)
--
-- المشكلة البنيوية: منذ 0001 كان «المدرس = صف teachers واحد به id = معرّف
-- حساب Auth نفسه»، وكل سياسات RLS مبنية حرفياً على (teacher_id = auth.uid())
-- ودالة is_teacher_owner معرّفة بأنها (auth.uid() = p_teacher_id).
--
-- التصميم هنا (متوافق رجعياً بالكامل):
-- • عمود ملكية صريح teachers.owner_user_id → auth.users، يُعبَّأ رجعياً
--   بقيمة id الحالية لكل الصفوف القائمة، ثم يصبح NOT NULL.
-- • يُفكّ قيد المفتاح الخارجي teachers.id → auth.users (كان يمنع أي صف
--   بهوية مستقلة عن حساب Auth)، ويأخذ id قيمة افتراضية gen_random_uuid()
--   حتى تُنشأ سناتر جديدة بهويات مستقلة. الصف الأساسي القائم يحتفظ
--   بقيمته id = uid كما هي — لا تتغير أي بيانات قائمة ولا أي مرجع.
-- • تُعاد تعريف is_teacher_owner(p) لتعني: يوجد صف teachers به id = p
--   وowner_user_id = auth.uid(). كل سياسة مالك في المخطط تُعاد كتابتها
--   من (teacher_id = auth.uid()) إلى (public.is_teacher_owner(teacher_id))
--   — نفس الحماية حرفياً، لكنها تعمل الآن لأي عدد من السناتر المملوكة.
-- • سياسات المساعد (is_teacher_member / member_has_permission) لا تتغير:
--   العضوية مربوطة بـ teacher_id أصلاً، فتعمل لأي سنتر.
-- • سياسات teachers نفسها تنتقل إلى owner_user_id: المالك يرى/ينشئ/يعدّل
--   صفوف سناتره فقط (with check على الإنشاء يمنع إنشاء سنتر باسم غيره).
--   لا سياسة حذف على teachers (حذف سنتر ليس ميزة عميل — كما قبل).
-- • سياسات Storage كانت تقارن بادئة المسار (وهي teacher_id أصلاً في
--   العميل) بـ auth.uid() — تنتقل لدالة owns_storage_prefix التي تتحقق
--   أن البادئة UUID صالح وأن المستدعي مالك ذلك السنتر.
-- • حارس generate_group_sessions كان يقارن uid بـ p_teacher_id مباشرة —
--   ينتقل إلى is_teacher_owner مع بقاء مسار العضوية كما هو.
-- • ما لا يتغير عمداً: سياسات user_id = auth.uid() الشخصية (عضوية المرء
--   نفسه، اشتراكات Push الخاصة بالمستخدم، actor_id في سجل النشاط،
--   guardians.user_id) — هذه هوية مستخدم لا ملكية سنتر.
-- • البوابات (ولي أمر/طالب/امتحان) لا تتأثر: RPCs بتوكنات مربوطة بصفوف
--   الطلاب/السنتر، ولا تعتمد على auth.uid() في الملكية إطلاقاً.
--
-- مستخدم بسنتر واحد: كل تعبير جديد يعطي نفس نتيجة القديم حرفياً
-- (owner_user_id = id = uid لصفه الوحيد).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) عمود الملكية + فكّ قيد الهوية
-- ---------------------------------------------------------------------------
alter table public.teachers
  add column owner_user_id uuid references auth.users (id) on delete cascade;

update public.teachers set owner_user_id = id;

alter table public.teachers
  alter column owner_user_id set not null;

alter table public.teachers drop constraint teachers_id_fkey;

alter table public.teachers
  alter column id set default gen_random_uuid();

create index teachers_owner_user_idx on public.teachers (owner_user_id);

-- ---------------------------------------------------------------------------
-- 2) إعادة تعريف دالة الملكية — قلب التغيير كله
-- ---------------------------------------------------------------------------
create or replace function public.is_teacher_owner(p_teacher_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.teachers t
    where t.id = p_teacher_id
      and t.owner_user_id = auth.uid()
  ) $$;

-- ---------------------------------------------------------------------------
-- 3) سياسات المالك على جداول الأعمال: teacher_id = auth.uid()
--    ← public.is_teacher_owner(teacher_id)  (ALL: using + with check)
-- ---------------------------------------------------------------------------
alter policy assessments_owner_all on public.assessments
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy questions_owner_all on public.assessment_questions
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy attendance_owner_all on public.attendance
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy daily_closings_owner_all on public.daily_closings
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy enrollments_owner_all on public.enrollments
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy exam_attempts_owner_all on public.exam_attempts
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy expenses_owner_all on public.expenses
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy waitlist_owner_all on public.group_waitlist
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy groups_owner_all on public.groups
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy guardian_tokens_owner_all on public.guardian_access_tokens
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy guardian_notifs_owner_all on public.guardian_notifications
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy guardian_students_owner_all on public.guardian_students
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy guardians_owner_all on public.guardians
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy holidays_owner_all on public.holidays
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy invoice_lines_owner_all on public.invoice_lines
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy invoices_owner_all on public.invoices
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy online_exam_tokens_owner_all on public.online_exam_tokens
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy online_exams_owner_all on public.online_exams
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy payment_proofs_owner_all on public.payment_proofs
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy payments_owner_all on public.payments
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy receipt_counters_owner_all on public.receipt_counters
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy recurring_expenses_owner_all on public.recurring_expenses
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy scores_owner_all on public.scores
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy sessions_owner_all on public.sessions
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy student_tokens_owner_all on public.student_access_tokens
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy student_notes_owner_all on public.student_notes
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy students_owner_all on public.students
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy members_owner_all on public.teacher_members
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));
alter policy settings_owner_all on public.teacher_settings
  using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));

-- سياسات قراءة/إدراج جزئية
alter policy activity_log_owner_select on public.activity_log
  using (public.is_teacher_owner(teacher_id));
alter policy activity_log_owner_insert on public.activity_log
  with check (
    public.is_teacher_owner(teacher_id)
    and actor_id = auth.uid()
    and actor_role = 'owner'
  );
alter policy push_log_owner_select on public.push_delivery_log
  using (public.is_teacher_owner(teacher_id));
alter policy push_digest_log_owner_select on public.push_digest_log
  using (public.is_teacher_owner(teacher_id));
alter policy push_subs_owner_select on public.push_subscriptions
  using (public.is_teacher_owner(teacher_id));
alter policy push_subs_self_insert on public.push_subscriptions
  with check (
    subscriber_kind = 'teacher'
    and user_id = auth.uid()
    and (public.is_teacher_owner(teacher_id) or public.is_teacher_member(teacher_id))
  );

-- ---------------------------------------------------------------------------
-- 4) سياسات teachers نفسها: الملكية عبر owner_user_id
-- ---------------------------------------------------------------------------
alter policy teachers_self_select on public.teachers
  using (owner_user_id = auth.uid());
alter policy teachers_self_insert on public.teachers
  with check (owner_user_id = auth.uid());
alter policy teachers_self_update on public.teachers
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5) حارس توليد الحصص: ملكية عبر الدالة بدل مقارنة الهوية مباشرة
--    (نفس نص 0007 الحي حرفياً عدا سطر الحراسة)
-- ---------------------------------------------------------------------------
create or replace function public.generate_group_sessions(p_teacher_id uuid, p_group_id uuid, p_month date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  g record;
  d date;
  month_start date := date_trunc('month', p_month)::date;
  month_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  created int := 0;
begin
  -- حراسة: المستدعي (إن وُجد) يجب أن يكون مالك السنتر أو عضواً نشطاً عنده
  if auth.uid() is not null
     and not public.is_teacher_owner(p_teacher_id)
     and not exists (
       select 1 from public.teacher_members
       where teacher_id = p_teacher_id and user_id = auth.uid() and status = 'active'
     ) then
    raise exception 'not authorized';
  end if;

  select * into g from public.groups
  where id = p_group_id and teacher_id = p_teacher_id;
  if not found then
    raise exception 'group % not found for teacher %', p_group_id, p_teacher_id;
  end if;

  -- حارس الأرشفة (0007): مجموعة مؤرشفة لا تولّد حصصاً جديدة إطلاقاً
  if g.archived_at is not null then
    return 0;
  end if;

  d := month_start;
  while d <= month_end loop
    if extract(dow from d)::int = any (g.days) then
      insert into public.sessions
        (teacher_id, group_id, session_date, start_time, duration_minutes, kind, status)
      values
        (p_teacher_id, p_group_id, d, g.start_time, g.duration_minutes, 'regular',
         case when exists (
           select 1 from public.holidays h
           where h.teacher_id = p_teacher_id and h.holiday_date = d
         ) then 'cancelled'::session_status else 'scheduled'::session_status end)
      on conflict do nothing;
      if found then created := created + 1; end if;
    end if;
    d := d + 1;
  end loop;
  return created;
end $function$;

-- ---------------------------------------------------------------------------
-- 6) Storage: بادئة المسار هي teacher_id — الملكية عبر الدالة
-- ---------------------------------------------------------------------------
create or replace function public.owns_storage_prefix(p_name text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_prefix text := split_part(p_name, '/', 1);
begin
  if v_prefix !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  return public.is_teacher_owner(v_prefix::uuid);
end $$;

alter policy payment_proofs_owner_select on storage.objects
  using (
    bucket_id = 'payment-proofs'
    and public.owns_storage_prefix(name)
  );
alter policy payment_proofs_owner_delete on storage.objects
  using (
    bucket_id = 'payment-proofs'
    and public.owns_storage_prefix(name)
  );
alter policy brand_logos_owner_insert on storage.objects
  with check (
    bucket_id = 'brand-logos'
    and public.owns_storage_prefix(name)
  );
alter policy brand_logos_owner_update on storage.objects
  using (
    bucket_id = 'brand-logos'
    and public.owns_storage_prefix(name)
  )
  with check (
    bucket_id = 'brand-logos'
    and public.owns_storage_prefix(name)
  );
alter policy brand_logos_owner_delete on storage.objects
  using (
    bucket_id = 'brand-logos'
    and public.owns_storage_prefix(name)
  );

commit;

-- ============================================================================
-- نهاية 0016 — لا جداول جديدة (النسخة الاحتياطية تبقى 27 جدولاً).
-- دوال معدّلة: is_teacher_owner (إعادة تعريف)، generate_group_sessions
-- (حراسة فقط)، owns_storage_prefix (جديدة). سياسات معدّلة: 29 مالك ALL +
-- 6 جزئية + 3 على teachers + 5 على storage.objects.
-- ============================================================================
