// ===========================================================================
// الفواتير — الدفعات: إنشاء دفعة برقم إيصال ذرّي وعكسها بدفعة سالبة.
// (فُصل من api.ts — برنامج الكود النظيف 2026-11-27، نمط COD-2)
// ===========================================================================

import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import { friendlyDbError } from '../../lib/supabaseErrors'
import type { PaymentMethod, PaymentRow } from '../../types/database'
import { todayStr } from '../home/api'
import { logActivity } from '../activity/api'
import { PAYMENT_METHOD_LABELS } from './apiHelpers'
import { PAY_COLS } from './apiShared'

// ---------------------------------------------------------------------------
// الدفعات والإيصالات — دفتر مستقل: لا حذف ولا تعديل للمبلغ أبداً،
// والتصحيح بدفعة عكسية سالبة فقط (المرجع §5.3).
// رقم الإيصال يأتي حصراً من دالة المخطط الذرّية public.next_receipt_no
// (عدّاد receipt_counters لكل مدرس وسنة، صيغة YYYY-NNNN) — لا ترقيم يدوي.
// إن فشل إدراج الدفعة بعد حجز الرقم يبقى الرقم محروقاً (فجوة مقبولة في
// التسلسل مقابل ضمان عدم التكرار أبداً).
// ---------------------------------------------------------------------------

export async function createPayment(
  teacherId: string,
  invoiceId: string,
  input: { amount: number; method: PaymentMethod; paid_on: string },
): Promise<PaymentRow> {
  if (!(input.amount > 0)) throw new Error(t('invoices.apiErrorPaymentAmount'))
  // حارس الدفع الزائد (3A-910): المبلغ لا يتجاوز الرصيد الحي للفاتورة من
  // view ‏invoice_balances — يُفحص قبل حجز رقم الإيصال حتى لا يحترق رقم
  // على رفض تحقق. المقارنة بالقرش (تقريب لرقمين عشريين) تفادياً لضوضاء
  // الفاصلة العائمة عند المساواة التامة. غياب صف الـview (فاتورة لا تخص
  // هذا المدرس) = رصيد صفر = رفض مغلق الاتجاه.
  // حدّ موثّق: هذا فحص من جهة العميل — دفعتان متزامنتان على نفس الفاتورة
  // قد تقرآن نفس الرصيد وتتجاوزانه معاً؛ الضمان الصلب يحتاج قيداً
  // خادمياً (مهاجرة) وهو متابعة موثقة منفصلة، لا جزء من هذا الإصلاح.
  const { data: balRow, error: balErr } = await db()
    .from('invoice_balances')
    .select('balance')
    .eq('teacher_id', teacherId)
    .eq('invoice_id', invoiceId)
    .maybeSingle()
  if (balErr) throw balErr
  const balance = balRow ? Number(balRow.balance) || 0 : 0
  if (Math.round(input.amount * 100) > Math.round(balance * 100)) {
    throw new Error(t('invoices.apiErrorPaymentExceedsBalance', { balance }))
  }
  const { data: receiptNo, error: rpcErr } = await db().rpc('next_receipt_no', {
    p_teacher_id: teacherId,
    p_date: input.paid_on,
  })
  if (rpcErr) throw rpcErr

  const { data, error } = await db()
    .from('payments')
    .insert({
      teacher_id: teacherId,
      invoice_id: invoiceId,
      amount: input.amount,
      method: input.method,
      paid_on: input.paid_on,
      receipt_no: receiptNo as string,
    })
    .select(PAY_COLS)
    .single()
  if (error) throw friendlyDbError(error, t('common.saveError'), t('common.saveBlockedByMissingLink'))
  const row = data
  const payment = { ...row, amount: Number(row.amount) || 0 }
  // سجل النشاط: إنشاء دفعة (يشمل الدفعة التي ينشئها اعتماد إثبات دفع —
  // حدث الاعتماد نفسه يُسجَّل منفصلاً من وحدة الإثباتات)
  void logActivity(teacherId, {
    event_type: 'payment_created',
    entity_type: 'payment',
    entity_id: payment.id,
    entity_label: t('invoices.apiReceiptLabel', { receiptNo: payment.receipt_no }),
    details: {
      amount: payment.amount,
      method: payment.method,
      method_label: PAYMENT_METHOD_LABELS[payment.method] ?? payment.method,
      paid_on: payment.paid_on,
      receipt_no: payment.receipt_no,
      invoice_id: invoiceId,
    },
  })
  return payment
}

/**
 * عكس دفعة (المرجع §5.3): الأصلية تبقى وتُعلَّم voided، وتُنشأ دفعة سالبة
 * بنفس المبلغ والطريقة وبتاريخ اليوم، مرتبطة بـ reverses_payment_id.
 * انحراف موثّق عن المرجع: رقم إيصال العكس في المرجع كان نص «عكس {الأصلي}»،
 * أما هنا فيأخذ رقماً تسلسلياً جديداً من next_receipt_no التزاماً بقاعدة
 * «لا ترقيم يدوي» وبقيد فرادة (teacher_id, receipt_no) في المخطط،
 * والربط بالأصلية محفوظ في reverses_payment_id.
 */
export async function voidPayment(teacherId: string, payment: PaymentRow): Promise<PaymentRow> {
  const today = todayStr()
  const { data: receiptNo, error: rpcErr } = await db().rpc('next_receipt_no', {
    p_teacher_id: teacherId,
    p_date: today,
  })
  if (rpcErr) throw rpcErr

  const { data, error } = await db()
    .from('payments')
    .insert({
      teacher_id: teacherId,
      invoice_id: payment.invoice_id,
      amount: -payment.amount,
      method: payment.method,
      paid_on: today,
      receipt_no: receiptNo as string,
      reverses_payment_id: payment.id,
    })
    .select(PAY_COLS)
    .single()
  if (error) throw friendlyDbError(error, t('common.saveError'), t('common.saveBlockedByMissingLink'))

  const { error: markErr } = await db()
    .from('payments')
    .update({ voided: true })
    .eq('teacher_id', teacherId)
    .eq('id', payment.id)
  if (markErr) throw markErr

  const row = data
  const reversal = { ...row, amount: Number(row.amount) || 0 }
  // سجل النشاط: عكس الدفعة هو «حذف/إبطال» الدفعات في هذا النظام (لا حذف
  // فعلي للدفتر أبداً) — يُسجَّل باسم الأصلية المعكوسة ومبلغها الأصلي.
  void logActivity(teacherId, {
    event_type: 'payment_voided',
    entity_type: 'payment',
    entity_id: payment.id,
    entity_label: t('invoices.apiReceiptLabel', { receiptNo: payment.receipt_no }),
    details: {
      amount: payment.amount,
      method: payment.method,
      method_label: PAYMENT_METHOD_LABELS[payment.method] ?? payment.method,
      receipt_no: payment.receipt_no,
      reversal_receipt_no: reversal.receipt_no,
      invoice_id: payment.invoice_id,
    },
  })
  return reversal
}

