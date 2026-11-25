-- ============================================================================
-- 0049 — مفتاح مزوّد الذكاء لكل مدرّس (BYOK — قرار المالك ق5، 2026-11-25)
-- ----------------------------------------------------------------------------
-- قرار ق5 (المالك عبر المدير بوس، 2026-11-25 ~02:16 EET): لا مفاتيح مركزية
-- على حساب المنصة — المدرّس يضيف مفتاحه هو من إعدادات الأدمن، والمساعد
-- المنفّذ (0048) يشتغل بمفتاح المدرّس نفسه.
--
-- • teacher_ai_keys: صف واحد لكل مدرّس (provider + نموذج اختياري +
--   base_url اختياري للمزوّدات المتوافقة مع OpenAI + المفتاح **مشفّراً
--   فقط**). التشفير AES-GCM يحدث خادمياً داخل دالة Edge ‏assistant-chat
--   بمفتاح تشفير منصة من بيئتها (ASSISTANT_KEY_ENCRYPTION_KEY — الاسم
--   فقط هنا؛ القيمة لا توجد في القاعدة ولا في الكود إطلاقاً).
-- • صفر وصول من العميل: RLS مفعّل بلا أي سياسة، وكل المنح مسحوبة من
--   public/anon/authenticated — لا قراءة ولا كتابة عبر REST إطلاقاً.
--   الوصول الوحيد عبر دوال RPC ‏security definer بحرّاس تفويض:
--   - الحفظ/الحالة/الحذف: مالك السنتر فقط (is_teacher_owner) — نفس
--     مستوى صلاحيات الإعدادات المالية.
--   - قراءة النص المشفّر: مالك أو عضو نشط (assistant_actor_role من
--     0048) — لأن دالة Edge تعمل بهوية المستدعي دائماً فتقرأ المفتاح
--     بتوكن العضو نفسه عند محادثته. النص المشفّر وحده بلا قيمة: فكّه
--     يتطلب مفتاح التشفير الموجود في بيئة الدالة فقط.
-- • المفتاح الصريح لا يمر بهذه المهاجرة ولا بأي RPC: العميل يرسله مرة
--   واحدة لدالة Edge (HTTPS)، والدالة تشفّره وتمرّر النص المشفّر هنا.
--   لا توجد أي دالة تُرجع المفتاح الصريح — بعد الحفظ لا يخرج لأي عميل.
-- • teacher_ai_keys يُضاف لقائمة جداول delete_my_teacher_account
--   (إعادة إنشاء الدالة بنسخة 0048 + الجدول الجديد — قاعدة 0046).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) جدول مفتاح المزوّد لكل مدرّس (النص المشفّر فقط)
-- ---------------------------------------------------------------------------
create table public.teacher_ai_keys (
  teacher_id     uuid primary key references public.teachers (id) on delete cascade,
  provider       text not null check (provider in (
                   'openai', 'anthropic', 'gemini', 'openai_compatible')),
  model          text,
  base_url       text,
  key_ciphertext text not null,
  key_iv         text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.teacher_ai_keys enable row level security;

-- لا سياسات إطلاقاً: RLS بلا سياسة = رفض كامل لأي وصول عبر REST،
-- والمنح نفسها مسحوبة أصلاً (الدفاع طبقتان).
revoke all on public.teacher_ai_keys from public, anon, authenticated;
grant all on public.teacher_ai_keys to service_role;

create trigger teacher_ai_keys_updated_trg
  before update on public.teacher_ai_keys
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) حفظ/استبدال المفتاح المشفّر (المالك فقط) — يستقبل النص المشفّر من
--    دالة Edge، ولا يرى المفتاح الصريح أبداً.
-- ---------------------------------------------------------------------------
create or replace function public.assistant_save_provider_key(
  p_teacher_id uuid,
  p_provider text,
  p_model text,
  p_base_url text,
  p_ciphertext text,
  p_iv text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.teacher_ai_keys;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_teacher_owner(p_teacher_id) then
    raise exception 'only the centre owner can manage the provider key';
  end if;
  if p_provider not in ('openai', 'anthropic', 'gemini', 'openai_compatible') then
    raise exception 'unsupported provider';
  end if;
  if p_ciphertext is null or length(p_ciphertext) < 16 or length(p_ciphertext) > 8192
     or p_iv is null or length(p_iv) < 8 or length(p_iv) > 128 then
    raise exception 'ciphertext and iv are required';
  end if;
  if p_provider = 'openai_compatible'
     and (p_base_url is null or p_base_url !~ '^https://') then
    raise exception 'openai_compatible needs an https base_url';
  end if;
  insert into public.teacher_ai_keys
    (teacher_id, provider, model, base_url, key_ciphertext, key_iv)
  values
    (p_teacher_id, p_provider, nullif(trim(coalesce(p_model, '')), ''),
     nullif(trim(coalesce(p_base_url, '')), ''), p_ciphertext, p_iv)
  on conflict (teacher_id) do update set
    provider = excluded.provider,
    model = excluded.model,
    base_url = excluded.base_url,
    key_ciphertext = excluded.key_ciphertext,
    key_iv = excluded.key_iv
  returning * into v_row;
  return jsonb_build_object(
    'provider', v_row.provider, 'model', v_row.model,
    'is_set', true, 'updated_at', v_row.updated_at);
end $$;

revoke execute on function public.assistant_save_provider_key(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.assistant_save_provider_key(uuid, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) حالة المفتاح (المالك فقط) — metadata فقط: لا نص مشفّر ولا مفتاح.
-- ---------------------------------------------------------------------------
create or replace function public.assistant_provider_key_status(p_teacher_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.teacher_ai_keys;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_teacher_owner(p_teacher_id) then
    raise exception 'only the centre owner can view the provider key status';
  end if;
  select * into v_row from public.teacher_ai_keys where teacher_id = p_teacher_id;
  if not found then
    return jsonb_build_object('is_set', false);
  end if;
  return jsonb_build_object(
    'is_set', true, 'provider', v_row.provider, 'model', v_row.model,
    'updated_at', v_row.updated_at);
end $$;

revoke execute on function public.assistant_provider_key_status(uuid) from public, anon;
grant execute on function public.assistant_provider_key_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) حذف المفتاح (المالك فقط)
-- ---------------------------------------------------------------------------
create or replace function public.assistant_delete_provider_key(p_teacher_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_teacher_owner(p_teacher_id) then
    raise exception 'only the centre owner can delete the provider key';
  end if;
  delete from public.teacher_ai_keys where teacher_id = p_teacher_id;
  return jsonb_build_object('is_set', false);
end $$;

revoke execute on function public.assistant_delete_provider_key(uuid) from public, anon;
grant execute on function public.assistant_delete_provider_key(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) قراءة النص المشفّر (مالك أو عضو نشط) — لدالة Edge حصراً حتى تفكّه
--    بمفتاح بيئتها. النص المشفّر بلا مفتاح التشفير عديم القيمة، ولا
--    توجد أي مسارات أخرى لقراءة الجدول.
-- ---------------------------------------------------------------------------
create or replace function public.assistant_read_provider_key(p_teacher_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.teacher_ai_keys;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if public.assistant_actor_role(p_teacher_id) is null then
    raise exception 'not authorized for this teacher';
  end if;
  select * into v_row from public.teacher_ai_keys where teacher_id = p_teacher_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'provider', v_row.provider, 'model', v_row.model,
    'base_url', v_row.base_url,
    'key_ciphertext', v_row.key_ciphertext, 'key_iv', v_row.key_iv);
end $$;

revoke execute on function public.assistant_read_provider_key(uuid) from public, anon;
grant execute on function public.assistant_read_provider_key(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) delete_my_teacher_account: إعادة إنشاء نسخة 0048 + teacher_ai_keys
--    في قائمة الجداول (قاعدة 0046: أي جدول جديد بـ teacher_id يُضاف هنا).
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
    'whatsapp_message_log', 'assistant_runs', 'teacher_ai_keys'
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
