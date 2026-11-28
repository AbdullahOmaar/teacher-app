-- ============================================================================
-- 0074 — صفحة المدرّس الشخصية العامة + قسم المحتوى (Phase 2 — 3A-929)
-- ----------------------------------------------------------------------------
-- أمر مالك 2026-11-28 ~00:07: الصفحة الشخصية العامة تُبنى بالتوازي مع
-- إقفال فيز 2 — الاتجاه المعتمد (تعليقا 34fa34ac + 2f8353a0 على مجمّع
-- 3A-890): بروفايل منصة قوي — غلاف + عن المدرّس + تبويبات (منشورات /
-- كورسات / كتب / عن المدرّس) + تقييمات حقيقية فقط + زر حجز بارز لصفحة
-- الحجز العامة. وقسم المحتوى (c9458350 + تعديل عدم الاستضافة
-- 411427db): مقالات نصية داخل التطبيق + كتب/كورسات/قوائم تشغيل
-- **روابط خارجية فقط — لا رفع ولا استضافة ملفات إطلاقاً في هذه
-- الفيتشر** (لا bucket ولا عمود ملف).
--
-- ما تبنيه هذه المهاجرة:
-- • الجداول: ‏teacher_profiles (صف لكل مدرّس: slug عام فريد + عنوان
--   + نبذة + غلاف كرابط صورة خارجي + علم ظهور افتراضياً مطفأ)،
--   ‏teacher_profile_posts (منشورات)، ‏teacher_profile_content
--   (محتوى بأنواعه الأربعة — بقيد مخطط يفرض: المقال نصّه موجود،
--   وغيره رابطه الخارجي موجود)، ‏teacher_profile_ratings (تقييمات:
--   نجوم 1–5 + تعليق + نوع المقيّم + رابطه الحقيقي).
-- • ‏RLS: الإدارة للمالك وحده عبر is_teacher_owner على الجداول
--   الأربعة؛ التقييمات قراءة للمالك فقط (لا تحديث/حذف له عليها —
--   الإخفاء عبر RPC مخصص)، والإدخال عبر RPCs البوابات فقط. **لا
--   سياسة anon على أي جدول** — القراءة العامة كلها عبر
--   ‏public_teacher_profile() المقيدة الحقول أدناه.
-- • الاستحقاق «برو»: مفتاح خاصية جديد personal_page في منظومة
--   0059/0063 — (أ) قيود account_overrides تُمدَّد بنسخ v4 لتشمله
--   (تفعيل الأدمن اليدوي الفردي)، (ب) ‏effective_entitlements تُعاد
--   كتابتها من نسخة 0063 بذرة افتراضية: باقة pro/pilot ⇒
--   ‏personal_page=true قبل تطبيق التجاوزات (التجاوز يفوز دائماً —
--   فيقدر الأدمن يقفلها فردياً حتى لمشترك برو).
-- • الدالة الداخلية teacher_has_personal_page(): نفس منطق الحلّ
--   (باقة ⊕ تجاوز نشط أحدث) — بوابة كل أسطح الفيتشر الخادمية،
--   وممنوعة التنفيذ على أي دور عميل (داخلية فقط).
-- • ‏public_teacher_profile(p_slug): الحمولة العامة الكاملة بلا أي
--   حقل خاص (لا هواتف، لا بريد، لا معرّفات داخلية ما عدا معرّفات
--   المحتوى نفسه) — وترجع found=false بنفس الشكل للمجهول والمخفي
--   وغير المستحق (لا تسريب تمييز بين الحالات).
-- • الحجز من الصفحة: رابط الحجز الخام سرّ لا يُسترد من هاشه — فبدل
--   كشفه تُبنى طبقة حلّ بالسلاج: enrolment_resolve_profile داخلية +
--   ‏enrolment_page_by_profile / enrolment_submit_by_profile،
--   وجسمَا الصفحة/الإرسال استُخرجا لدالتين داخليتين
--   (enrolment_page_for_teacher / enrolment_submit_for_teacher)
--   تُعاد كتابة دالتي التوكن القائمتين فوقهما **بلا أي تغيير سلوكي**
--   (نفس التحققات وحدود المعدل والـ honeypot حرفياً من 0019).
-- • التقييم الحقيقي فقط: ‏submit_teacher_rating_guardian (يتحقق
--   بـ portal_validate_token القائمة — رابط/جلسة ولي الأمر + ربطه
--   بالطالب) وsubmit_teacher_rating_student (بـ
--   ‏student_portal_resolve_token) — وكلاهما يفرض وجود تسجيل فعلي
--   (enrollments) للطالب عند هذا المدرّس، ووحدة التقييم: مقيّم
--   واحد لكل (طالب، نوع) — إعادة الإرسال تحدّث تقييمه هو لا تنشئ
--   ثانياً. ‏my_teacher_rating_* لقراءة تقييمه الحالي للتهيئة.
--   ‏set_teacher_rating_hidden للمالك: إخفاء/إظهار فقط — لا حذف
--   ولا تعديل نص أبداً (سلامة إشراف).
-- • ‏delete_my_teacher_account: إعادة إنشاء نسخة 0065 + الجداول
--   الأربعة (قاعدة 0046).
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): مهاجرة كود فقط — لا
-- تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 + بوابة QA. العميل
-- يتحمّل غياب جداولها ودوالها (أسطح الإدارة تعرض حالة «قريباً»
-- المصممة، والصفحة العامة تعرض حالة مهذبة) حتى البوابة. قسم authz
-- الحي الخاص بها في scripts/authz_tests.py يتخطى نفسه بتوثيق صريح
-- ما دامت جداولها غائبة.
-- ترتيب التطبيق: بعد 0069 (تعتمد is_teacher_owner وis_platform_admin
-- وaccount_overrides وeffective_entitlements بشكل 0063/0069
-- وportal_validate_token وstudent_portal_resolve_token).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) جدول الصفحة الشخصية — صف واحد لكل مدرّس
-- ---------------------------------------------------------------------------
create table public.teacher_profiles (
  teacher_id      uuid primary key references public.teachers (id) on delete cascade,
  slug            text not null unique
                  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                     and char_length(slug) between 3 and 40),
  headline        text check (headline is null or char_length(headline) <= 120),
  bio             text check (bio is null or char_length(bio) <= 4000),
  -- الغلاف رابط صورة خارجي فقط — لا استضافة عندنا (تعديل 411427db)
  cover_image_url text check (cover_image_url is null
                     or cover_image_url ~ '^https?://'
                     and char_length(cover_image_url) <= 500),
  is_public       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger teacher_profiles_updated_trg before update on public.teacher_profiles
  for each row execute function public.set_updated_at();

