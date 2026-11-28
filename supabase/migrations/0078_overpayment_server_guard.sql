-- ============================================================================
-- 0078 — حارس الدفع الزائد خادمياً (3A-910 — تقوية قبل التجميد، أمر مدير
-- 2026-11-28): دفع 500ج على فاتورة 400ج اتقبل حياً على بناء الديمو القديم
-- (رصيد −100ج) لأن حارس العميل (PR #56، مدموج d4c0322) لسه ما اتنشرش
-- على أي سطح حي. حارس العميل صحيح في الكود لكنه فحص من جهة العميل
-- بالتصميم: إدراج مباشر في الجدول أو دفعتان متزامنتان يقدروا يتجاوزوه.
-- هذه المهاجرة هي الضمان الصلب: trigger قبل الإدراج على payments يرفض
-- أي دفعة موجبة تتجاوز الرصيد الحي — بما فيه سباق دفعتين متزامنتين
-- (قفل صف الفاتورة يسرّعهما).
--
-- الدلالات (مرآة حرفية لـ view ‏invoice_balances في 0001 — لازم تتطابق
-- مع حارس العميل وإلا اختلف الحارسان):
-- • الإجمالي = مجموع سطور الفاتورة (invoice_lines.amount — قد تكون سالبة
--   كخصم/تسوية).
-- • المدفوع = مجموع كل صفوف الدفعات للفاتورة بلا أي فلتر: الدفعة الأصلية
--   المُعكَسَة تُحسب في المجموع والصف السالب المقابل (من voidPayment)
--   يلغيها — بالظبط زي الـview.
-- • الرصيد = الإجمالي − المدفوع؛ دفعة موجبة أكبر من الرصيد تُرفض.
--
-- حدود موثقة (لا تغيير سلوك خارجها):
-- • العكس (مبلغ سالب) يمر دائماً — هو التصحيح نفسه (§5.3).
-- • الفاتورة الغائبة أو غير المرئية للمُدرِج ⇒ رفض مغلق الاتجاه
--   (fail-closed) — لا دفعة بلا فاتورة مملوكة.
-- • لا أثر رجعي: صفوف الدفعات الزائدة الموجودة أصلاً (حالتا اختبار سند
--   على الديمو) تبقى كما هي — الـtrigger يحكم الإدراجات الجديدة فقط،
--   ودفعة موجبة جديدة على فاتورة مدفوعة زيادةً تُرفض لأن رصيدها سالب.
-- • التحديث (UPDATE) لمبلغ دفعة قائم خارج النطاق: التطبيق لا يعدّل
--   مبالغ الدفعات أبداً (التصحيح بعكس سالب فقط) — أي UPDATE لمبلغ
--   سيكون إدراجاً مباشراً خارج التطبيق.
--
-- لماذا الدالة ليست security definer (نمط set_updated_at في 0001):
-- الدالة لا تُستدعى إلا عبر الـtrigger عند INSERT في payments — وهو
-- إدراج مقيَّد أصلاً بسياسات RLS (مالك الفاتورة فقط) — ولا تُرجع أي
-- بيانات ولا تعدّل إلا الصف الجاري إدراجه (RETURN NEW أو RAISE).
-- وبيانات المالية مالك-فقط في RLS، فالمُدرِج يرى بالظبط صفوف الـview
-- نفسها — الحارسان يتفقان بالبناء. لا منح تنفيذ إضافي ولا أسرار.
-- ============================================================================

create or replace function public.check_payment_not_exceed_balance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_balance numeric(12,2);
  v_found boolean;
begin
  -- العكس/السالب يمر دائماً (يخفّض المدفوع — تصحيح بدفعة سالبة §5.3).
  if new.amount <= 0 then
    return new;
  end if;

  -- قفل صف الفاتورة: يسرّع الدفعات المتزامنة على نفس الفاتورة فيسقط
  -- السباق — دفعة ثانية تنتظر الأولى ثم ترى رصيدها بعدها.
  select true into v_found
    from public.invoices
    where id = new.invoice_id
    for update;
  if not coalesce(v_found, false) then
    raise exception 'invoice not found';
  end if;

  -- نفس دلالات view ‏invoice_balances حرفياً (0001).
  select coalesce(sum(amount), 0) into v_total
    from public.invoice_lines
    where invoice_id = new.invoice_id;
  select coalesce(sum(amount), 0) into v_paid
    from public.payments
    where invoice_id = new.invoice_id;
  v_balance := v_total - v_paid;

  if new.amount > v_balance then
    raise exception 'مبلغ الدفعة أكبر من المتبقي على الفاتورة (المتبقي % ج)', v_balance;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payments_no_overpay on public.payments;
create trigger trg_payments_no_overpay
  before insert on public.payments
  for each row execute function public.check_payment_not_exceed_balance();
