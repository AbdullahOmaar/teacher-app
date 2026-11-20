-- ============================================================================
-- تطبيق المدرس — 0012_guardian_arrival_notifications.sql
-- Phase 3 / الخطوة 6: تنبيهات وصل/غادر لولي الأمر (Guardian Arrival Alerts)
--
-- عند تسجيل حضور طالب تتولد رسالة في صندوق تنبيهات بوابة ولي أمره، وعند
-- تسجيل انصرافه تتولد رسالة مغادرة، والمدرس/المساعد عنده قائمة إرسال
-- واتساب جاهزة (روابط wa.me فردية بنص موحّد — إرسال يدوي بالكامل).
-- بلا أي Push خارجي وبلا أي إرسال تلقائي في هذه المرحلة (قيد مقصود
-- وموثّق في الخطة — البنية الإرسالية مرشحة لـ Phase 4).
--
-- قرار الانصراف (موثّق): لا توجد أي آلية انصراف/خروج صريحة في النظام
-- الحالي إطلاقاً (attendance فيها status + homework_done + starred فقط،
-- ونهاية الحصة لا حدث لها). فبُني حد أدنى صريح ومتسق مع البنية:
-- عمود attendance.left_at (وقت الانصراف الفعلي، null = لم ينصرف) يضبطه
-- زر «انصراف» في صف الطالب بشاشة الحضور (وتراجع يصفّره) — وهو أدق
-- دلالياً من توليد مغادرة تلقائية عند نهاية الحصة (الطلاب لا ينصرفون
-- كلهم في لحظة واحدة)، وأصغر تغيير ممكن: نفس صف الحضور ونفس سياساته،
-- وحفظ الحضور العادي (upsert بقائمة أعمدة صريحة في saveAttendance) لا
-- يمسّ left_at أصلاً فلا يضيع انصراف مسجل عند أي تعديل حالة لاحق.
-- تسجيل الانصراف أونلاين فقط (لا يدخل قائمة مزامنة الأوفلاين — توثيق
-- في واجهة شاشة الحضور)، أما الوصول فيتولد أيضاً من مزامنة الأوفلاين
-- لأنها تمرّ بنفس كتابة القاعدة (انظر التوليد بالـ trigger أدناه).
--
-- نموذج التوليد — على مستوى القاعدة بـ trigger، لا في العميل:
-- • كل مسارات حفظ الحضور (saveAttendance الفردي، saveManyAttendance
--   الجماعي «حاضر للكل»، مسح QR، وإعادة تشغيل قائمة الأوفلاين) تنتهي
--   لكتابة واحدة في جدول attendance — فالـ trigger على الجدول يغطيها
--   كلها بلا استثناء وبلا تعديل في أي مسار حفظ قائم.
-- • Idempotent ببنية الجدول نفسه: قيد فريد (session_id, student_id,
--   kind) + إدراج ON CONFLICT DO NOTHING — إعادة الحفظ، أو تبديل الحالة
--   حاضر→غائب→حاضر، أو إعادة مزامنة أوفلاين، لا تنتج تنبيهاً ثانياً
--   أبداً لنفس الطالب والحصة والنوع («أول مرة للحصة» هي المعنى).
-- • Fail-safe: جسم الـ trigger كله داخل معالج استثناءات يبتلع أي خطأ —
--   فشل توليد تنبيه لا يكسر حفظ الحضور أبداً مهما كان سببه.
-- • «وصل» = أول انتقال لحالة حضور فعلي (p/l/m) في الحصة؛ «غادر» = أول
--   ضبط لـ left_at من null لقيمة (إعادة الانصراف بعد تراجع لا تكرر
--   التنبيه — القيد الفريد — ووقت التنبيه يبقى وقت أول انصراف موثّق).
--
-- نموذج البيانات:
-- • guardian_notifications: صف لكل تنبيه — teacher_id/student_id/
--   session_id، وguardian_id لقطة المستلم وقت التوليد (أول ولي أمر
--   مرتبط بالطالب في guardian_students إن وُجد، وإلا null — التنبيه
--   يوجد حتى لو لم يُنشأ صف ولي الأمر بعد، لأن صفوف guardians تُنشأ
--   كسولاً عند توليد رابط البوابة)، وkind ‏(arrived/left)، وevent_at
--   (وقت الحدث الفعلي: لحظة التوليد للوصول وleft_at للمغادرة)،
--   وread_at (null = غير مقروء — يضبطه RPC القراءة بالتوكن فقط).
-- • لا نص رسالة مخزّن: العرض يُبنى وقت القراءة من الحصة المرتبطة
--   (التاريخ/الوقت/المجموعة) فلا تتقادم صياغة ولا تتضخم الصفوف.
--
-- نموذج الأمان:
-- • RLS: المالك كل شيء، والمساعد قراءة فقط بصلاحية can_take_attendance
--   (نفس صلاحية الحضور في 0001 — قائمة الواتساب في شاشة الحضور تحتاجها).
--   لا سياسة إدراج/تحديث/حذف لأي عميل: الإدراج من الـ trigger
--   (security definer) حصراً، وضبط read_at من RPC البوابة حصراً.
-- • بوابة ولي الأمر: لا وصول anon مباشر لأي جدول — RPC بـ security
--   definer تتحقق من التوكن بدالة portal_validate_token القائمة
--   (0005: هاش SHA-256 + عدم إلغاء/انتهاء + ربط الطالب بوليّ التوكن).
--   القائمة تُصفّى بـ student_id وحده بعد التحقق (التوكن نفسه مقيّد
--   بهذا الطالب ووليّه، فلا بيانات زملاء ولا طلاب آخرين لنفس الوليّ
--   إلا برابط كل طالب على حدة — نفس نموذج البوابة كله). RPC تعليم
--   القراءة لا يكتب إلا read_at لصفوف هذا الطالب غير المقروءة.
--
-- النسخة الاحتياطية: guardian_notifications جدول بيانات تشغيلية حقيقي
-- (حالة قراءة وتاريخ تنبيهات) فيدخل نطاق النسخة كقسم اختياري أخير
-- (24 ← 25 جدولاً): يعتمد على students/guardians/sessions وكلها قبله
-- في الترتيب، والقيد الفريد (session, student, kind) يجعل إعادة
-- استيراد نفس النسخة آمنة (تخطٍّ بالهوية + القيد معاً). إصدار الصيغة
-- يبقى 1 بنفس قاعدة الأقسام الاختيارية. عمود attendance.left_at أُضيف
-- لأعمدة النسخة لجدول attendance القائم.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- الانصراف الصريح: وقت مغادرة الطالب الفعلي على صف حضوره نفسه
-- ----------------------------------------------------------------------------
alter table public.attendance
  add column left_at timestamptz;