alter table public.teacher_profiles enable row level security;

-- الإدارة للمالك وحده؛ لا سياسة anon إطلاقاً (العامة عبر الـ RPC فقط)
create policy teacher_profiles_owner_all on public.teacher_profiles
  for all using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));

revoke all on public.teacher_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.teacher_profiles to authenticated;
grant all on public.teacher_profiles to service_role;

-- ---------------------------------------------------------------------------
-- 2) منشورات الصفحة
-- ---------------------------------------------------------------------------
create table public.teacher_profile_posts (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) > 0
                and char_length(title) <= 160),
  body         text not null check (char_length(btrim(body)) > 0
                and char_length(body) <= 20000),
  is_published boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index teacher_profile_posts_teacher_idx
  on public.teacher_profile_posts (teacher_id, is_published, created_at desc);

create trigger teacher_profile_posts_updated_trg before update on public.teacher_profile_posts
  for each row execute function public.set_updated_at();

alter table public.teacher_profile_posts enable row level security;

create policy teacher_profile_posts_owner_all on public.teacher_profile_posts
  for all using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));

revoke all on public.teacher_profile_posts from public, anon, authenticated;
grant select, insert, update, delete on public.teacher_profile_posts to authenticated;
grant all on public.teacher_profile_posts to service_role;

-- ---------------------------------------------------------------------------
-- 3) محتوى الصفحة — مقالات نصية + روابط خارجية فقط
-- ---------------------------------------------------------------------------
create table public.teacher_profile_content (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  kind         text not null check (kind in ('article', 'book', 'course', 'playlist')),
  title        text not null check (char_length(btrim(title)) > 0
                and char_length(title) <= 160),
  description  text check (description is null or char_length(description) <= 1000),
  -- نص المقال وحده داخل التطبيق؛ لا ملفات إطلاقاً
  body         text check (body is null or char_length(body) <= 40000),
  external_url text check (external_url is null
                or (external_url ~ '^https?://'
                    and char_length(external_url) <= 1000)),
  is_published boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- شكل كل نوع مفروض في المخطط: المقال يحتاج نصاً، وغيره يحتاج رابطاً
  check ((kind = 'article' and body is not null and char_length(btrim(body)) > 0)
      or (kind <> 'article' and external_url is not null))
);
create index teacher_profile_content_teacher_idx
  on public.teacher_profile_content (teacher_id, kind, is_published, sort_order, created_at desc);

create trigger teacher_profile_content_updated_trg before update on public.teacher_profile_content
  for each row execute function public.set_updated_at();

