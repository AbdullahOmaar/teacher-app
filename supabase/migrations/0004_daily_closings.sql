-- ============================================================================
-- تطبيق المدرس — 0004_daily_closings.sql
-- Phase 2 / الخطوة 5: الإغلاق اليومي للخزنة (Daily Cashbox Closing)
--
-- طبقة فوق بيانات الدفعات الحالية فقط — لا تغيير في منطق payments/invoices:
-- • «المتوقع» لليوم يُحسب لحظة العرض من payments حسب paid_on والطريقة
--   (نقدي = method='cash'، إلكتروني = باقي الطرق)، والدفعات العكسية السالبة
--   تدخل في المجموع بصافيها كما يعاملها view ‏monthly_profit حرفياً.
-- • هذا الجدول يحفظ «لقطة» الإغلاق فقط: المتوقع وقت الإغلاق، والمعدود
--   فعلياً، ومصروفات اليوم وقتها، فلا تتغير سجلات الأيام المغلقة لو سُجّلت
--   دفعة متأخرة بتاريخ قديم بعد الإغلاق (يظهر الفرق عند إعادة الفتح).
-- • الفرق (معدود − متوقع) مشتق دائماً من الأعمدة المحفوظة، لا يُخزّن.
-- • إغلاق واحد لكل (مدرس، يوم) — إعادة الفتح/التعديل = upsert على نفس الصف.
-- • المالية للمالك فقط: لا سياسة للمساعد إطلاقاً، مطابقاً لنمط payments
--   و expenses و teacher_settings في 0001.
-- ============================================================================

begin;

create table public.daily_closings (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references public.teachers (id) on delete cascade,
  closing_date      date not null,
  -- لقطة المتوقع وقت الإغلاق (من payments لذلك اليوم)
  expected_cash       numeric(12,2) not null,
  expected_electronic numeric(12,2) not null,
  -- لقطة مصروفات اليوم وقت الإغلاق (من expenses لذلك اليوم) — للعرض في
  -- الملخص فقط؛ لا تُخصم من المتوقع لأن جدول expenses بلا طريقة دفع
  -- فلا يمكن نسبتها لقناة نقدية أو إلكترونية بأمانة.
  expenses_total      numeric(12,2) not null default 0,
  -- المعدود فعلياً كما أدخله المدرس عند الإغلاق
  counted_cash        numeric(12,2) not null check (counted_cash >= 0),
  counted_electronic  numeric(12,2) not null default 0 check (counted_electronic >= 0),
  note              text,
  -- من أغلق (حساب Auth) ومتى: created_at أول إغلاق، updated_at آخر تعديل
  closed_by         uuid not null references auth.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (teacher_id, closing_date)
);
create index daily_closings_teacher_date_idx
  on public.daily_closings (teacher_id, closing_date desc);

create trigger daily_closings_updated_trg before update on public.daily_closings
  for each row execute function public.set_updated_at();

alter table public.daily_closings enable row level security;

-- المالك فقط — بلا أي سياسة للمساعد (مالية، كنمط 0001)
create policy daily_closings_owner_all on public.daily_closings
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

commit;

-- ============================================================================
-- نهاية 0004 — جدول جديد: daily_closings | سياسات RLS: 1 (مالك فقط)
-- ============================================================================
