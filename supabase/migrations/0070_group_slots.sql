-- ============================================================================
-- 0070 — مواعيد أسبوعية متعددة للمجموعة الواحدة (3A-926) + أرضية تاريخ
-- الإنشاء لتوليد الحصص (3A-925 بند ٢)
-- ----------------------------------------------------------------------------
-- المشكلتان:
-- (أ) المجموعة لها أيام متعددة لكن بوقت واحد ومدة واحدة (days[] + start_time
--     + duration_minutes) — والمطلوب مواعيد مستقلة: السبت ١٢:٠٠ + الاثنين
--     ١٦:٠٠ بمدد قد تختلف.
-- (ب) generate_group_sessions كانت تولّد حصص الشهر كله من أوله حتى لمجموعة
--     أُنشئت اليوم — فتظهر في الواجبات/الجدول حصص أكتوبر ونوفمبر لمجموعة
--     وُلدت في آخر نوفمبر.
--
-- التصميم (إضافة لا استبدال — صفر كسر لأي قارئ قائم):
-- • عمود groups.slots ‏(jsonb، افتراضي []) = مصدر الحقيقة الجديد:
--   مصفوفة عناصر {day: 0..6 (dow — 0=الأحد كالأيام الحالية), start_time:
--   "HH:MM", duration_minutes: int}.
-- • الأعمدة القديمة تبقى مرايا يكتبها العميل مع كل حفظ (days = أيام
--   المواعيد مرتبة فريدة، start_time/duration_minutes = الموعد الأول) —
--   فكل القراء الحاليين (البوابتان، كشف التعارض، القوائم) يعملون كما هم.
-- • الترحيل هنا يعبّئ slots من الأعمدة القديمة لكل مجموعة قائمة.
-- • الدالة تُعاد كتابتها: تولّد من كل موعد على حدة، وتبدأ من يوم إنشاء
--   المجموعة (بتوقيت Africa/Cairo) لا من أول الشهر. الحارس الصارم (0020)
--   وحارس الأرشفة (0007) وحالة الإجازة حرفياً كما هي.
-- • فهرس التفرد sessions_regular_unique يتسع بـ start_time: موعدان منتظمان
--   في نفس اليوم بأوقات مختلفة صارا مشروعين؛ التخفيف لا يكسر بيانات قائمة.
-- ============================================================================

alter table public.groups
  add column if not exists slots jsonb not null default '[]'::jsonb;

-- تعبئة المواعيد من الأعمدة القديمة: موعد لكل يوم بنفس الوقت والمدة
update public.groups g
set slots = (
  select jsonb_agg(
    jsonb_build_object(
      'day', dd,
      'start_time', g.start_time::text,
      'duration_minutes', g.duration_minutes
    ) order by dd
  )
  from unnest(g.days) as dd
)
where cardinality(g.days) > 0;

-- موعدان في نفس اليوم بوقتين مختلفين لم يعودا تصادماً
drop index if exists public.sessions_regular_unique;
create unique index sessions_regular_unique
  on public.sessions (group_id, session_date, start_time) where kind = 'regular';

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
  v_slots jsonb;
  v_slot jsonb;
  v_first_day date;
begin
  -- حراسة صارمة (0020 — حرفية): لا مستدعي بلا جلسة، والمستدعي يجب أن يكون
  -- مالك السنتر أو عضواً نشطاً عنده
  if auth.uid() is null
     or (
       not public.is_teacher_owner(p_teacher_id)
       and not exists (
         select 1 from public.teacher_members
         where teacher_id = p_teacher_id and user_id = auth.uid() and status = 'active'
       )
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

  -- المواعيد الفعّالة: slots هي مصدر الحقيقة (3A-926)؛ مجموعة لم تُرحَّل
  -- أو كتبها عميل أقدم (slots فارغة) تُشتق مواعيدها من الأعمدة القديمة
  if g.slots is not null and jsonb_array_length(g.slots) > 0 then
    v_slots := g.slots;
  else
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'day', dd,
        'start_time', g.start_time::text,
        'duration_minutes', g.duration_minutes
      )
    ), '[]'::jsonb)
    into v_slots
    from unnest(g.days) as dd;
  end if;
  if v_slots is null or jsonb_array_length(v_slots) = 0 then
    return 0;
  end if;

  -- أرضية الإنشاء (3A-925): لا حصة قبل يوم إنشاء المجموعة بتوقيت القاهرة —
  -- مجموعة أُنشئت اليوم لا تولّد إلا من اليوم فصاعداً داخل أي شهر مطلوب
  v_first_day := greatest(month_start, (g.created_at at time zone 'Africa/Cairo')::date);

  for v_slot in select * from jsonb_array_elements(v_slots) loop
    -- عنصر موعد مشوّه (لا يحدث من العميل أبداً) يُتخطّى لا يفجّر التوليد
    continue when (v_slot->>'day') is null
      or (v_slot->>'day') !~ '^[0-6]$'
      or (v_slot->>'start_time') is null
      or (v_slot->>'duration_minutes') is null;
    d := v_first_day;
    while d <= month_end loop
      if extract(dow from d)::int = (v_slot->>'day')::int then
        insert into public.sessions
          (teacher_id, group_id, session_date, start_time, duration_minutes, kind, status)
        values
          (p_teacher_id, p_group_id, d, (v_slot->>'start_time')::time,
           (v_slot->>'duration_minutes')::int, 'regular',
           case when exists (
             select 1 from public.holidays h
             where h.teacher_id = p_teacher_id and h.holiday_date = d
           ) then 'cancelled'::session_status else 'scheduled'::session_status end)
        on conflict do nothing;
        if found then created := created + 1; end if;
      end if;
      d := d + 1;
    end loop;
  end loop;
  return created;
end $function$;

revoke execute on function public.generate_group_sessions(uuid, uuid, date) from public, anon;
