-- ===========================================================================
-- 0055 — إكمال حسابات البوابات (المهمة 20 من موجة 6 — 3A-895): الفجوتان
-- الباقيتان بعد 3A-385 (0040–0044):
--
-- 1) دخول الطالب برقم الموبايل: اسم دخول الطالب كان كوده العام فقط،
--    وتوجيه المالك أن الحسابات برقم الموبايل لولي الأمر والطالب معاً.
--    portal_login (نسخة 0043 حرفياً + توسيع المرشحين) يقبل الآن أيضاً
--    حسابَ الطالب الذي يطابق هاتفه المسجل (students.phone) الرقمَ
--    المطبّع المدخَل — اسم دخول بديلاً يُحلّ وقت الدخول، بلا أي تغيير
--    مخطط وبلا عمود جديد: اسم الدخول الأساسي يبقى الكود، والهاتف يُقارن
--    مطبّعاً بـ portal_norm_phone على الجانبين. نفس حمايات 0041/0043
--    تسري على المسار الجديد: حسابات نشطة فقط، تطابق أكثر من حساب بنفس
--    كلمة السر = خطأ «multiple accounts match» التوجيهي، وعدّاد الفشل
--    والقفل 15 دقيقة بعد 8 محاولات يشمل مرشحي الهاتف أيضاً. بوابة طول
--    (10 أرقام على الأقل) حتى لا يلتقط المسارُ مدخلاتٍ قصيرة شبيهة
--    بالأكواد.
--
-- 2) الرابط وسيلة دعوة/أول دخول فعلياً: دالّتا الـ claim (نسختا 0044
--    حرفياً + خطوة أخيرة) تُبطلان الرابطَ المستعمل نفسه فور نجاح تعيين
--    كلمة السر وتفتحان جلسة حساب تعود للعميل، فيكمل التصفح بالجلسة —
--    الرابط صار حرفياً أول دخول فقط. لا فقدان بيانات: الإشعارات
--    والنتائج والمستحقات مربوطة بولي الأمر/الطالب لا بالتوكن، والروابط
--    الأخرى غير المستعملة في الـ claim لا تُمس (ترحيل تدريجي).
--    فتح الجلسة معزول في portal_issue_session الداخلية (مسحوبة من
--    الجميع) وتستعملها الدالّتان والدخول معاً.
--
-- ⚠️ هجرة كود فقط — لا تُطبَّق على الإنتاج بقاعدة تجميد الفيز؛
-- التطبيق عند بوابة تجميد فيز 2 + QA.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- داخلي: فتح جلسة لحساب وبناء حمولة الدخول (نفس شكل رد portal_login
-- منذ 0041). يرفض الحساب الغائب/المعطّل بخطأ التوكن العام نفسه.
-- ---------------------------------------------------------------------------
create or replace function public.portal_issue_session(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  acct public.portal_accounts;
  v_raw text;
  v_students jsonb;
begin
  select * into acct from public.portal_accounts where id = p_account_id;
  if not found or not acct.is_active then
    raise exception 'invalid or expired token';
  end if;

  v_raw := translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.portal_sessions (
    account_id, teacher_id, token_hash, expires_at
  ) values (
    acct.id,
    acct.teacher_id,
    encode(digest(v_raw, 'sha256'), 'hex'),
    now() + interval '90 days'
  );

  if acct.role = 'guardian' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'code', s.public_code
    ) order by s.name), '[]'::jsonb)
    into v_students
    from public.guardian_students gs
    join public.students s on s.id = gs.student_id
    where gs.guardian_id = acct.guardian_id;
  else
    select jsonb_build_array(jsonb_build_object(
      'id', s.id, 'name', s.name, 'code', s.public_code
    ))
    into v_students
    from public.students s
    where s.id = acct.student_id;
  end if;

  return jsonb_build_object(
    'session_token', v_raw,
    'role', acct.role,
    'username', acct.username,
    'teacher_id', acct.teacher_id,
    'student_id', acct.student_id,
    'students', coalesce(v_students, '[]'::jsonb)
  );
end $$;

