-- 0077: توكنات أجهزة التطبيق الأصلي (FCM) — فيز 1 فلاتر F1-T8.
-- جدول مستقل عن اشتراكات Web Push (push_subscriptions للويب فقط).
-- كل مستخدم يدير أجهزته فقط (auth.uid)؛ دالة الإرسال الداخلية
-- (send-fcm) تقرأ بمفتاح الإدارة كقناة داخلية وتتجاوز RLS بتصميمها.
-- ملحوظة قاعدة RLS في AGENTS.md: الجدول بلا teacher_id أصلاً — ملكية
-- الجهاز للمستخدم (مالكًا كان أو عضوًا) فالمقارنة الصحيحة user_id =
-- auth.uid() (سابقة 0075 لصفوف الأعضاء)، وis_teacher_owner لا تنطبق.

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists device_push_tokens_user_idx
  on public.device_push_tokens (user_id);

alter table public.device_push_tokens enable row level security;

drop policy if exists device_push_tokens_select_own on public.device_push_tokens;
create policy device_push_tokens_select_own
  on public.device_push_tokens for select to authenticated
  using (user_id = auth.uid());

drop policy if exists device_push_tokens_insert_own on public.device_push_tokens;
create policy device_push_tokens_insert_own
  on public.device_push_tokens for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists device_push_tokens_update_own on public.device_push_tokens;
create policy device_push_tokens_update_own
  on public.device_push_tokens for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists device_push_tokens_delete_own on public.device_push_tokens;
create policy device_push_tokens_delete_own
  on public.device_push_tokens for delete to authenticated
  using (user_id = auth.uid());
