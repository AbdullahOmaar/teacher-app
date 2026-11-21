-- ============================================================================
-- 0026 — واتساب اختياري لكل مدرس (إعادة تشكيل 3A-300 بقرار المالك
-- 2026-11-21 ~12:25: كل قنوات التفعيل اختيارية لكل عميل وعلى حسابه)
--
-- النموذج: المنصة لا تملك أي أصول Meta. كل سنتر له صف إعدادات واتساب
-- اختياري (مقفول افتراضياً) بأصول Meta بتاعة المدرس نفسه:
-- • الحقول غير السرية (phone_number_id / waba_id / القالب / التفعيل)
--   في هذا الجدول بسياسة مالك فقط — تُدار من قسم «واتساب» في الإعدادات.
-- • التوكن سرّي: يُخزَّن في Supabase Vault مشفّراً (تحقق حياً:
--   supabase_vault 0.3.2، وvault.decrypted_secrets للقراءة من
--   service_role فقط وممنوعة على authenticated/anon). الجدول يحمل
--   مؤشر UUID للسر + طابع حفظه فقط — لا قيمة ولا أي جزء منها.
-- • الكتابة من العميل عبر set_teacher_whatsapp_token (حارس ملكية
--   صريح)؛ والقراءة خادمية فقط عبر دالتين داخليتين بتنفيذ ممنوح
--   لـ service_role وحده (دوال Edge) ومسحوب من الجميع غيره.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) جدول إعدادات واتساب لكل سنتر (غير سرية)
-- ---------------------------------------------------------------------------
create table public.teacher_whatsapp_config (
  teacher_id            uuid primary key references public.teachers (id) on delete cascade,
  enabled               boolean not null default false,
  phone_number_id       text not null default '',
  waba_id               text not null default '',
  template_name         text not null default 'otp_code',
  template_language     text not null default 'ar',
  -- مؤشر سرّ التوكن في Vault (UUID فقط) + طابع آخر حفظ — للعرض في
  -- الواجهة («توكن محفوظ») دون أي قدرة على استرجاع القيمة من العميل
  token_vault_secret_id uuid,
  token_updated_at      timestamptz,
  last_test_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.teacher_whatsapp_config enable row level security;

-- مالك فقط (كـ teacher_settings): المساعد لا يرى الصف ولا يعدّله
create policy whatsapp_config_owner_all on public.teacher_whatsapp_config
  for all using (public.is_teacher_owner(teacher_id))
  with check (public.is_teacher_owner(teacher_id));

create trigger teacher_whatsapp_config_updated_trg
  before update on public.teacher_whatsapp_config
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.teacher_whatsapp_config to authenticated;
grant all on public.teacher_whatsapp_config to service_role;

-- ---------------------------------------------------------------------------
-- 2) كتابة/حذف التوكن من العميل — يُخزَّن في Vault ولا يعود أبداً
--    حارس صريح: auth.uid() غائب أو غير مالك ⇒ رفض (قاعدة AGENTS).
--    قيمة فارغة/بيضاء = حذف السر والمؤشر.
-- ---------------------------------------------------------------------------
create or replace function public.set_teacher_whatsapp_token(p_teacher_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id uuid;
  v_name text := 'wa_token_' || p_teacher_id::text;
  v_token text := btrim(coalesce(p_token, ''));
begin
  if auth.uid() is null or not public.is_teacher_owner(p_teacher_id) then
    raise exception 'not authorized';
  end if;

  select token_vault_secret_id into v_secret_id
  from public.teacher_whatsapp_config
  where teacher_id = p_teacher_id;

  if v_token = '' then
    if v_secret_id is not null then
      delete from vault.secrets where id = v_secret_id;
    end if;
    update public.teacher_whatsapp_config
    set token_vault_secret_id = null, token_updated_at = null
    where teacher_id = p_teacher_id;
    return;
  end if;

  if v_secret_id is null then
    -- حالة حدّية: سرّ بنفس الاسم بلا مؤشر (محاولة سابقة متقطعة)
    select id into v_secret_id from vault.secrets where name = v_name;
  end if;

  if v_secret_id is not null then
    perform vault.update_secret(v_secret_id, v_token);
  else
    v_secret_id := vault.create_secret(
      v_token, v_name, 'WhatsApp access token (per-teacher, 0026)');
  end if;

  insert into public.teacher_whatsapp_config
    (teacher_id, token_vault_secret_id, token_updated_at)
  values (p_teacher_id, v_secret_id, now())
  on conflict (teacher_id) do update
    set token_vault_secret_id = excluded.token_vault_secret_id,
        token_updated_at = excluded.token_updated_at;
end $$;

revoke all on function public.set_teacher_whatsapp_token(uuid, text) from public;
grant execute on function public.set_teacher_whatsapp_token(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) قراءة خادمية فقط — حلّ قناة الواتساب لمستخدم Auth (لـ Hook)
--    يختار حتمياً: إعداد السنتر الأساسي المفعّل (teacher_id = uid)
--    أولاً، وإلا أقدم إعداد مفعّل بين سناتر المستخدم. يُرجع التوكن
--    مفكوكاً — لذلك التنفيذ لـ service_role وحده ومسحوب من الباقين،
--    ولا حارس auth.uid() هنا بتصميم موثّق: المستدعي الشرعي الوحيد
--    دالة Edge بالـ service role (auth.uid() غائب هناك أصلاً)،
--    وبوابة التنفيذ هي الحارس.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_whatsapp_channel_internal(p_user_id uuid)
returns table (
  teacher_id uuid,
  phone_number_id text,
  template_name text,
  template_language text,
  access_token text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select c.teacher_id, c.phone_number_id, c.template_name,
         c.template_language, ds.decrypted_secret
  from public.teacher_whatsapp_config c
  join public.teachers t on t.id = c.teacher_id
  join vault.decrypted_secrets ds on ds.id = c.token_vault_secret_id
  where t.owner_user_id = p_user_id
    and c.enabled
    and c.phone_number_id <> ''
    and c.token_vault_secret_id is not null
  order by (c.teacher_id = p_user_id) desc, c.created_at asc
  limit 1;
end $$;

revoke all on function public.resolve_whatsapp_channel_internal(uuid) from public;
grant execute on function public.resolve_whatsapp_channel_internal(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4) قراءة خادمية فقط — توكن مدرس بعينه (لدالة الإرسال التجريبي)
--    نفس بوابة التنفيذ: service_role وحده.
-- ---------------------------------------------------------------------------
create or replace function public.get_teacher_whatsapp_token_internal(p_teacher_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  select ds.decrypted_secret into v_token
  from public.teacher_whatsapp_config c
  join vault.decrypted_secrets ds on ds.id = c.token_vault_secret_id
  where c.teacher_id = p_teacher_id;
  return v_token;
end $$;

revoke all on function public.get_teacher_whatsapp_token_internal(uuid) from public;
grant execute on function public.get_teacher_whatsapp_token_internal(uuid) to service_role;

commit;

-- ============================================================================
-- نهاية 0026 — جدول جديد واحد + سرّ Vault اختياري لكل مدرس مفعِّل،
-- و3 دوال جديدة: set_teacher_whatsapp_token (authenticated بحارس
-- ملكية)، resolve_whatsapp_channel_internal +
-- get_teacher_whatsapp_token_internal (service_role فقط).
-- نطاق النسخة الاحتياطية JSON: الجدول مستثنى بوعي (نفس قاعدة جداول
-- رموز الوصول الموثقة في settings/api.ts) — مؤشر Vault بيئي بطبيعته
-- لا ينتقل بين المشاريع، وإدراج الصف بلا توكنه كان سيخلق حالة
-- «مفعّل» زائفة بعد الاستعادة؛ بعد أي استعادة يعيد المدرس إدخال
-- إعدادات واتساب وتوكنه من قسم الإعدادات (دقائق، وموثّق في التصميم).
-- ============================================================================
