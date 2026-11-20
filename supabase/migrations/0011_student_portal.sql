-- ============================================================================
-- تطبيق المدرس — 0011_student_portal.sql
-- Phase 3 / الخطوة 5: بوابة الطالب (Student Portal)
--
-- دخول الطالب نفسه برابط موقّع خاص به — منفصل تماماً عن رابط ولي الأمر
-- (guardian_access_tokens) وعن رابط الامتحان (online_exam_tokens):
-- كل بوابة لها جدول توكناتها ودوالها، فإلغاء رابط لا يمسّ الباقي، وصلاحية
-- كل رابط محدودة ببيانات صاحبه حصراً.
--
-- نموذج البيانات:
-- • student_access_tokens: صف لكل رابط طالب — القاعدة تخزن SHA-256 hash
--   فقط للرمز العشوائي (نمط guardian_access_tokens في 0001 حرفياً)، مع
--   انتهاء إلزامي (30 يوماً يضبطه العميل كنفس قرار بوابة ولي الأمر) وإلغاء
--   صريح وآخر استخدام. إعادة التوليد تُلغي الروابط النشطة السابقة لنفس
--   الطالب (يفرضه العميل كما في البوابة). الرابط يحمل التوكن وحده
--   (/student-portal?t=...) والطالب يُعرَف من صف التوكن نفسه — كنموذج
--   روابط الامتحانات (0010) — فلا معرّف طالب في الرابط أصلاً.
--
-- نموذج الأمان (شرط قبول الخطوة):
-- • قراءة فقط بالكامل: لا توجد أي دالة كتابة في هذه البوابة إطلاقاً —
--   الدالة العامة الوحيدة تعيد عرضاً جاهزاً، والمحلّل الداخلي يحدّث
--   last_used_at فقط كأثر جانبي للتحقق (نفس نمط البوابة والامتحان).
-- • لا سياسة RLS لـ anon على أي جدول هنا — وصول الطالب عبر RPC بـ
--   security definer فقط، تتحقق من هاش التوكن بنفس آلية البوابة
--   (0002/0003/0005): SHA-256، عدم الإلغاء، عدم الانتهاء، ورسالة خطأ
--   واحدة آمنة «invalid or expired token» لا تكشف أي تفصيل.
-- • الحقول محدودة بالتصميم: بيانات هذا الطالب فقط في أربعة محاور —
--   حصصه القادمة (مجموعاته المسجل فيها)، واجباته وحالتها (من صفوف
--   attendance الخاصة به)، درجاته ونتائج امتحاناته الإلكترونية (scores
--   الخاصة به بمصدرها + محاولاته المُسلَّمة)، ومدفوعاته ورصيده (من
--   invoice_balances/payments الخاصة به) — بالإضافة لهوية السنتر
--   البيضاء (0008) في الترويسة. لا بيانات ولي أمر (لا اسم ولا هاتف)،
--   لا أي بيانات زملاء، ولا أي مالية مدرس (مصروفات/أرباح/حصص سنتر).
-- • RLS للمدرس: المالك فقط على جدول التوكنات (أسرار وصول — مطابقةً
--   لسياسة guardian_tokens_owner_all وonline_exam_tokens_owner_all)،
--   فالمساعد لا يرى الروابط ولا يولّدها.
--
-- النسخة الاحتياطية: روابط الطالب رموز وصول أمنية كروابط البوابة
-- والامتحانات — تُستثنى من النسخة بوعي (القاعدة تخزن هاشاتها فقط أصلاً،
-- والروابط تُعاد توليدها من ملف الطالب عند الحاجة)، فلا جدول بيانات
-- جديداً يدخل نطاق النسخة ويبقى عدد جداولها 24 كما هو. وُثّق الاستثناء
-- أيضاً في ترويسة BACKUP_TABLES في src/features/settings/api.ts.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- روابط بوابة الطالب — هاش فقط (نمط guardian_access_tokens حرفياً)
-- ----------------------------------------------------------------------------
create table public.student_access_tokens (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  student_id   uuid not null references public.students (id) on delete cascade,
  token_hash   text not null unique,  -- SHA-256 hex للرمز العشوائي
  expires_at   timestamptz not null,  -- العميل يضبطه بعد 30 يوماً (قرار البوابة)
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
create index student_tokens_student_idx on public.student_access_tokens (student_id);
create index student_tokens_teacher_idx on public.student_access_tokens (teacher_id);

-- ----------------------------------------------------------------------------
-- RLS — المالك فقط (أسرار وصول)، وبلا أي سياسة لـ anon إطلاقاً
-- ----------------------------------------------------------------------------
alter table public.student_access_tokens enable row level security;

create policy student_tokens_owner_all on public.student_access_tokens
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

commit;

begin;

-- ============================================================================
-- دوال RPC لبوابة الطالب — security definer، والتحقق بالتوكن بنفس آلية
-- البوابة (0002/0003/0005) ونفس نمط محلّل الامتحانات (0010).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- محلّل التوكن الداخلي: يطابق الهاش، يتحقق من عدم الإلغاء والانتهاء،
-- ويسجّل آخر استخدام، ويعيد هوية الطالب صاحب الرابط. داخلي فقط: يُسحب
-- من الجميع ولا يُستدعى إلا من دوال security definer أخرى.
-- ----------------------------------------------------------------------------
create or replace function public.student_portal_resolve_token(p_token text)
returns table (
  token_id uuid,
  teacher_id uuid,
  student_id uuid
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.student_access_tokens;
begin
  select * into tok
  from public.student_access_tokens
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'invalid or expired token';
  end if;

  update public.student_access_tokens
  set last_used_at = now()
  where id = tok.id;

  return query select tok.id, tok.teacher_id, tok.student_id;
end $$;

revoke execute on function public.student_portal_resolve_token(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- بانٍ داخلي لعرض الطالب: حقول محدودة بالتصميم لأربعة محاور فقط.
-- داخلي فقط (يُسحب من anon/authenticated) — لا يُستدعى إلا بعد تحقق
-- التوكن في الدالة العامة أدناه، تماماً كنموذج portal_build_overview.
-- ----------------------------------------------------------------------------
create or replace function public.student_portal_build_overview(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  select * into s from public.students where id = p_student_id;
  if not found then
    raise exception 'student not found';
  end if;

  return jsonb_build_object(
    'student', jsonb_build_object(
      'name', s.name,
      'code', s.public_code,
      'grade', s.grade
    ),
    'brand', (
      select jsonb_build_object(
        'name', ts.brand_name,
        'teacher_name', t.display_name,
        'logo_path', ts.brand_logo_path,
        'accent', ts.brand_accent
      )
      from public.teachers t
      left join public.teacher_settings ts on ts.teacher_id = t.id
      where t.id = s.teacher_id
    ),
    'attendance_rate', (
      select attendance_rate from public.student_attendance_stats
      where student_id = s.id
    ),
    'balance', coalesce((
      select balance from public.student_balances where student_id = s.id
    ), 0),
    -- مجموعات الطالب المسجل فيها (مواعيدها الثابتة وروابط ملازمها)
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', g.name,
        'days', g.days,
        'start_time', g.start_time,
        'room', g.room,
        'links', g.links
      ) order by g.name)
      from public.enrollments e
      join public.groups g on g.id = e.group_id
      where e.student_id = s.id
    ), '[]'::jsonb),
    -- حصصه القادمة: حصص مجموعاته المسجل فيها فقط، المجدولة من اليوم
    -- فصاعداً — بلا أي صف طالب آخر إطلاقاً (الحصص كيان مجموعة لا طالب)
    'upcoming_sessions', coalesce((
      select jsonb_agg(t order by session_date, start_time)
      from (
        select jsonb_build_object(
          'date', se.session_date,
          'start_time', se.start_time,
          'duration_minutes', se.duration_minutes,
          'kind', se.kind,
          'group_name', g.name,
          'room', g.room
        ) as t, se.session_date, se.start_time
        from public.sessions se
        join public.groups g on g.id = se.group_id
        where se.teacher_id = s.teacher_id
          and se.session_date >= current_date
          and se.status = 'scheduled'
          and exists (
            select 1 from public.enrollments e
            where e.student_id = s.id and e.group_id = se.group_id
          )
        order by se.session_date, se.start_time
        limit 20
      ) x
    ), '[]'::jsonb),
    -- واجباته: صفوف حضوره هو فقط (الحالة + تسليم الواجب) — أحدث 20 حصة
    'homework', coalesce((
      select jsonb_agg(t order by session_date desc)
      from (
        select jsonb_build_object(
          'date', se.session_date,
          'group_name', g.name,
          'status', at.status,
          'homework_done', at.homework_done
        ) as t, se.session_date
        from public.attendance at
        join public.sessions se on se.id = at.session_id
        join public.groups g on g.id = se.group_id
        where at.student_id = s.id and at.status is not null
        order by se.session_date desc
        limit 20
      ) x
    ), '[]'::jsonb),
    'homework_summary', (
      select jsonb_build_object(
        'marked', count(*) filter (where at.status is not null),
        'submitted', count(*) filter (where at.status is not null and at.homework_done)
      )
      from public.attendance at
      where at.student_id = s.id
    ),
    -- درجاته: scores الخاصة به فقط، شاملة المُرحَّلة من الامتحانات
    -- الإلكترونية ومميَّزة بمصدرها (source) — أحدث 20 درجة
    'grades', coalesce((
      select jsonb_agg(t order by assess_date desc)
      from (
        select jsonb_build_object(
          'title', a.title,
          'type', a.type,
          'date', a.assess_date,
          'score', sc.score,
          'max_score', a.max_score,
          'pass_score', a.pass_score,
          'source', sc.source
        ) as t, a.assess_date
        from public.scores sc
        join public.assessments a on a.id = sc.assessment_id
        where sc.student_id = s.id
        order by a.assess_date desc
        limit 20
      ) x
    ), '[]'::jsonb),
    -- نتائج امتحاناته الإلكترونية: محاولاته المُسلَّمة هو فقط
    'exam_results', coalesce((
      select jsonb_agg(t order by submitted_at desc)
      from (
        select jsonb_build_object(
          'title', a.title,
          'attempt_no', ea.attempt_no,
          'score', ea.score,
          'max_score', ea.max_score,
          'pct', ea.pct,
          'submitted_at', ea.submitted_at,
          'score_posted', ea.score_posted
        ) as t, ea.submitted_at
        from public.exam_attempts ea
        join public.online_exams oe on oe.id = ea.exam_id
        join public.assessments a on a.id = oe.assessment_id
        where ea.student_id = s.id and ea.status = 'submitted'
        order by ea.submitted_at desc
        limit 10
      ) x
    ), '[]'::jsonb),
    -- فواتيره هو فقط بأرصدتها المحسوبة من الـ view — أحدث 12 شهراً
    'invoices', coalesce((
      select jsonb_agg(t order by period_month desc)
      from (
        select jsonb_build_object(
          'period_month', ib.period_month,
          'group_name', g.name,
          'total', ib.total,
          'paid', ib.paid,
          'balance', ib.balance,
          'is_paid', ib.is_paid
        ) as t, ib.period_month
        from public.invoice_balances ib
        join public.groups g on g.id = ib.group_id
        where ib.student_id = s.id
        order by ib.period_month desc
        limit 12
      ) x
    ), '[]'::jsonb),
    -- دفعاته هو فقط — أحدث 15 دفعة (الدفعات العكسية السالبة تظهر كما هي)
    'recent_payments', coalesce((
      select jsonb_agg(t order by paid_on desc, created_at desc)
      from (
        select jsonb_build_object(
          'amount', p.amount,
          'method', p.method,
          'paid_on', p.paid_on,
          'receipt_no', p.receipt_no
        ) as t, p.paid_on, p.created_at
        from public.payments p
        join public.invoices i on i.id = p.invoice_id
        where i.student_id = s.id
        order by p.paid_on desc, p.created_at desc
        limit 15
      ) x
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.student_portal_build_overview(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- الدالة العامة الوحيدة لبوابة الطالب: تحقق بالتوكن ثم العرض المحدود.
-- قراءة فقط — لا توجد أي دالة كتابة في هذه البوابة.
-- ----------------------------------------------------------------------------
create or replace function public.student_portal_overview_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
begin
  select * into r from public.student_portal_resolve_token(p_token);
  return public.student_portal_build_overview(r.student_id);
end $$;

grant execute on function public.student_portal_overview_by_token(text) to anon, authenticated;

commit;

-- ============================================================================
-- نهاية 0011 — جدول: student_access_tokens (RLS مالك فقط)
-- دوال: student_portal_resolve_token (داخلية) +
-- student_portal_build_overview (داخلية) +
-- student_portal_overview_by_token (عامة، قراءة فقط)
-- ============================================================================
