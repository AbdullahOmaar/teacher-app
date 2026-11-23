-- ===========================================================================
-- 0041 — دوال حسابات دخول البوابات (3A-385 — ج من التصميم).
--
-- نموذج الأمان:
-- • كلمات السر bcrypt (pgcrypto) — تُهشّ وتُتحقق خادمياً فقط داخل هذه
--   الدوال؛ لا تصل لأي عميل ولا تُقرأ من أي جدول مباشرة في التطبيق.
-- • إدارة المدرس (upsert/set_active/revoke_sessions) محروسة بـ
--   is_teacher_owner على مدرس الحساب — والحارس يعمل أيضاً عند غياب
--   auth.uid() (يرفض). اسم الدخول يُشتق خادمياً من هاتف ولي الأمر /
--   كود الطالب فلا يمكن انتحال اسم دخول لشخص آخر.
-- • الدخول العام (portal_login): خطأ عام واحد لكل فشل، عدّاد محاولات
--   وقفل 15 دقيقة بعد 8 فشلات على الحسابات حاملة اسم الدخول، وتوكن
--   الجلسة عشوائي 32 بايت يُخزن SHA-256 فقط ويُعاد خاماً مرة واحدة.
-- • الدوال الداخلية (تطبيع/تطبيق كلمة سر/حلّ جلسة) مسحوبة من الجميع
--   ولا تُستدعى إلا من دوال security definer أخرى.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- داخلي: تطبيع هاتف لاسم دخول — أرقام فقط، والبادئة الدولية المصرية
-- (20 أو 0020) تُرجع للصيغة المحلية 0.
-- ---------------------------------------------------------------------------
create or replace function public.portal_norm_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if left(d, 4) = '0020' then
    d := '0' || substr(d, 5);
  elsif left(d, 2) = '20' and length(d) = 12 then
    d := '0' || substr(d, 3);
  end if;
  return d;
end $$;

