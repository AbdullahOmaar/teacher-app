-- ===========================================================================
-- 0042 — التحقق الموحد: رابط التوكن أو جلسة الحساب (3A-385 — ج).
--
-- المدققان القائمان (portal_validate_token منذ 0005 و
-- student_portal_resolve_token منذ 0011) يبقيان مسار الرابط فيهما
-- حرفياً كما هو — الروابط الحية تعمل حتى انتهائها الطبيعي بلا أي
-- تغيير — ويُضاف بعده مسار بديل: إن لم يطابق التجزئة أي رابط، تُجرَّب
-- كتوكن جلسة من portal_sessions بنفس صرامة الفحوص (حساب نشط + دور
-- صحيح + ارتباط guardian_students لولي الأمر)، وتُعاد بنية بنفس شكل
-- صف التوكن حتى تعمل كل الدوال المستهلكة القائمة (إثباتات/تنبيهات/
-- Push/عرض) بجلسات الحسابات دون تعديل فيها.
--
-- في مسار الجلسة يعود id = معرّف الجلسة (لا يوجد FK على
-- push_subscriptions.portal_token_id — تحقق حي — فهو آمن هناك)،
-- و student_id = null في صف ولي الأمر (جلسة ولي الأمر ليست مقيدة
-- بطالب واحد — الارتباط يُفحص لكل طالب مطلوب كما في روابط ولي الأمر
-- غير المقيدة).
--
-- portal_overview_by_token (التي كانت تتحقق داخلها منذ 0002) تُعاد
-- كتابتها تفويضاً للمدقق الموحد فتسري عليها الجلسات أيضاً، وتبقى
-- صلاحياتها كما هي (replace يحفظ الـ ACL).
-- ===========================================================================

create or replace function public.portal_validate_token(p_token text, p_student_id uuid)
returns public.guardian_access_tokens
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.guardian_access_tokens;
  sess public.portal_sessions;
  acct public.portal_accounts;
  v_hash text := encode(digest(p_token, 'sha256'), 'hex');
begin
  -- مسار رابط التوكن — القائم منذ 0005 بلا تغيير
  select * into tok
  from public.guardian_access_tokens
  where token_hash = v_hash
    and revoked_at is null
    and expires_at > now();

  if found then
    if tok.student_id is not null and tok.student_id <> p_student_id then
      raise exception 'token not valid for this student';
    end if;

    if not exists (
      select 1 from public.guardian_students gs
      where gs.guardian_id = tok.guardian_id
        and gs.student_id = p_student_id
    ) then
      raise exception 'not authorized';
    end if;

    update public.guardian_access_tokens
    set last_used_at = now()
    where id = tok.id;

    return tok;
  end if;

  -- مسار جلسة حساب ولي الأمر (0040/0041) — نفس الفحوص على الهوية
  select * into sess
  from public.portal_sessions
  where token_hash = v_hash
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'invalid or expired token';
  end if;

  select * into acct from public.portal_accounts where id = sess.account_id;
  if not found or not acct.is_active or acct.role <> 'guardian' then
    raise exception 'invalid or expired token';
  end if;

  if not exists (
    select 1 from public.guardian_students gs
    where gs.guardian_id = acct.guardian_id
      and gs.student_id = p_student_id
  ) then
    raise exception 'not authorized';
  end if;

  update public.portal_sessions
  set last_used_at = now()
  where id = sess.id;

  tok.id := sess.id;
  tok.teacher_id := acct.teacher_id;
  tok.guardian_id := acct.guardian_id;
  tok.student_id := null;
  tok.token_hash := sess.token_hash;
  tok.expires_at := sess.expires_at;
  tok.revoked_at := null;
  tok.last_used_at := sess.last_used_at;
  tok.created_at := sess.created_at;
  return tok;
end $$;

create or replace function public.student_portal_resolve_token(p_token text)
returns table (token_id uuid, teacher_id uuid, student_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.student_access_tokens;
  sess public.portal_sessions;
  acct public.portal_accounts;
  v_hash text := encode(digest(p_token, 'sha256'), 'hex');
begin
  -- مسار رابط التوكن — القائم منذ 0011 بلا تغيير
  select * into tok
  from public.student_access_tokens
  where token_hash = v_hash
    and revoked_at is null
    and expires_at > now();

  if found then
    update public.student_access_tokens
    set last_used_at = now()
    where id = tok.id;

    return query select tok.id, tok.teacher_id, tok.student_id;
    return;
  end if;

  -- مسار جلسة حساب الطالب (0040/0041)
  select * into sess
  from public.portal_sessions
  where token_hash = v_hash
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'invalid or expired token';
  end if;

  select * into acct from public.portal_accounts where id = sess.account_id;
  if not found or not acct.is_active or acct.role <> 'student' then
    raise exception 'invalid or expired token';
  end if;

  update public.portal_sessions
  set last_used_at = now()
  where id = sess.id;

  return query select sess.id, acct.teacher_id, acct.student_id;
end $$;

create or replace function public.portal_overview_by_token(p_token text, p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.guardian_access_tokens;
begin
  tok := public.portal_validate_token(p_token, p_student_id);
  return public.portal_build_overview(p_student_id);
end $$;
