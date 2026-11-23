-- ===========================================================================
-- 0039 — الفرض الخادمي لأقسام البوابتين خارج العرض (3A-385 — ب من
-- التصميم): تصفية 0038 تحمي بيانات العرض، وهذه الهجرة توقف محاور
-- الكتابة/القراءة الجانبية عند إخفاء المدرس لقسمها:
-- • إثباتات الدفع (إنشاء + قائمة) ← قسم مال ولي الأمر.
-- • تنبيهات الوصول/المغادرة (قائمة + تعليم مقروء) واشتراك Push لولي
--   الأمر ← قسم حضور ولي الأمر (التنبيهات أحداث حضور).
-- • اشتراك Push للطالب ← قسم واجبات الطالب (تنبيهاته على نفس المحور).
-- الأجسام هي التعريفات الحية حرفياً (مستخرجة بـ pg_get_functiondef)
-- + كتلة فحص واحدة بعد سطر التحقق بالتوكن مباشرة؛ لا تغيير آخر.
-- الخطأ 'section disabled' آمن عام لا يكشف أي تفصيل.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.portal_create_payment_proof(p_token text, p_student_id uuid, p_amount numeric, p_method payment_method, p_file_ext text, p_invoice_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  tok public.guardian_access_tokens;
  v_teacher_id uuid;
  v_ext text;
  v_proof_id uuid := gen_random_uuid();
  v_path text;
begin
  tok := public.portal_validate_token(p_token, p_student_id);

  -- بوابة قسم (3A-385/0039): إخفاء المدرس لهذا القسم يوقف المحور خادميًا
  if not coalesce((select portal_guardian_show_money from public.teacher_settings where teacher_id = tok.teacher_id), true) then
    raise exception 'section disabled';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'invalid amount';
  end if;

  if p_method = 'cash' then
    raise exception 'invalid method for proof';
  end if;

  v_ext := lower(trim(coalesce(p_file_ext, '')));
  if v_ext = 'jpeg' then
    v_ext := 'jpg';
  end if;
  if v_ext not in ('jpg', 'png', 'webp') then
    raise exception 'invalid file type';
  end if;

  select teacher_id into v_teacher_id
  from public.students
  where id = p_student_id;

  if v_teacher_id is null or v_teacher_id <> tok.teacher_id then
    raise exception 'not authorized';
  end if;

  if p_invoice_id is not null and not exists (
    select 1 from public.invoices i
    where i.id = p_invoice_id
      and i.teacher_id = tok.teacher_id
      and i.student_id = p_student_id
  ) then
    raise exception 'invoice not valid for this student';
  end if;

  -- حد مضاد للإغراق: إثباتات معلّقة كثيرة لنفس الطالب بلا فائدة مشروعة
  if (select count(*) from public.payment_proofs
      where student_id = p_student_id and status = 'pending') >= 10 then
    raise exception 'too many pending proofs';
  end if;

  v_path := tok.teacher_id::text || '/' || v_proof_id::text || '.' || v_ext;

  insert into public.payment_proofs (
    id, teacher_id, guardian_id, student_id, invoice_id,
    amount, method, storage_path
  ) values (
    v_proof_id, tok.teacher_id, tok.guardian_id, p_student_id, p_invoice_id,
    p_amount, p_method, v_path
  );

  return jsonb_build_object(
    'proof_id', v_proof_id,
    'storage_path', v_path,
    'bucket', 'payment-proofs'
  );
end $function$;

CREATE OR REPLACE FUNCTION public.portal_list_payment_proofs(p_token text, p_student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  tok public.guardian_access_tokens;
begin
  tok := public.portal_validate_token(p_token, p_student_id);

  -- بوابة قسم (3A-385/0039): إخفاء المدرس لهذا القسم يوقف المحور خادميًا
  if not coalesce((select portal_guardian_show_money from public.teacher_settings where teacher_id = tok.teacher_id), true) then
    raise exception 'section disabled';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', pp.id,
      'amount', pp.amount,
      'method', pp.method,
      'status', pp.status,
      'rejection_reason', pp.rejection_reason,
      'created_at', pp.created_at,
      'reviewed_at', pp.reviewed_at
    ) order by pp.created_at desc)
    from public.payment_proofs pp
    where pp.student_id = p_student_id
      and pp.guardian_id = tok.guardian_id
      and pp.uploaded_at is not null
  ), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.portal_list_guardian_notifications(p_token text, p_student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  tok public.guardian_access_tokens;
begin
  tok := public.portal_validate_token(p_token, p_student_id);

  -- بوابة قسم (3A-385/0039): إخفاء المدرس لهذا القسم يوقف المحور خادميًا
  if not coalesce((select portal_guardian_show_attendance from public.teacher_settings where teacher_id = tok.teacher_id), true) then
    raise exception 'section disabled';
  end if;

  return jsonb_build_object(
    'unread_count', (
      select count(*) from public.guardian_notifications gn
      where gn.student_id = p_student_id and gn.read_at is null
    ),
    'notifications', coalesce((
      select jsonb_agg(t order by event_at desc)
      from (
        select jsonb_build_object(
          'id', gn.id,
          'kind', gn.kind,
          'event_at', gn.event_at,
          'read_at', gn.read_at,
          'session_date', se.session_date,
          'start_time', se.start_time,
          'group_name', g.name
        ) as t, gn.event_at
        from public.guardian_notifications gn
        join public.sessions se on se.id = gn.session_id
        join public.groups g on g.id = se.group_id
        where gn.student_id = p_student_id
          and gn.teacher_id = tok.teacher_id
        order by gn.event_at desc
        limit 30
      ) x
    ), '[]'::jsonb)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.portal_mark_notifications_read(p_token text, p_student_id uuid, p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  tok public.guardian_access_tokens;
  v_updated int;
begin
  tok := public.portal_validate_token(p_token, p_student_id);

  -- بوابة قسم (3A-385/0039): إخفاء المدرس لهذا القسم يوقف المحور خادميًا
  if not coalesce((select portal_guardian_show_attendance from public.teacher_settings where teacher_id = tok.teacher_id), true) then
    raise exception 'section disabled';
  end if;

  update public.guardian_notifications gn
  set read_at = now()
  where gn.student_id = p_student_id
    and gn.teacher_id = tok.teacher_id
    and gn.read_at is null
    and (p_ids is null or gn.id = any (p_ids));
  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'updated', v_updated,
    'unread_count', (
      select count(*) from public.guardian_notifications gn
      where gn.student_id = p_student_id and gn.read_at is null
    )
  );
end $function$;

CREATE OR REPLACE FUNCTION public.portal_push_subscribe(p_token text, p_student_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  tok public.guardian_access_tokens;
  v_id uuid;
begin
  tok := public.portal_validate_token(p_token, p_student_id);

  -- بوابة قسم (3A-385/0039): إخفاء المدرس لهذا القسم يوقف المحور خادميًا
  if not coalesce((select portal_guardian_show_attendance from public.teacher_settings where teacher_id = tok.teacher_id), true) then
    raise exception 'section disabled';
  end if;

  if p_endpoint is null or btrim(p_endpoint) = ''
     or p_p256dh is null or btrim(p_p256dh) = ''
     or p_auth is null or btrim(p_auth) = '' then
    raise exception 'invalid subscription';
  end if;

  insert into public.push_subscriptions (
    teacher_id, subscriber_kind, portal_token_id, guardian_id, student_id,
    endpoint, p256dh, auth, user_agent, is_active, disabled_at, disabled_reason
  ) values (
    tok.teacher_id, 'guardian', tok.id, tok.guardian_id, p_student_id,
    p_endpoint, p_p256dh, p_auth,
    nullif(left(coalesce(p_user_agent, ''), 300), ''),
    true, null, null
  )
  on conflict (endpoint) do update set
    teacher_id = excluded.teacher_id,
    subscriber_kind = excluded.subscriber_kind,
    user_id = null,
    portal_token_id = excluded.portal_token_id,
    guardian_id = excluded.guardian_id,
    student_id = excluded.student_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    is_active = true,
    disabled_at = null,
    disabled_reason = null
  returning id into v_id;

  return jsonb_build_object('subscribed', true, 'subscription_id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.student_portal_push_subscribe(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  r record;
  v_id uuid;
begin
  select * into r from public.student_portal_resolve_token(p_token);

  -- بوابة قسم (3A-385/0039): إخفاء المدرس لهذا القسم يوقف المحور خادميًا
  if not coalesce((select portal_student_show_homework from public.teacher_settings where teacher_id = r.teacher_id), true) then
    raise exception 'section disabled';
  end if;

  if p_endpoint is null or btrim(p_endpoint) = ''
     or p_p256dh is null or btrim(p_p256dh) = ''
     or p_auth is null or btrim(p_auth) = '' then
    raise exception 'invalid subscription';
  end if;

  insert into public.push_subscriptions (
    teacher_id, subscriber_kind, portal_token_id, guardian_id, student_id,
    endpoint, p256dh, auth, user_agent, is_active, disabled_at, disabled_reason
  ) values (
    r.teacher_id, 'student', r.token_id, null, r.student_id,
    p_endpoint, p_p256dh, p_auth,
    nullif(left(coalesce(p_user_agent, ''), 300), ''),
    true, null, null
  )
  on conflict (endpoint) do update set
    teacher_id = excluded.teacher_id,
    subscriber_kind = excluded.subscriber_kind,
    user_id = null,
    portal_token_id = excluded.portal_token_id,
    guardian_id = excluded.guardian_id,
    student_id = excluded.student_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    is_active = true,
    disabled_at = null,
    disabled_reason = null
  returning id into v_id;

  return jsonb_build_object('subscribed', true, 'subscription_id', v_id);
end $function$;