alter table public.teacher_profile_content enable row level security;

create policy teacher_profile_content_owner_all on public.teacher_profile_content
  for all using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));

revoke all on public.teacher_profile_content from public, anon, authenticated;
grant select, insert, update, delete on public.teacher_profile_content to authenticated;
grant all on public.teacher_profile_content to service_role;

-- ---------------------------------------------------------------------------
-- 4) تقييمات حقيقية — من روابط/جلسات البوابات فقط، عبر الـ RPCs
-- ---------------------------------------------------------------------------
create table public.teacher_profile_ratings (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.teachers (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  reviewer_kind text not null check (reviewer_kind in ('guardian', 'student')),
  -- ولي الأمر مقيّماً بهويته؛ تقييم الطالب guardian_id فيه null حتماً
  guardian_id   uuid references public.guardians (id) on delete cascade,
  stars         int not null check (stars between 1 and 5),
  comment       text check (comment is null or char_length(comment) <= 1000),
  is_hidden     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((reviewer_kind = 'guardian' and guardian_id is not null)
      or (reviewer_kind = 'student' and guardian_id is null))
);
create index teacher_profile_ratings_teacher_idx
  on public.teacher_profile_ratings (teacher_id, is_hidden, created_at desc);
-- وحدة التقييم: ولي أمر واحد لكل طالب، وطالب واحد لنفسه
create unique index teacher_profile_ratings_guardian_uq
  on public.teacher_profile_ratings (teacher_id, guardian_id, student_id)
  where reviewer_kind = 'guardian';
create unique index teacher_profile_ratings_student_uq
  on public.teacher_profile_ratings (teacher_id, student_id)
  where reviewer_kind = 'student';

create trigger teacher_profile_ratings_updated_trg before update on public.teacher_profile_ratings
  for each row execute function public.set_updated_at();

alter table public.teacher_profile_ratings enable row level security;

-- القراءة للمالك وحده؛ لا تحديث ولا حذف له (الإخفاء عبر RPC)،
-- ولا إدخال مباشر لأي دور — الإدخال عبر RPCs البوابات فقط.
create policy teacher_profile_ratings_owner_select on public.teacher_profile_ratings
  for select using (public.is_teacher_owner(teacher_id));

revoke all on public.teacher_profile_ratings from public, anon, authenticated;
grant select on public.teacher_profile_ratings to authenticated;
grant all on public.teacher_profile_ratings to service_role;

-- ---------------------------------------------------------------------------
-- 5) مفتاح الخاصية personal_page: توسيع قيود account_overrides (v4)
--    (نفس نمط 0063/0069: إسقاط بالبحث عن التعريف ثم إعادة بأسماء v4 —
--    قيد النوع kind من 0069 لا يمسّه البحث ولا يُعاد)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select conname
      from pg_constraint
     where conrelid = 'public.account_overrides'::regclass
       and contype = 'c'
       and (pg_get_constraintdef(oid) like '%whatsapp_auto%'
            or pg_get_constraintdef(oid) like '%jsonb_typeof(value)%')
  loop
    execute format('alter table public.account_overrides drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.account_overrides
  add constraint account_overrides_key_check_v4
  check (key in (
    'whatsapp_auto', 'ai_assistant', 'team_accounts',
    'online_payments', 'personal_page',
    'verification_required',
    'verification_channel_email', 'verification_channel_whatsapp',
    'verification_channel_sms',
    'confirmation_required', 'confirmation_channel',
    'max_students', 'max_messages_month', 'max_storage_mb',
    'max_team_members', 'max_ai_messages_month'));

alter table public.account_overrides
  add constraint account_overrides_kind_key_check_v4
  check ((kind = 'feature' and key in (
            'whatsapp_auto', 'ai_assistant', 'team_accounts',
            'online_payments', 'personal_page',
            'verification_required',
            'verification_channel_email', 'verification_channel_whatsapp',
            'verification_channel_sms',
            'confirmation_required'))
      or (kind = 'limit' and key in (
            'max_students', 'max_messages_month', 'max_storage_mb',
            'max_team_members', 'max_ai_messages_month'))
      or (kind = 'setting' and key in ('confirmation_channel')));

alter table public.account_overrides
  add constraint account_overrides_value_check_v4
  check ((kind = 'feature' and value is not null
          and jsonb_typeof(value) = 'boolean')
      or (kind = 'limit'
          and (value is null or jsonb_typeof(value) = 'null'
               or (jsonb_typeof(value) = 'number'
                   and (value::text)::numeric >= 0
                   and (value::text)::numeric
                       = floor((value::text)::numeric))))
      or (kind = 'setting' and value is not null
          and jsonb_typeof(value) = 'string'
          and (value #>> '{}') in ('mobile', 'whatsapp', 'email')));

-- ---------------------------------------------------------------------------
-- 6) بوابة الاستحقاق الداخلية: باقة (pro/pilot) ⊕ أحدث تجاوز نشط
--    — داخلية فقط: لا تنفيذ لأي دور عميل (تستدعيها دوال definer)
-- ---------------------------------------------------------------------------
create or replace function public.teacher_has_personal_page(p_teacher_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_entitled boolean := false;
  v_row record;
begin
  select (s.plan_slug in ('pro', 'pilot')
          and s.status in ('active', 'trial'))
    into v_entitled
    from public.subscriptions s
   where s.teacher_id = p_teacher_id;

  v_entitled := coalesce(v_entitled, false);

  -- التجاوزات النشطة بترتيب الإنشاء: الأحدث يفوز (مرآة حلّ 0059/0063)
  for v_row in
    select value
      from public.account_overrides
     where teacher_id = p_teacher_id
       and kind = 'feature'
       and key = 'personal_page'
       and (expires_at is null or expires_at > now())
     order by created_at asc
  loop
    v_entitled := (v_row.value = 'true'::jsonb);
  end loop;

  return v_entitled;
end $$;

revoke execute on function public.teacher_has_personal_page(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) effective_entitlements: إعادة كتابة نسخة 0063 + بذرة باقة برو
--    (الخصائص الافتراضية للباقة تُزرع قبل التجاوزات — التجاوز يفوز)
-- ---------------------------------------------------------------------------
create or replace function public.effective_entitlements(p_teacher_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_plan_slug text;
  v_status text;
  v_trial_ends timestamptz;
  v_limits jsonb;
  v_features jsonb := '{}'::jsonb;
  v_settings jsonb := '{}'::jsonb;
  v_applied jsonb := '[]'::jsonb;
  v_row record;
begin
  -- الحارس يعمل أيضاً عند غياب الجلسة: بلا auth.uid() يرفض الكل.
  if not (public.is_teacher_owner(p_teacher_id)
          or public.is_platform_admin()) then
    raise exception 'not authorized';
  end if;

  -- نقطة البداية: اشتراك الحساب وباقة حدوده (منطق 0058 نفسه).
  select s.plan_slug, s.status, s.trial_ends_at, p.limits
    into v_plan_slug, v_status, v_trial_ends, v_limits
    from public.subscriptions s
    join public.plans p on p.slug = s.plan_slug
   where s.teacher_id = p_teacher_id;

  if not found then
    return null;
  end if;

  -- افتراضي الباقة (0074): الصفحة الشخصية من خصائص «برو» — باقة
  -- pro/pilot باشتراك حي تزرع personal_page=true؛ تجاوز الأدمن
  -- النشط (تفعيلاً أو إيقافاً) يفوز عليها في الحلقة التالية.
  if v_plan_slug in ('pro', 'pilot')
     and v_status in ('active', 'trial') then
    v_features := jsonb_set(v_features, array['personal_page'], 'true'::jsonb);
  end if;

  -- التجاوزات النشطة فقط: بلا انتهاء، أو انتهاؤها في المستقبل.
  -- المنتهية تاريخ صامت: لا أثر لها هنا إطلاقاً.
  for v_row in
    select kind, key, value
      from public.account_overrides
     where teacher_id = p_teacher_id
       and (expires_at is null or expires_at > now())
     order by created_at asc
  loop
    if v_row.kind = 'limit' then
      -- ملاحظة: jsonb_set بقيمة SQL NULL تحذف المفتاح بدل تعيينه —
      -- فالحد «بلا حد» يُكتب JSON null صريحاً ('null'::jsonb).
      v_limits := jsonb_set(v_limits, array[v_row.key],
                            coalesce(v_row.value, 'null'::jsonb));
    elsif v_row.kind = 'setting' then
      v_settings := jsonb_set(v_settings, array[v_row.key], v_row.value);
    else
      v_features := jsonb_set(v_features, array[v_row.key], v_row.value);
    end if;
    v_applied := v_applied || jsonb_build_array(v_row.kind || ':' || v_row.key);
  end loop;

  return jsonb_build_object(
    'teacher_id', p_teacher_id,
    'plan_slug', v_plan_slug,
    'status', v_status,
    'trial_ends_at', v_trial_ends,
    'limits', v_limits,
    'features', v_features,
    'settings', v_settings,
    'overrides_applied', v_applied
  );
end $$;

-- ---------------------------------------------------------------------------
-- 8) الحمولة العامة: public_teacher_profile(p_slug)
--    found=false بنفس الشكل للمجهول/المخفي/غير المستحق — لا تمييز.
--    الحقول خاصة-آمنة بالتصميم: لا هاتف ولا بريد ولا معرّف مدرّس.
-- ---------------------------------------------------------------------------
create or replace function public.public_teacher_profile(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.teacher_profiles;
  v_teacher public.teachers;
begin
  select * into v_profile
    from public.teacher_profiles
   where slug = p_slug;

  if not found or not v_profile.is_public
     or not public.teacher_has_personal_page(v_profile.teacher_id) then
    return jsonb_build_object('found', false);
  end if;

  select * into v_teacher from public.teachers where id = v_profile.teacher_id;

  return jsonb_build_object(
    'found', true,
    'teacher', jsonb_build_object(
      'display_name', v_teacher.display_name,
      'avatar_url', v_teacher.avatar_url,
      'headline', v_profile.headline,
      'bio', v_profile.bio,
      'cover_image_url', v_profile.cover_image_url,
      'slug', v_profile.slug
    ),
    'brand', (
      select jsonb_build_object(
        'name', ts.brand_name,
        'logo_path', ts.brand_logo_path,
        'accent', ts.brand_accent
      )
      from public.teacher_settings ts
      where ts.teacher_id = v_profile.teacher_id
    ),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'title', p.title, 'body', p.body,
        'created_at', p.created_at
      ) order by p.created_at desc)
      from public.teacher_profile_posts p
      where p.teacher_id = v_profile.teacher_id and p.is_published
    ), '[]'::jsonb),
    'articles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'description', c.description,
        'body', c.body, 'created_at', c.created_at
      ) order by c.sort_order, c.created_at desc)
      from public.teacher_profile_content c
      where c.teacher_id = v_profile.teacher_id
        and c.kind = 'article' and c.is_published
    ), '[]'::jsonb),
    'books', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'description', c.description,
        'external_url', c.external_url
      ) order by c.sort_order, c.created_at desc)
      from public.teacher_profile_content c
      where c.teacher_id = v_profile.teacher_id
        and c.kind = 'book' and c.is_published
    ), '[]'::jsonb),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'description', c.description,
        'external_url', c.external_url
      ) order by c.sort_order, c.created_at desc)
      from public.teacher_profile_content c
      where c.teacher_id = v_profile.teacher_id
        and c.kind = 'course' and c.is_published
    ), '[]'::jsonb),
    'playlists', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'description', c.description,
        'external_url', c.external_url
      ) order by c.sort_order, c.created_at desc)
      from public.teacher_profile_content c
      where c.teacher_id = v_profile.teacher_id
        and c.kind = 'playlist' and c.is_published
    ), '[]'::jsonb),
    'ratings', jsonb_build_object(
      'count', (select count(*) from public.teacher_profile_ratings r
                where r.teacher_id = v_profile.teacher_id and not r.is_hidden),
      'average', (select round(avg(r.stars)::numeric, 1)
                  from public.teacher_profile_ratings r
                  where r.teacher_id = v_profile.teacher_id and not r.is_hidden),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'stars', r.stars, 'comment', r.comment,
          'reviewer_kind', r.reviewer_kind,
          'student_name', s.name,
          'created_at', r.created_at
        ) order by r.created_at desc)
        from (
          select * from public.teacher_profile_ratings
          where teacher_id = v_profile.teacher_id and not is_hidden
          order by created_at desc limit 50
        ) r
        join public.students s on s.id = r.student_id
      ), '[]'::jsonb)
    ),
    'booking', jsonb_build_object(
      'available', exists (
        select 1 from public.enrolment_links l
        where l.teacher_id = v_profile.teacher_id and l.enabled
      )
    )
  );
