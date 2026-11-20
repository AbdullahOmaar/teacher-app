-- ===========================================================================
-- تطبيق المدرس — 0019_public_enrolment.sql
-- Phase 5 / الخطوة 2 (P5-2): صفحة حجز/تسجيل عامة لكل سنتر
--
-- رابط عام واحد لكل سنتر يملأه ولي الأمر (اسم الطالب، موبايل ولي الأمر،
-- المجموعة المطلوبة، حصة تجريبية اختيارية، ملاحظات) فتهبط الطلبات في
-- قائمة الانتظار الحالية (group_waitlist) بمصدر مميز «صفحة الحجز»،
-- والمدرس يقبلها من واجهة المجموعة فتتحول لطالب مسجل بنفس المجموعة.
--
-- نموذج الرابط (قرار موثق): جدول enrolment_links منفصل يخزن SHA-256 hash
-- فقط للرمز العشوائي — نمط جداول روابط البوابات والامتحانات حرفياً
-- (guardian_access_tokens ‏0001، student_access_tokens ‏0011). فرقان
-- مقصودان عن روابط البوابات الشخصية:
-- • لا انتهاء زمني: صفحة السنتر العامة أصل عام دائم (كرابط صفحة فيسبوك)
--   لا بوابة بيانات شخصية؛ التحكم يكون بمفتاح التفعيل/التعطيل وبالتجديد
--   الذي يستبدل الهاش فيبطل الرابط القديم فوراً.
-- • صف واحد لكل سنتر (teacher_id مفتاح أساسي): رابط عام واحد يُشارك،
--   لا رابط لكل شخص.
--
-- نموذج الأمان:
-- • لا سياسة RLS لـ anon على أي جدول هنا، ولا إدراج مباشر على
--   group_waitlist من anon إطلاقاً — الكتابة العامة الوحيدة عبر
--   enrolment_submit_by_token بـ security definer بعد تحقق خادمي كامل.
-- • enrolment_links بسياسة المالك فقط (أسرار وصول — مطابقة لسياسات
--   جداول التوكنات)، فالمساعد لا يرى الرابط ولا يديره.
-- • الصفحة العامة لا تعيد إلا هوية السنتر البيضاء (0008) ومجموعاته
--   النشطة (الاسم/الأيام/الوقت/المدة فقط — لا أسعار، لا بيانات طلاب).
-- • حماية الإساءة: حقل honeypot (إسقاط صامت)، تحقق صيغة موبايل مصري
--   خادمياً، وحدّا معدل أساسيان: نفس الرقم 3 طلبات/24 ساعة لكل سنتر،
--   والسنتر كله 30 طلباً/ساعة.
-- • رسالة خطأ آمنة واحدة للرابط: «invalid or disabled link» لا تكشف
--   إن كان الرمز موجوداً أصلاً أم معطّلاً.
--
-- قائمة الانتظار: عمودا source ‏('manual' افتراضياً للمدخل يدوياً من
-- المدرس، 'booking_page' لطلبات الصفحة) وwants_trial. صفوف المصدر
-- القديم لا تتغير دلالياً.
--
-- النسخة الاحتياطية: enrolment_links سر وصول (هاش فقط) — تُستثنى من
-- النسخة بوعي كسائر جداول التوكنات، والرابط يُعاد توليده من الإعدادات
-- عند الحاجة. group_waitlist موجودة أصلاً في النسخة؛ يُوسَّع عموداها
-- في BACKUP_TABLES (src/features/settings/api.ts).
-- ===========================================================================

begin;