-- ----------------------------------------------------------------------------
-- نوع التنبيه + جدول تنبيهات ولي الأمر
-- ----------------------------------------------------------------------------
create type guardian_notification_kind as enum ('arrived', 'left');

create table public.guardian_notifications (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  -- لقطة المستلم وقت التوليد — قد تكون null إن لم يوجد صف ولي أمر بعد
  guardian_id uuid references public.guardians (id) on delete set null,
  session_id  uuid not null references public.sessions (id) on delete cascade,
  kind        guardian_notification_kind not null,
  -- وقت الحدث الفعلي (الوصول: لحظة أول تسجيل حضوري؛ المغادرة: left_at)
  event_at    timestamptz not null default now(),
  -- null = غير مقروء؛ لا يضبطه إلا RPC البوابة بالتوكن
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  -- قلب الـ idempotency: تنبيه واحد كحد أقصى لكل (حصة، طالب، نوع)
  unique (session_id, student_id, kind)
);
create index guardian_notifs_teacher_idx
  on public.guardian_notifications (teacher_id, created_at desc);
create index guardian_notifs_student_idx
  on public.guardian_notifications (student_id, created_at desc);
-- عدّاد غير المقروء في البوابة يقرأ بهذا الشكل بالضبط
create index guardian_notifs_unread_idx
  on public.guardian_notifications (student_id) where read_at is null;

alter table public.guardian_notifications enable row level security;

-- المالك: كل شيء في نطاقه (العرض والإدارة من واجهة المدرس لاحقاً)
create policy guardian_notifs_owner_all on public.guardian_notifications
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- المساعد: قراءة فقط وبصلاحية الحضور (قائمة إرسال الواتساب في شاشة
-- الحضور) — لا إدراج ولا تحديث له من العميل إطلاقاً
create policy guardian_notifs_assistant_select on public.guardian_notifications
  for select using (public.member_has_permission(teacher_id, 'can_take_attendance'));

commit;

begin;

