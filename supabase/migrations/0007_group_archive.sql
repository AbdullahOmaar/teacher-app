-- ============================================================================
-- تطبيق المدرس — 0007_group_archive.sql
-- الخطوة 10 من Phase 2: حذف وأرشفة آمنة للطالب والمجموعة.
--
-- لماذا هذا الـ migration للمجموعات فقط؟
-- - الطالب: حالة الأرشفة موجودة أصلاً — students.paused موثّقة في المرجع
--   (FEATURES-UIUX-SPEC: «paused: موقوف/مؤرشف») ومستخدمة فعلياً في كل
--   المسارات التشغيلية (تُستبعد من الفوترة والحضور وقوائم التسجيل وتظهر
--   فقط في فلتر «موقوف / أرشيف»). إضافة علم أرشفة ثانٍ للطالب كانت ستخلق
--   حالتين متداخلتين بلا تمييز — لذا أرشفة الطالب = paused (بلا تغيير مخطط).
-- - المجموعة: لا توجد لها أي حالة إيقاف/أرشفة في 0001 إطلاقاً، فالحذف
--   النهائي كان هو الخيار الوحيد رغم أن invoices.group_id و sessions
--   و enrollments تمنعه عملياً لأي مجموعة لها تاريخ. لذا يُضاف هنا علم
--   أرشفة مستقل وواضح: archived_at (null = نشطة).
--
-- أرشفة المجموعة تعني: تتوقف عن توليد حصص جديدة (حارس داخل
-- generate_group_sessions أدناه + تصفية في الواجهة)، ولا تظهر كخيار
-- تسجيل جديد، وتبقى كل بياناتها التاريخية (حصص/حضور/فواتير) كما هي.
-- لا مساس إطلاقاً بـ invoices/payments في هذه الخطوة.
-- ============================================================================

begin;

alter table public.groups
  add column archived_at timestamptz;

comment on column public.groups.archived_at is
  'أرشفة المجموعة (Phase 2 خطوة 10): null = نشطة، وغير ذلك = مؤرشفة — لا حصص جديدة ولا تسجيل جديد، والتاريخ محفوظ';

-- إعادة إنشاء generate_group_sessions بنفس نص 0001 حرفياً + حارس أرشفة واحد:
-- المجموعة المؤرشفة لا تولّد أي حصص جديدة (يُرجع 0 دون أي إدراج).
create or replace function public.generate_group_sessions(
  p_teacher_id uuid,
  p_group_id   uuid,
  p_month      date  -- أي يوم داخل الشهر المطلوب
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  d date;
  month_start date := date_trunc('month', p_month)::date;
  month_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  created int := 0;
begin
  -- حراسة: المستدعي (إن وُجد) يجب أن يكون المالك أو عضواً نشطاً عند هذا المدرس
  if auth.uid() is not null
     and auth.uid() <> p_teacher_id
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
end $$;

commit;
