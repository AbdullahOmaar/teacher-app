-- ===========================================================================
-- 0044 — تشديد الـ claim (3A-385 — من مراجعة الدفعة الذاتية): دالّتا
-- تعيين كلمة السر من داخل البوابة (0041) تتحققان عبر المدقق الموحد،
-- وبعد 0042 صار المدقق يقبل الجلسات أيضاً — فصار ممكناً نظرياً إعادة
-- ضبط كلمة السر بجلسة قائمة وحدها دون كلمة السر القديمة. المقصود
-- بالتصميم أن الـ claim امتياز الوصول بالرابط فقط (من يملك الرابط
-- الموقّع يبني حسابه)، وتغيير كلمة السر بالجلسة له طريقه الخاص
-- المحروس بالقديمة (portal_account_change_password). هذه الهجرة
-- تضيف فحصاً صريحاً قبل التحقق: التوكن يجب أن يكون رابطاً حياً في
-- جدول روابط البوابة نفسها، وإلا رفض عام. باقي الجسمين مطابق لـ 0041.
-- ===========================================================================

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
  -- رابط حي فقط — جلسة حساب لا تكفي للـ claim (انظر الترويسة)
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

  return jsonb_build_object('account_id', v_id, 'username', v_username);
end $$;

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
  -- رابط حي فقط — جلسة حساب لا تكفي للـ claim (انظر الترويسة)
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

  return jsonb_build_object('account_id', v_id, 'username', v_username);
end $$;
