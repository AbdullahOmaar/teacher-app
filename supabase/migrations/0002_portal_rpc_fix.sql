-- ============================================================================
-- تطبيق المدرس — 0002_portal_rpc_fix.sql
-- إصلاحات ضرورية لبوابة ولي الأمر (خطوة 9) على دالّتين من 0001:
--
-- 1) portal_overview_by_token كانت مكسورة وقت التشغيل على Supabase:
--    جسمها يستدعي digest() من pgcrypto، وpgcrypto مثبّتة في schema
--    «extensions» بينما الدالة مضبوطة بـ search_path = public فقط،
--    فأي استدعاء فعلي كان يفشل بـ «function digest(text, unknown)
--    does not exist» (42883). الإصلاح: نفس الجسم حرفياً مع توسيع
--    search_path ليشمل extensions. لا تغيير في المنطق أو الحقول.
--
-- 2) portal_build_overview (بانٍ داخلي security definer بلا أي تحقق)
--    كانت قابلة للتنفيذ من anon/authenticated بمنح صريح من Supabase
--    رغم revoke ... from public في 0001 — أي أن أي شخص معه معرّف طالب
--    كان يقدر يقرأ عرضه كاملاً بلا توكن. الإصلاح: سحب EXECUTE من
--    anon وauthenticated. الاستدعاءات الداخلية من الدالّتين
--    security definer الأخريين تعمل بصلاحيات المالك (postgres) فلا
--    تتأثر، وservice_role تبقى كما هي.
-- ============================================================================

create or replace function public.portal_overview_by_token(p_token text, p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok record;
begin
  select * into tok
  from public.guardian_access_tokens
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'invalid or expired token';
  end if;

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

  return public.portal_build_overview(p_student_id);
end $$;

revoke execute on function public.portal_build_overview(uuid) from anon, authenticated;