revoke execute on function public.portal_issue_session(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- الدخول العام — جسم 0043 حرفياً مع توسيع واحد: مجموعة المرشحين تشمل
-- أيضاً حسابات الطلاب المطابقة بالهاتف المسجل (انظر الترويسة)، في
-- حلقة المطابقة وفي تحديث عدّاد الفشل معاً. فتح الجلسة صار عبر
-- portal_issue_session (نفس الحمولة حرفياً).
-- ---------------------------------------------------------------------------
create or replace function public.portal_login(
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_phone text := public.portal_norm_phone(p_username);
  v_code text := upper(btrim(coalesce(p_username, '')));
  v_match public.portal_accounts;
  v_match_count int := 0;
  cand public.portal_accounts;
begin
  if p_password is null or length(p_password) = 0 then
    return jsonb_build_object('error', 'invalid credentials');
  end if;

  for cand in
    select * from public.portal_accounts
    where is_active
      and (
        username = v_phone
        or username = v_code
        or (
          role = 'student'
          and length(v_phone) >= 10
          and exists (
            select 1 from public.students s
            where s.id = portal_accounts.student_id
              and public.portal_norm_phone(s.phone) = v_phone
          )
        )
      )
    limit 10
  loop
    if cand.locked_until is not null and cand.locked_until > now() then
      continue;
    end if;
    if crypt(p_password, cand.password_hash) = cand.password_hash then
      v_match := cand;
      v_match_count := v_match_count + 1;
    end if;
  end loop;

  if v_match_count = 0 then
    -- عدّاد فشل على كل الحسابات النشطة المرشحة (باسم الدخول أو بهاتف
    -- الطالب) وقفل 15 دقيقة عند بلوغ 8 محاولات متراكمة — التحديث يسبق
    -- الإرجاع ولا يتبعه أي رفع (إصلاح 0043).
    update public.portal_accounts
    set failed_attempts = failed_attempts + 1,
        locked_until = case
          when failed_attempts + 1 >= 8 then now() + interval '15 minutes'
          else locked_until
        end,
        updated_at = now()
    where is_active
      and (
        username = v_phone
        or username = v_code
        or (
          role = 'student'
          and length(v_phone) >= 10
          and exists (
            select 1 from public.students s
            where s.id = portal_accounts.student_id
              and public.portal_norm_phone(s.phone) = v_phone
          )
        )
      )
      and (locked_until is null or locked_until <= now());
    return jsonb_build_object('error', 'invalid credentials');
  end if;

  if v_match_count > 1 then
    return jsonb_build_object('error', 'multiple accounts match');
  end if;

  update public.portal_accounts
  set failed_attempts = 0,
      locked_until = null,
      last_login_at = now(),
      updated_at = now()
  where id = v_match.id;

  return public.portal_issue_session(v_match.id);
end $$;

-- ---------------------------------------------------------------------------
-- claim ولي الأمر — جسم 0044 حرفياً + الخطوة الأخيرة: إبطال الرابط
-- المستعمل وفتح جلسة حساب (انظر الترويسة).
-- ---------------------------------------------------------------------------
create or replace function public.portal_account_claim_guardian(
  p_token text,
  p_student_id uuid,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.guardian_access_tokens;
  v_username text;
  v_id uuid;
begin
  -- رابط حي فقط — جلسة حساب لا تكفي للـ claim (0044)
  if not exists (
    select 1 from public.guardian_access_tokens
    where token_hash = encode(digest(p_token, 'sha256'), 'hex')
      and revoked_at is null
      and expires_at > now()
  ) then
    raise exception 'invalid or expired token';
  end if;

  tok := public.portal_validate_token(p_token, p_student_id);

  select public.portal_norm_phone(g.phone) into v_username
  from public.guardians g
  where g.id = tok.guardian_id;
  if v_username is null or v_username = '' then
    raise exception 'guardian has no phone';
  end if;

  v_id := public.portal_account_apply_password(
    tok.teacher_id, 'guardian', null, tok.guardian_id, v_username, p_password
  );

  -- الرابط أدى دوره (أول دخول): يُبطَل، والتصفح يكمل بجلسة الحساب
  update public.guardian_access_tokens
  set revoked_at = now()
  where id = tok.id and revoked_at is null;

  return public.portal_issue_session(v_id)
    || jsonb_build_object('account_id', v_id);
end $$;

-- ---------------------------------------------------------------------------
-- claim الطالب — جسم 0044 حرفياً + نفس الخطوة الأخيرة.
-- ---------------------------------------------------------------------------
create or replace function public.portal_account_claim_student(
  p_token text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_username text;
  v_id uuid;
begin
  -- رابط حي فقط — جلسة حساب لا تكفي للـ claim (0044)
  if not exists (
    select 1 from public.student_access_tokens
    where token_hash = encode(digest(p_token, 'sha256'), 'hex')
      and revoked_at is null
      and expires_at > now()
  ) then
    raise exception 'invalid or expired token';
  end if;

  select * into r from public.student_portal_resolve_token(p_token);

  select upper(s.public_code) into v_username
  from public.students s
  where s.id = r.student_id;
  if v_username is null or v_username = '' then
    raise exception 'student not found';
  end if;

  v_id := public.portal_account_apply_password(
    r.teacher_id, 'student', r.student_id, null, v_username, p_password
  );

  -- الرابط أدى دوره (أول دخول): يُبطَل، والتصفح يكمل بجلسة الحساب
  update public.student_access_tokens
  set revoked_at = now()
  where id = r.token_id and revoked_at is null;

  return public.portal_issue_session(v_id)
    || jsonb_build_object('account_id', v_id);
end $$;