end $$;

revoke execute on function public.public_teacher_profile(text) from public;
grant execute on function public.public_teacher_profile(text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9) الحجز عبر الصفحة: استخراج جسمي 0019 لدالتين داخليتين بالمعلّم،
--    وإعادة كتابة دالتي التوكن فوقهما بلا تغيير سلوكي، + دالتا السلاج
-- ---------------------------------------------------------------------------
create or replace function public.enrolment_page_for_teacher(p_teacher_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
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
      where t.id = p_teacher_id
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
      where g.teacher_id = p_teacher_id
        and g.archived_at is null
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.enrolment_page_for_teacher(uuid)
  from public, anon, authenticated;

create or replace function public.enrolment_submit_for_teacher(
  p_teacher_id uuid,
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
      and g.teacher_id = p_teacher_id
      and g.archived_at is null
  ) then
    raise exception 'invalid group';
  end if;

  -- حدود المعدل: نفس الرقم 3 طلبات/24 ساعة، والسنتر 30 طلباً/ساعة
  select count(*) into v_recent_phone
  from public.group_waitlist w
  where w.teacher_id = p_teacher_id
    and w.source = 'booking_page'
    and w.phone = v_phone
    and w.created_at > now() - interval '24 hours';
  if v_recent_phone >= 3 then
    raise exception 'too many requests';
  end if;

  select count(*) into v_recent_teacher
  from public.group_waitlist w
  where w.teacher_id = p_teacher_id
    and w.source = 'booking_page'
    and w.created_at > now() - interval '1 hour';
  if v_recent_teacher >= 30 then
    raise exception 'too many requests';
  end if;

  insert into public.group_waitlist (
    teacher_id, group_id, name, phone, note, source, wants_trial
  ) values (
    p_teacher_id, p_group_id, v_name, v_phone, v_note,
    'booking_page', coalesce(p_wants_trial, false)
  );

  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.enrolment_submit_for_teacher(uuid, text, text, uuid, boolean, text, text)
  from public, anon, authenticated;

-- دالتا التوكن القائمتان — نفس العقد والسلوك، تفويضاً للداخليتين
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
  return public.enrolment_page_for_teacher(r.teacher_id);
end $$;

grant execute on function public.enrolment_page_by_token(text) to anon, authenticated;

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
begin
  -- ترتيب 0019 حرفياً: الـ honeypot يُفحص قبل حلّ الرمز (نجاح وهمي
  -- صامت حتى برمز فاسد) — لا تغيير سلوكي في إعادة البناء هذه.
  if p_honeypot is not null and btrim(p_honeypot) <> '' then
    return jsonb_build_object('ok', true);
  end if;
  select * into r from public.enrolment_resolve_token(p_token);
  return public.enrolment_submit_for_teacher(
    r.teacher_id, p_student_name, p_guardian_phone, p_group_id,
    p_wants_trial, p_note, p_honeypot);
end $$;

grant execute on function public.enrolment_submit_by_token(text, text, text, uuid, boolean, text, text)
  to anon, authenticated;

-- محلّل السلاج الداخلي: صفحة عامة + مستحقة + رابط حجز مفعّل
create or replace function public.enrolment_resolve_profile(p_slug text)
returns table (teacher_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.teacher_profiles;
begin
  select * into v_profile
  from public.teacher_profiles
  where slug = p_slug;

  if not found or not v_profile.is_public
     or not public.teacher_has_personal_page(v_profile.teacher_id)
     or not exists (
       select 1 from public.enrolment_links l
       where l.teacher_id = v_profile.teacher_id and l.enabled
     ) then
    raise exception 'invalid or disabled link';
  end if;

  update public.enrolment_links
  set last_used_at = now()
  where enrolment_links.teacher_id = v_profile.teacher_id;

  return query select v_profile.teacher_id;
end $$;

revoke execute on function public.enrolment_resolve_profile(text)
  from public, anon, authenticated;

create or replace function public.enrolment_page_by_profile(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
begin
  select * into r from public.enrolment_resolve_profile(p_slug);
  return public.enrolment_page_for_teacher(r.teacher_id);
end $$;

grant execute on function public.enrolment_page_by_profile(text) to anon, authenticated;

create or replace function public.enrolment_submit_by_profile(
  p_slug text,
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
begin
  -- نفس ترتيب مسار التوكن: honeypot أولاً، ثم الحلّ، ثم الإرسال.
  if p_honeypot is not null and btrim(p_honeypot) <> '' then
    return jsonb_build_object('ok', true);
  end if;
  select * into r from public.enrolment_resolve_profile(p_slug);
  return public.enrolment_submit_for_teacher(
    r.teacher_id, p_student_name, p_guardian_phone, p_group_id,
    p_wants_trial, p_note, p_honeypot);
end $$;

grant execute on function public.enrolment_submit_by_profile(text, text, text, uuid, boolean, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10) إرسال التقييم من البوابتين — ربط حقيقي فقط + وحدة التقييم
-- ---------------------------------------------------------------------------
create or replace function public.submit_teacher_rating_guardian(
  p_token text,
  p_student_id uuid,
  p_stars int,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tok public.guardian_access_tokens;
  v_comment text;
  v_row public.teacher_profile_ratings;
begin
  -- المدقق الموحّد القائم (0042): رابط موقّع أو جلسة حساب ولي الأمر،
  -- ويفحص ربط ولي الأمر بهذا الطالب نفسه — بلا جلسة يرفض.
  v_tok := public.portal_validate_token(p_token, p_student_id);

  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'invalid stars';
  end if;

  v_comment := nullif(btrim(coalesce(p_comment, '')), '');
  if v_comment is not null and char_length(v_comment) > 1000 then
    raise exception 'comment too long';
  end if;

  -- الرابط الحقيقي: الطالب مسجّل فعلياً عند هذا المدرّس
  if not exists (
    select 1 from public.enrollments e
    where e.student_id = p_student_id
      and e.teacher_id = v_tok.teacher_id
  ) then
    raise exception 'not enrolled';
  end if;

  -- وحدة التقييم: صف واحد لكل (مدرّس، ولي أمر، طالب) — إعادة الإرسال
  -- تحدّث تقييمه هو.
  insert into public.teacher_profile_ratings (
    teacher_id, student_id, reviewer_kind, guardian_id, stars, comment
  ) values (
    v_tok.teacher_id, p_student_id, 'guardian', v_tok.guardian_id,
    p_stars, v_comment
  )
  on conflict (teacher_id, guardian_id, student_id)
    where reviewer_kind = 'guardian'
  do update set stars = excluded.stars,
                comment = excluded.comment
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id, 'stars', v_row.stars, 'comment', v_row.comment,
    'reviewer_kind', v_row.reviewer_kind, 'created_at', v_row.created_at);
end $$;

revoke execute on function public.submit_teacher_rating_guardian(text, uuid, int, text)
  from public;
grant execute on function public.submit_teacher_rating_guardian(text, uuid, int, text)
  to anon, authenticated;

create or replace function public.submit_teacher_rating_student(
  p_token text,
  p_stars int,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_res record;
  v_comment text;
  v_row public.teacher_profile_ratings;
begin
  -- محلّل بوابة الطالب القائم (0042): رابط موقّع أو جلسة حساب الطالب
  select * into v_res from public.student_portal_resolve_token(p_token);

  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'invalid stars';
  end if;

  v_comment := nullif(btrim(coalesce(p_comment, '')), '');
  if v_comment is not null and char_length(v_comment) > 1000 then
    raise exception 'comment too long';
  end if;

  if not exists (
    select 1 from public.enrollments e
    where e.student_id = v_res.student_id
      and e.teacher_id = v_res.teacher_id
  ) then
    raise exception 'not enrolled';
  end if;

  insert into public.teacher_profile_ratings (
    teacher_id, student_id, reviewer_kind, guardian_id, stars, comment
  ) values (
    v_res.teacher_id, v_res.student_id, 'student', null,
    p_stars, v_comment
  )
  on conflict (teacher_id, student_id)
    where reviewer_kind = 'student'
  do update set stars = excluded.stars,
                comment = excluded.comment
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id, 'stars', v_row.stars, 'comment', v_row.comment,
    'reviewer_kind', v_row.reviewer_kind, 'created_at', v_row.created_at);
end $$;

revoke execute on function public.submit_teacher_rating_student(text, int, text)
  from public;
grant execute on function public.submit_teacher_rating_student(text, int, text)
  to anon, authenticated;

-- قراءة التقييم الحالي للتهيئة (نفس حرّاس الإرسال)
create or replace function public.my_teacher_rating_guardian(
  p_token text,
  p_student_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tok public.guardian_access_tokens;
  v_row public.teacher_profile_ratings;
begin
  v_tok := public.portal_validate_token(p_token, p_student_id);

  select * into v_row
    from public.teacher_profile_ratings
   where teacher_id = v_tok.teacher_id
     and guardian_id = v_tok.guardian_id
     and student_id = p_student_id
     and reviewer_kind = 'guardian';

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'stars', v_row.stars, 'comment', v_row.comment,
    'created_at', v_row.created_at);
end $$;

revoke execute on function public.my_teacher_rating_guardian(text, uuid)
  from public;
grant execute on function public.my_teacher_rating_guardian(text, uuid)
  to anon, authenticated;

create or replace function public.my_teacher_rating_student(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_res record;
  v_row public.teacher_profile_ratings;
begin
  select * into v_res from public.student_portal_resolve_token(p_token);

  select * into v_row
    from public.teacher_profile_ratings
   where teacher_id = v_res.teacher_id
     and student_id = v_res.student_id
     and reviewer_kind = 'student';

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'stars', v_row.stars, 'comment', v_row.comment,
    'created_at', v_row.created_at);
end $$;

revoke execute on function public.my_teacher_rating_student(text)
  from public;
grant execute on function public.my_teacher_rating_student(text)
  to anon, authenticated;

-- إخفاء/إظهار تقييم — للمالك وحده، وبلا حذف ولا تعديل نص (إشراف آمن)
create or replace function public.set_teacher_rating_hidden(
  p_rating_id uuid,
  p_hidden boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.teacher_profile_ratings;
begin
  select * into v_row
    from public.teacher_profile_ratings
   where id = p_rating_id;

  if not found then
    raise exception 'rating not found';
  end if;

  if not public.is_teacher_owner(v_row.teacher_id) then
    raise exception 'not authorized';
  end if;

  update public.teacher_profile_ratings
     set is_hidden = coalesce(p_hidden, false)
   where id = p_rating_id
   returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'is_hidden', v_row.is_hidden);
end $$;

revoke execute on function public.set_teacher_rating_hidden(uuid, boolean)
  from public, anon;
grant execute on function public.set_teacher_rating_hidden(uuid, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 11) delete_my_teacher_account: إعادة إنشاء نسخة 0065 + جداول 0074
--     (قاعدة 0046: أي جدول جديد بـ teacher_id يُضاف هنا)
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_teacher_account()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_teacher public.teachers;
  v_email text;
  v_counts jsonb := '{}'::jsonb;
  v_storage_orphaned int := 0;
  v_n bigint;
  v_tables text[] := array[
    'teacher_members', 'teacher_settings', 'recurring_expenses',
    'groups', 'group_waitlist', 'students', 'student_notes',
    'enrollments', 'holidays', 'sessions', 'attendance',
    'invoices', 'invoice_lines', 'receipt_counters', 'payments',
    'expenses', 'assessments', 'assessment_questions', 'scores',
    'guardians', 'guardian_students', 'guardian_access_tokens',
    'daily_closings', 'payment_proofs', 'activity_log',
    'online_exams', 'online_exam_tokens', 'exam_attempts',
    'student_access_tokens', 'guardian_notifications',
    'push_subscriptions', 'push_delivery_log', 'push_digest_log',
    'at_risk_followups', 'enrolment_links', 'teacher_whatsapp_config',
    'portal_accounts', 'portal_sessions', 'teacher_whatsapp_templates',
    'whatsapp_message_log', 'assistant_runs', 'teacher_ai_keys',
    'guardian_notification_deliveries',
    'suppliers', 'purchases', 'purchase_lines', 'purchase_payments',
    'sales', 'sale_lines',
    'teacher_feedback', 'support_tickets',
    'teacher_profiles', 'teacher_profile_posts',
    'teacher_profile_content', 'teacher_profile_ratings'
  ];
  v_tbl text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_teacher
  from public.teachers
  where owner_user_id = v_uid;
  if not found then
    raise exception 'no teacher profile';
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email = 'demo@teacher-app.com' then
    raise exception 'demo account cannot be deleted';
  end if;

  select count(*) into v_storage_orphaned
  from storage.objects
  where bucket_id = 'payment-proofs'
    and name like v_teacher.id::text || '/%';

  foreach v_tbl in array v_tables loop
    execute format('select count(*) from public.%I where teacher_id = $1', v_tbl)
      using v_teacher.id into v_n;
    v_counts := v_counts || jsonb_build_object(v_tbl, v_n);
  end loop;

  delete from public.teachers where id = v_teacher.id;

  delete from auth.users where id = v_uid;

  return jsonb_build_object(
    'teacher_id', v_teacher.id,
    'deleted_tables', v_counts,
    'storage_objects_orphaned', v_storage_orphaned
  );
end $$;

revoke execute on function public.delete_my_teacher_account() from public;
revoke execute on function public.delete_my_teacher_account() from anon;
grant execute on function public.delete_my_teacher_account() to authenticated;

commit;

-- ============================================================================
-- نهاية 0074 — جداول جديدة: teacher_profiles, teacher_profile_posts,
-- teacher_profile_content, teacher_profile_ratings | دوال جديدة:
-- teacher_has_personal_page (داخلية), public_teacher_profile,
-- enrolment_page_for_teacher/enrolment_submit_for_teacher (داخليتان),
-- enrolment_resolve_profile (داخلية), enrolment_page_by_profile,
-- enrolment_submit_by_profile, submit_teacher_rating_guardian,
-- submit_teacher_rating_student, my_teacher_rating_guardian,
-- my_teacher_rating_student, set_teacher_rating_hidden |
-- معاد كتابتها: enrolment_page_by_token/enrolment_submit_by_token
-- (تفويض بلا تغيير سلوكي), effective_entitlements (بذرة برو 0074),
-- delete_my_teacher_account (نسخة 0065 + جداول 0074) |
-- قيود account_overrides بنسخ v4 (مفتاح personal_page).
-- ⚠️ غير مطبّقة على الإنتاج — التطبيق عند تجميد فيز 2 + بوابة QA فقط.
-- ============================================================================