-- ----------------------------------------------------------------------------
-- رابط الحجز العام — هاش فقط، صف لكل سنتر (نمط جداول التوكنات)
-- ----------------------------------------------------------------------------
create table public.enrolment_links (
  teacher_id   uuid primary key references public.teachers (id) on delete cascade,
  token_hash   text not null unique,  -- SHA-256 hex للرمز العشوائي
  enabled      boolean not null default true,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.enrolment_links enable row level security;

-- المالك فقط: الرابط سر وصول يديره صاحب السنتر وحده (كجداول التوكنات)
create policy enrolment_links_owner_all on public.enrolment_links
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- ----------------------------------------------------------------------------
-- قائمة الانتظار: مصدر الطلب + طلب حصة تجريبية
-- ----------------------------------------------------------------------------
alter table public.group_waitlist
  add column source text not null default 'manual'
    check (source in ('manual', 'booking_page')),
  add column wants_trial boolean not null default false;

-- فهارس حدود المعدل (استعلامات الـ RPC أدناه)
create index group_waitlist_booking_rate_idx
  on public.group_waitlist (teacher_id, created_at)
  where source = 'booking_page';

-- ----------------------------------------------------------------------------
-- المحلّل الداخلي: رمز خام → السنتر، مع فرض التفعيل (بلا أي كشف تفاصيل)
-- ----------------------------------------------------------------------------
create or replace function public.enrolment_resolve_token(p_token text)
returns table (teacher_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  link public.enrolment_links;
begin
  select * into link
  from public.enrolment_links
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and enabled;

  if not found then
    raise exception 'invalid or disabled link';
  end if;

  update public.enrolment_links
  set last_used_at = now()
  where enrolment_links.teacher_id = link.teacher_id;

  return query select link.teacher_id;
end $$;

revoke execute on function public.enrolment_resolve_token(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- الصفحة العامة: هوية السنتر + مجموعاته النشطة فقط (لا أسعار، لا طلاب)
-- ----------------------------------------------------------------------------
create or replace function public.enrolment_page_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
begin
  select * into r from public.enrolment_resolve_token(p_token);

  return jsonb_build_object(
    'brand', (
      select jsonb_build_object(
        'name', ts.brand_name,
        'teacher_name', t.display_name,
        'logo_path', ts.brand_logo_path,
        'accent', ts.brand_accent
      )
      from public.teachers t
      left join public.teacher_settings ts on ts.teacher_id = t.id
      where t.id = r.teacher_id
    ),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'days', g.days,
        'start_time', g.start_time,
        'duration_minutes', g.duration_minutes
      ) order by g.name)
      from public.groups g
      where g.teacher_id = r.teacher_id
        and g.archived_at is null
    ), '[]'::jsonb)
  );
end $$;

grant execute on function public.enrolment_page_by_token(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- إرسال طلب حجز: تحقق خادمي كامل + حدود معدل + honeypot صامت
-- ----------------------------------------------------------------------------
create or replace function public.enrolment_submit_by_token(
  p_token text,
  p_student_name text,
  p_guardian_phone text,
  p_group_id uuid,
  p_wants_trial boolean default false,
  p_note text default null,
  p_honeypot text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_name text;
  v_phone text;
  v_note text;
  v_recent_phone int;
  v_recent_teacher int;
begin
  -- honeypot: حقل خفي لا يملأه بشر — إسقاط صامت بنجاح وهمي
  if p_honeypot is not null and btrim(p_honeypot) <> '' then
    return jsonb_build_object('ok', true);
  end if;

  select * into r from public.enrolment_resolve_token(p_token);

  v_name := btrim(coalesce(p_student_name, ''));
  if char_length(v_name) < 3 or char_length(v_name) > 80 then
    raise exception 'invalid name';
  end if;

  -- موبايل مصري: 11 رقماً يبدأ بـ 010/011/012/015 بعد نزع المسافات والشرطات
  v_phone := regexp_replace(coalesce(p_guardian_phone, ''), '[\s-]', '', 'g');
  if v_phone !~ '^01[0125][0-9]{8}$' then
    raise exception 'invalid phone';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid note';
  end if;

  -- المجموعة المطلوبة: موجودة، لنفس السنتر، وغير مؤرشفة
  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id
      and g.teacher_id = r.teacher_id
      and g.archived_at is null
  ) then
    raise exception 'invalid group';
  end if;

  -- حدود المعدل: نفس الرقم 3 طلبات/24 ساعة، والسنتر 30 طلباً/ساعة
  select count(*) into v_recent_phone
  from public.group_waitlist w
  where w.teacher_id = r.teacher_id
    and w.source = 'booking_page'
    and w.phone = v_phone
    and w.created_at > now() - interval '24 hours';
  if v_recent_phone >= 3 then
    raise exception 'too many requests';
  end if;

  select count(*) into v_recent_teacher
  from public.group_waitlist w
  where w.teacher_id = r.teacher_id
    and w.source = 'booking_page'
    and w.created_at > now() - interval '1 hour';
  if v_recent_teacher >= 30 then
    raise exception 'too many requests';
  end if;

  insert into public.group_waitlist (
    teacher_id, group_id, name, phone, note, source, wants_trial
  ) values (
    r.teacher_id, p_group_id, v_name, v_phone, v_note,
    'booking_page', coalesce(p_wants_trial, false)
  );

  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.enrolment_submit_by_token(text, text, text, uuid, boolean, text, text)
  to anon, authenticated;

commit;