revoke execute on function public.portal_norm_phone(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- داخلي: تطبيق كلمة سر على حساب (إنشاء أو إعادة ضبط) — نقطة الهشّ
-- الوحيدة. يتحقق من تطابق الهدف القائم عند التصادم على (teacher,
-- username) حتى لا يبتلع حسابٌ حساباً آخر باسم دخول متطابق الشكل.
-- ---------------------------------------------------------------------------
create or replace function public.portal_account_apply_password(
  p_teacher_id uuid,
  p_role text,
  p_student_id uuid,
  p_guardian_id uuid,
  p_username text,
  p_password text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_existing public.portal_accounts;
  v_id uuid;
begin
  if p_password is null or length(p_password) < 6 or length(p_password) > 72 then
    raise exception 'invalid password length';
  end if;

  select * into v_existing
  from public.portal_accounts
  where teacher_id = p_teacher_id and username = p_username;

  if found then
    if v_existing.role <> p_role
       or v_existing.student_id is distinct from p_student_id
       or v_existing.guardian_id is distinct from p_guardian_id then
      raise exception 'username conflict';
    end if;
    update public.portal_accounts
    set password_hash = crypt(p_password, gen_salt('bf', 10)),
        is_active = true,
        failed_attempts = 0,
        locked_until = null,
        updated_at = now()
    where id = v_existing.id
    returning id into v_id;
    return v_id;
  end if;

  insert into public.portal_accounts (
    teacher_id, student_id, guardian_id, role, username, password_hash
  ) values (
    p_teacher_id, p_student_id, p_guardian_id, p_role, p_username,
    crypt(p_password, gen_salt('bf', 10))
  )
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.portal_account_apply_password(uuid, text, uuid, uuid, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- داخلي: حلّ توكن جلسة إلى حسابها — يتحقق من عدم الإبطال/الانتهاء
-- ونشاط الحساب، ويسجّل آخر استخدام. خطأ واحد آمن لكل الحالات.
-- ---------------------------------------------------------------------------
create or replace function public.portal_resolve_session_account(p_session_token text)
returns public.portal_accounts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sess public.portal_sessions;
  acct public.portal_accounts;
begin
  select * into sess
  from public.portal_sessions
  where token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'invalid or expired token';
  end if;

  select * into acct from public.portal_accounts where id = sess.account_id;
  if not found or not acct.is_active then
    raise exception 'invalid or expired token';
  end if;

  update public.portal_sessions set last_used_at = now() where id = sess.id;
  return acct;
end $$;

revoke execute on function public.portal_resolve_session_account(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- جهة المدرس: إنشاء حساب أو إعادة ضبط كلمة سره. p_target_id هو
-- guardian_id لدور ولي الأمر و student_id لدور الطالب — واسم الدخول
-- يُشتق هنا من الهاتف/الكود خادمياً.
-- ---------------------------------------------------------------------------
create or replace function public.portal_account_upsert(
  p_teacher_id uuid,
  p_role text,
  p_target_id uuid,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text;
  v_student_id uuid;
  v_guardian_id uuid;
  v_id uuid;
begin
  if not public.is_teacher_owner(p_teacher_id) then
    raise exception 'not authorized';
  end if;

  if p_role = 'guardian' then
    select public.portal_norm_phone(g.phone) into v_username
    from public.guardians g
    where g.id = p_target_id and g.teacher_id = p_teacher_id;
    if v_username is null or v_username = '' then
      raise exception 'guardian not found or has no phone';
    end if;
    v_guardian_id := p_target_id;
  elsif p_role = 'student' then
    select upper(s.public_code) into v_username
    from public.students s
    where s.id = p_target_id and s.teacher_id = p_teacher_id;
    if v_username is null or v_username = '' then
      raise exception 'student not found';
    end if;
    v_student_id := p_target_id;
  else
    raise exception 'invalid role';
  end if;

  v_id := public.portal_account_apply_password(
    p_teacher_id, p_role, v_student_id, v_guardian_id, v_username, p_password
  );

  return jsonb_build_object(
    'account_id', v_id,
    'username', v_username,
    'role', p_role
  );
end $$;

revoke execute on function public.portal_account_upsert(uuid, text, uuid, text) from public, anon;
grant execute on function public.portal_account_upsert(uuid, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- جهة المدرس: تفعيل/تعطيل حساب — التعطيل يبطل كل جلساته فوراً.
-- ---------------------------------------------------------------------------
create or replace function public.portal_account_set_active(
  p_account_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  acct public.portal_accounts;
begin
  select * into acct from public.portal_accounts where id = p_account_id;
  if not found then
    raise exception 'account not found';
  end if;
  if not public.is_teacher_owner(acct.teacher_id) then
    raise exception 'not authorized';
  end if;

  update public.portal_accounts
  set is_active = p_active, updated_at = now()
  where id = p_account_id;

  if not p_active then
    update public.portal_sessions
    set revoked_at = now()
    where account_id = p_account_id and revoked_at is null;
  end if;

  return jsonb_build_object('account_id', p_account_id, 'is_active', p_active);
end $$;

revoke execute on function public.portal_account_set_active(uuid, boolean) from public, anon;
grant execute on function public.portal_account_set_active(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- جهة المدرس: إبطال كل جلسات حساب (تسجيل خروج من كل الأجهزة).
-- ---------------------------------------------------------------------------
create or replace function public.portal_account_revoke_sessions(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  acct public.portal_accounts;
  v_count int;
begin
  select * into acct from public.portal_accounts where id = p_account_id;
  if not found then
    raise exception 'account not found';
  end if;
  if not public.is_teacher_owner(acct.teacher_id) then
    raise exception 'not authorized';
  end if;

  update public.portal_sessions
  set revoked_at = now()
  where account_id = p_account_id and revoked_at is null;
  get diagnostics v_count = row_count;

  return jsonb_build_object('revoked', v_count);
end $$;

revoke execute on function public.portal_account_revoke_sessions(uuid) from public, anon;
grant execute on function public.portal_account_revoke_sessions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- الدخول العام: اسم دخول + كلمة سر ← جلسة 90 يوماً.
-- اسم الدخول يُطابَق بصيغتيه المطبّعتين (هاتف/كود) عبر كل المدرسين؛
-- تطابق أكثر من حساب واحد بنفس كلمة السر = خطأ توجيهي موثق (استخدم
-- رابطك) بدل اختيار اعتباطي بين مستأجرين.
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
  v_raw text;
  v_students jsonb;
begin
  if p_password is null or length(p_password) = 0 then
    raise exception 'invalid credentials';
  end if;

  for cand in
    select * from public.portal_accounts
    where is_active
      and (username = v_phone or username = v_code)
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
    -- عدّاد فشل على كل الحسابات النشطة حاملة اسم الدخول (لا نعرف أيّها
    -- كان المقصود) وقفل 15 دقيقة عند بلوغ 8 محاولات متراكمة.
    update public.portal_accounts
    set failed_attempts = failed_attempts + 1,
        locked_until = case
          when failed_attempts + 1 >= 8 then now() + interval '15 minutes'
          else locked_until
        end,
        updated_at = now()
    where is_active
      and (username = v_phone or username = v_code)
      and (locked_until is null or locked_until <= now());
    raise exception 'invalid credentials';
  end if;

  if v_match_count > 1 then
    raise exception 'multiple accounts match';
  end if;

  update public.portal_accounts
  set failed_attempts = 0,
      locked_until = null,
      last_login_at = now(),
      updated_at = now()
  where id = v_match.id;

  v_raw := translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.portal_sessions (
    account_id, teacher_id, token_hash, expires_at
  ) values (
    v_match.id,
    v_match.teacher_id,
    encode(digest(v_raw, 'sha256'), 'hex'),
    now() + interval '90 days'
  );

  if v_match.role = 'guardian' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'code', s.public_code
    ) order by s.name), '[]'::jsonb)
    into v_students
    from public.guardian_students gs
    join public.students s on s.id = gs.student_id
    where gs.guardian_id = v_match.guardian_id;
  else
    select jsonb_build_array(jsonb_build_object(
      'id', s.id, 'name', s.name, 'code', s.public_code
    ))
    into v_students
    from public.students s
    where s.id = v_match.student_id;
  end if;

  return jsonb_build_object(
    'session_token', v_raw,
    'role', v_match.role,
    'username', v_match.username,
    'teacher_id', v_match.teacher_id,
    'student_id', v_match.student_id,
    'students', coalesce(v_students, '[]'::jsonb)
  );
end $$;

grant execute on function public.portal_login(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- طلاب جلسة قائمة (لإعادة فتح البوابة من جهاز سجّل دخوله سابقاً).
-- ---------------------------------------------------------------------------
create or replace function public.portal_session_students(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  acct public.portal_accounts;
  v_students jsonb;
begin
  acct := public.portal_resolve_session_account(p_session_token);

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
    'role', acct.role,
    'username', acct.username,
    'teacher_id', acct.teacher_id,
    'student_id', acct.student_id,
    'students', coalesce(v_students, '[]'::jsonb)
  );
end $$;

grant execute on function public.portal_session_students(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- خروج: إبطال الجلسة الحاملة للتوكن — صامت حتى عند عدم الوجود (لا
-- أوراكل على صلاحية التوكنات).
-- ---------------------------------------------------------------------------
create or replace function public.portal_logout(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.portal_sessions
  set revoked_at = now()
  where token_hash = encode(digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
    and revoked_at is null;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.portal_logout(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- إنشاء كلمة سر من داخل بوابة ولي الأمر عند الوصول برابط صالح (claim):
-- التحقق بالرابط نفسه عبر المدقق الموحد، والحساب يُبنى لهاتف وليّ
-- صاحب الرابط حصراً.
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

  return jsonb_build_object('account_id', v_id, 'username', v_username);
end $$;

grant execute on function public.portal_account_claim_guardian(text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- إنشاء كلمة سر من داخل بوابة الطالب عند الوصول برابط صالح (claim).
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

  return jsonb_build_object('account_id', v_id, 'username', v_username);
end $$;

grant execute on function public.portal_account_claim_student(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- تغيير كلمة السر من داخل البوابة بجلسة قائمة: تحقق من القديمة،
-- وإبطال باقي جلسات الحساب (الجلسة الحالية تبقى).
-- ---------------------------------------------------------------------------
create or replace function public.portal_account_change_password(
  p_session_token text,
  p_old_password text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  acct public.portal_accounts;
  v_hash text := encode(digest(p_session_token, 'sha256'), 'hex');
begin
  acct := public.portal_resolve_session_account(p_session_token);

  if crypt(coalesce(p_old_password, ''), acct.password_hash) <> acct.password_hash then
    raise exception 'invalid credentials';
  end if;

  if p_new_password is null or length(p_new_password) < 6 or length(p_new_password) > 72 then
    raise exception 'invalid password length';
  end if;

  update public.portal_accounts
  set password_hash = crypt(p_new_password, gen_salt('bf', 10)),
      updated_at = now()
  where id = acct.id;

  update public.portal_sessions
  set revoked_at = now()
  where account_id = acct.id
    and revoked_at is null
    and token_hash <> v_hash;

  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.portal_account_change_password(text, text, text) to anon, authenticated;
