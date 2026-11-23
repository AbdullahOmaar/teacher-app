-- ===========================================================================
-- 0043 — إصلاح عدّاد فشل الدخول في portal_login (3A-385 — وجدته
-- اختبارات التفويض الحية): نسخة 0041 كانت ترفع 'invalid credentials'
-- بعد تحديث failed_attempts/locked_until داخل نفس المعاملة، فالرفع
-- يلغي التحديث كله (ذرّية الدالة) والعدّاد لا يتراكم أبداً والقفل
-- لا يحدث. الإصلاح: فشل الاعتماد لا يُرفع كاستثناء بل يعود ككائن
-- خطأ داخل النطاق {error: '...'} بعد تنفيذ تحديث العدّاد، فتُحفظ
-- المعاملة؛ وعميل البوابة يحوّل كائن الخطأ لاستثناء بنفس الرسالة
-- العامة حرفياً — لا أوراكل ولا تغيير في تجربة الاستخدام.
-- باقي الجسم مطابق لـ 0041 حرفياً.
-- ===========================================================================

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
    return jsonb_build_object('error', 'invalid credentials');
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
    -- كان المقصود) وقفل 15 دقيقة عند بلوغ 8 محاولات متراكمة. التحديث
    -- يسبق الإرجاع ولا يتبعه أي رفع — انظر ترويسة الهجرة.
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