-- ============================================================================
-- التوليد — trigger على attendance (security definer + fail-safe).
-- يعمل بصلاحيات مالكه (postgres) فيتجاوز RLS للإدراج، وجسمه كله داخل
-- معالج استثناءات: أي فشل هنا يُبتلع ولا يصل لحفظ الحضور أبداً.
-- ============================================================================
create or replace function public.guardian_notify_on_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guardian_id uuid;
begin
  begin
    -- المستلم: أول ولي أمر مرتبط بالطالب إن وُجد (قد لا يوجد بعد)
    select gs.guardian_id into v_guardian_id
    from public.guardian_students gs
    where gs.teacher_id = new.teacher_id
      and gs.student_id = new.student_id
    limit 1;

    -- وصول: أول انتقال لحضور فعلي (p/l/m) — إدراج جديد بحالة حضورية،
    -- أو تحديث من حالة غير حضورية (null/غائب) لحالة حضورية
    if new.status in ('p', 'l', 'm')
       and (tg_op = 'INSERT' or old.status is null or old.status = 'a') then
      insert into public.guardian_notifications
        (teacher_id, student_id, guardian_id, session_id, kind, event_at)
      values
        (new.teacher_id, new.student_id, v_guardian_id, new.session_id, 'arrived', now())
      on conflict (session_id, student_id, kind) do nothing;
    end if;

    -- مغادرة: أول ضبط لـ left_at (من null لقيمة) — وقت الحدث هو
    -- left_at نفسه لا لحظة كتابة الصف
    if new.left_at is not null
       and (tg_op = 'INSERT' or old.left_at is null) then
      insert into public.guardian_notifications
        (teacher_id, student_id, guardian_id, session_id, kind, event_at)
      values
        (new.teacher_id, new.student_id, v_guardian_id, new.session_id, 'left', new.left_at)
      on conflict (session_id, student_id, kind) do nothing;
    end if;
  exception when others then
    -- fail-safe مقصود وموثّق: تنبيه فاشل لا يكسر حفظ الحضور أبداً
    null;
  end;
  return new;
end $$;

create trigger attendance_guardian_notify_trg
  after insert or update on public.attendance
  for each row execute function public.guardian_notify_on_attendance();

commit;

begin;

-- ============================================================================
-- بوابة ولي الأمر — صندوق التنبيهات (security definer، بالتوكن فقط،
-- بنفس تحقق portal_validate_token من 0005 حرفياً).
-- ============================================================================

-- تنبيهات طالب الرابط: أحدث 30 تنبيهاً ببيانات حصصها للعرض + عدّاد
-- غير المقروء. الحقول محدودة بالتصميم: نوع ووقت وتاريخ/وقت/مجموعة
-- الحصة وحالة القراءة فقط — لا معرّفات داخلية غير لازمة للعرض.
create or replace function public.portal_list_guardian_notifications(
  p_token text,
  p_student_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.guardian_access_tokens;
begin
  tok := public.portal_validate_token(p_token, p_student_id);

  return jsonb_build_object(
    'unread_count', (
      select count(*) from public.guardian_notifications gn
      where gn.student_id = p_student_id and gn.read_at is null
    ),
    'notifications', coalesce((
      select jsonb_agg(t order by event_at desc)
      from (
        select jsonb_build_object(
          'id', gn.id,
          'kind', gn.kind,
          'event_at', gn.event_at,
          'read_at', gn.read_at,
          'session_date', se.session_date,
          'start_time', se.start_time,
          'group_name', g.name
        ) as t, gn.event_at
        from public.guardian_notifications gn
        join public.sessions se on se.id = gn.session_id
        join public.groups g on g.id = se.group_id
        where gn.student_id = p_student_id
          and gn.teacher_id = tok.teacher_id
        order by gn.event_at desc
        limit 30
      ) x
    ), '[]'::jsonb)
  );
end $$;

-- تعليم كمقروء: كتابة مقيدة بالتوكن تضبط read_at فقط، لصفوف هذا
-- الطالب حصراً — إما قائمة معرّفات صريحة أو الكل (p_ids null).
-- لا يقدر ولي الأمر أن يعلّم تنبيه طالب آخر: التصفية بـ student_id
-- صاحب التوكن المتحقق منه، وأي معرّف غريب يُتجاهل بصمت.
create or replace function public.portal_mark_notifications_read(
  p_token text,
  p_student_id uuid,
  p_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.guardian_access_tokens;
  v_updated int;
begin
  tok := public.portal_validate_token(p_token, p_student_id);

  update public.guardian_notifications gn
  set read_at = now()
  where gn.student_id = p_student_id
    and gn.teacher_id = tok.teacher_id
    and gn.read_at is null
    and (p_ids is null or gn.id = any (p_ids));
  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'updated', v_updated,
    'unread_count', (
      select count(*) from public.guardian_notifications gn
      where gn.student_id = p_student_id and gn.read_at is null
    )
  );
end $$;

grant execute on function public.portal_list_guardian_notifications(text, uuid) to anon, authenticated;
grant execute on function public.portal_mark_notifications_read(text, uuid, uuid[]) to anon, authenticated;

commit;

-- ============================================================================
-- نهاية 0012 — عمود: attendance.left_at | جدول: guardian_notifications
-- (قيد فريد session+student+kind) | trigger: attendance_guardian_notify_trg
-- دوال: guardian_notify_on_attendance (داخلية بالـ trigger) +
-- portal_list_guardian_notifications + portal_mark_notifications_read
-- ============================================================================
