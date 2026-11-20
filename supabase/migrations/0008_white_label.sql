-- ============================================================================
-- تطبيق المدرس — 0008_white_label.sql
-- Phase 3 / الخطوة 1: الهوية البيضاء (White-label)
--
-- كل مدرس/سنتر يقدر يخصّص هويته التجارية: اسم السنتر، شعار مرفوع، ولون
-- لهجة اختياري — تنعكس على كارت الطالب الرقمي والإيصالات وأوراق الامتحان
-- وبوابة ولي الأمر، مع سقوط آمن لهوية التطبيق الافتراضية عند غياب أي عنصر.
--
-- نموذج التخزين: أعمدة جديدة على teacher_settings القائم (صف واحد لكل
-- مدرس أصلاً، وسياسة RLS للمالك فقط settings_owner_all من 0001) — لا
-- جدول جديد، فلا تغيير في نطاق النسخة الاحتياطية (21 جدولاً + صف
-- الإعدادات الذي تُصدَّر أعمدته الجديدة تلقائياً عبر SETTINGS_COLS).
--
-- الشعار: bucket عام القراءة باسم brand-logos — الشعار علامة تجارية
-- معلنة بطبيعتها (تظهر لولي الأمر بلا جلسة)، والكتابة مقيدة بالمالك في
-- مجلده فقط: المسار دائماً «<teacher_id>/logo.<ext>». حد 2MB وصور فقط
-- (jpeg/png/webp) يفرضها الـ bucket على الخادم.
--
-- البوابة: portal_build_overview تُوسَّع بمفتاح brand واحد فقط (اسم
-- السنتر التجاري + اسم المدرس + مسار الشعار + لون اللهجة) — نفس جسم
-- 0003 حرفياً + المفتاح الجديد، وبنفس التحقق بالتوكن في
-- portal_overview_by_token (0002) التي تستدعيها. العميل يبني رابط
-- الشعار العام من المسار عبر Storage API.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- أعمدة الهوية على teacher_settings
-- ----------------------------------------------------------------------------
alter table public.teacher_settings
  add column brand_name text
    check (brand_name is null or char_length(brand_name) between 1 and 80),
  add column brand_logo_path text,
  add column brand_accent text
    check (brand_accent is null or brand_accent ~ '^#[0-9A-Fa-f]{6}$');

commit;

begin;

-- ----------------------------------------------------------------------------
-- Storage — bucket شعارات الهوية (قراءة عامة، كتابة للمالك في مجلده فقط)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-logos',
  'brand-logos',
  true,
  2097152,  -- 2MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- قراءة عامة: الشعار يظهر في بوابة ولي الأمر (anon) وفي المطبوعات
create policy brand_logos_public_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'brand-logos');

-- المالك يرفع شعاراً جديداً داخل مجلده فقط (المسار يبدأ بمعرّفه)
create policy brand_logos_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'brand-logos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- المالك يستبدل شعاره (upsert على نفس المسار)
create policy brand_logos_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'brand-logos'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'brand-logos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- المالك يحذف شعاره
create policy brand_logos_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'brand-logos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

commit;

begin;

-- ============================================================================
-- بوابة ولي الأمر — توسيع portal_build_overview بمفتاح brand فقط.
-- نفس جسم 0003 حرفياً (بما فيه إصلاحا jsonb_agg) + قسم الهوية:
-- brand_name من teacher_settings، واسم المدرس من teachers، ومسار الشعار
-- (العميل يبني الرابط العام)، ولون اللهجة. غياب صف الإعدادات أو أي
-- عنصر = null فيسقط العميل للافتراضي.
-- ============================================================================
create or replace function public.portal_build_overview(p_student_id uuid)
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
    'latest_scores', coalesce((
      select jsonb_agg(t order by assess_date desc)
      from (
        select jsonb_build_object(
          'title', a.title,
          'date', a.assess_date,
          'score', sc.score,
          'max_score', a.max_score
        ) as t, a.assess_date
        from public.scores sc
        join public.assessments a on a.id = sc.assessment_id
        where sc.student_id = s.id
        order by a.assess_date desc
        limit 10
      ) x
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('date', n.note_date, 'text', n.text)
                        order by n.note_date desc)
      from public.student_notes n
      where n.student_id = s.id
    ), '[]'::jsonb),
    'recent_attendance', coalesce((
      select jsonb_agg(t order by session_date desc)
      from (
        select jsonb_build_object(
          'date', se.session_date,
          'group_name', g.name,
          'status', at.status
        ) as t, se.session_date
        from public.attendance at
        join public.sessions se on se.id = at.session_id
        join public.groups g on g.id = se.group_id
        where at.student_id = s.id and at.status is not null
        order by se.session_date desc
        limit 10
      ) x
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.portal_build_overview(uuid) from anon, authenticated;

commit;

-- ============================================================================
-- نهاية 0008 — أعمدة: teacher_settings.brand_name / brand_logo_path /
-- brand_accent | bucket: brand-logos (public read, owner write)
-- سياسات storage.objects: ‏4 | portal_build_overview: + مفتاح brand
-- ============================================================================
