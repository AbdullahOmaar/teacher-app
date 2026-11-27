// ===========================================================================
// الفواتير — مساعدات نقية وطرق دفع: ثوابت طرق الدفع + مساعدات الفترة وحالة
// السداد + تجميعات المتأخرات وغير المسدد. لا وصول لقاعدة البيانات هنا.
// (فُصل من api.ts — برنامج الكود النظيف 2026-11-27، نمط COD-2)
// ===========================================================================

import { t } from '../../i18n'
import type { InvoiceBalanceRow, PaymentMethod } from '../../types/database'
import { periodLabel } from '../schedule/api'
import type { InvoiceListItem } from './apiQueries'


// ---------------------------------------------------------------------------
// طرق الدفع — enum ‏payment_method في المخطط حرفياً
// ---------------------------------------------------------------------------

export const PAYMENT_METHODS: { code: PaymentMethod; label: string }[] = [
  { code: 'cash', label: t('invoices.apiMethodCash') },
  { code: 'vodafone_cash', label: t('invoices.apiMethodVodafone') },
  { code: 'instapay', label: t('invoices.apiMethodInstapay') },
  { code: 'bank_transfer', label: t('invoices.apiMethodBank') },
]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: t('invoices.apiMethodCash'),
  vodafone_cash: t('invoices.apiMethodVodafone'),
  instapay: t('invoices.apiMethodInstapay'),
  bank_transfer: t('invoices.apiMethodBank'),
}

// ---------------------------------------------------------------------------
// مساعدات الفترة — invoices.period_month هو أول يوم في الشهر 'YYYY-MM-DD'
// ---------------------------------------------------------------------------

/** '2026-11-01' → '2026-11' (صيغة الفترة في المرجع) */
export function periodYm(periodMonth: string): string {
  return periodMonth.slice(0, 7)
}

/** '2026-11-01' → 'نوفمبر 2026' — التعريف الموحّد في وحدة الجدول (3A-314) */
export { periodLabel }

/** حالة سداد مشتقة من أرقام view ‏invoice_balances (المرجع §5.2) */
export type InvoicePayState = 'paid' | 'partial' | 'due'

export function payStateOf(b: { total: number; paid: number; balance: number }): InvoicePayState {
  if (b.balance <= 0) return 'paid'
  return b.paid > 0 ? 'partial' : 'due'
}

/**
 * «غير مسدد» — التعريف الوحيد المعتمد (PAT-4): رصيد متبقٍّ أكبر من صفر.
 * كانت الصيغة `balance > 0` مكررة inline في الرئيسية وقائمة الفواتير
 * وتبويب مدفوعات الطالب وربط إثباتات الدفع؛ أي تغيير مستقبلي في
 * التعريف يحدث هنا فقط.
 */
export function isUnpaid(b: { balance: number }): boolean {
  return b.balance > 0
}

export interface ArrearsSplit {
  unpaidCount: number
  arrearsTotal: number
  dueThisMonthCount: number
  dueThisMonthTotal: number
  overdueCount: number
  overdueTotal: number
}

/**
 * تقسيم المتأخرات (M4 — 3A-361): «مستحق هذا الشهر» = غير مسدد بفترة
 * الشهر الحالي (period_month == monthStart)، و«متأخر» = غير مسدد
 * بفترة أقدم (period_month < monthStart). فواتير أشهر قادمة غير
 * مسددة تدخل الإجمالي والعدد فقط — لا في المستحق ولا في المتأخر.
 */
export function splitArrears(rows: InvoiceBalanceRow[], monthStart: string): ArrearsSplit {
  let unpaidCount = 0
  let arrearsTotal = 0
  let dueThisMonthCount = 0
  let dueThisMonthTotal = 0
  let overdueCount = 0
  let overdueTotal = 0
  for (const r of rows) {
    if (!isUnpaid(r)) continue
    unpaidCount += 1
    arrearsTotal += r.balance
    if (r.period_month === monthStart) {
      dueThisMonthCount += 1
      dueThisMonthTotal += r.balance
    } else if (r.period_month < monthStart) {
      overdueCount += 1
      overdueTotal += r.balance
    }
  }
  return { unpaidCount, arrearsTotal, dueThisMonthCount, dueThisMonthTotal, overdueCount, overdueTotal }
}

interface UnpaidStudentRow {
  studentId: string
  name: string
  total: number
}

interface UnpaidStudentSummary {
  rows: UnpaidStudentRow[]
  total: number
  count: number
}

export interface UnpaidByStudent {
  overdue: UnpaidStudentSummary
  currentDue: UnpaidStudentSummary
}

/**
 * تجميع «غير المسدد» لكل طالب (PAT-4 — دفعة #10): التعريف الموحّد
 * لمجموعات صفحة الفواتير. غير المسدد (isUnpaid) يُجمَّع بالطالب ويُرتَّب
 * تنازلياً بالمبلغ، وينقسم عند الشهر الحالي: «متأخر» = فترة أقدم من
 * الشهر الحالي، و«مستحق حالي» = فترة الشهر الحالي أو أحدث.
 * استُخرج حرفياً من InvoicesPage حيث كان inline داخل useMemo.
 */
export function summarizeUnpaidByStudent(
  invoices: InvoiceListItem[],
  currentMonth: string,
): UnpaidByStudent {
  const aggregate = (list: InvoiceListItem[]): UnpaidStudentSummary => {
    const byStudent = new Map<string, { name: string; total: number }>()
    for (const inv of list) {
      const cur = byStudent.get(inv.student_id) ?? { name: inv.student_name, total: 0 }
      cur.total += inv.balance
      byStudent.set(inv.student_id, cur)
    }
    const rows = [...byStudent.entries()]
      .map(([studentId, v]) => ({ studentId, ...v }))
      .sort((a, b) => b.total - a.total)
    return { rows, total: rows.reduce((s, r) => s + r.total, 0), count: rows.length }
  }
  const unpaid = invoices.filter(isUnpaid)
  return {
    overdue: aggregate(unpaid.filter((i) => i.period_month < currentMonth)),
    currentDue: aggregate(unpaid.filter((i) => i.period_month >= currentMonth)),
  }
}

export interface StudentInvoicesSummary {
  dueTotal: number
  dueCount: number
  totalPaid: number
}

/**
 * ملخص فواتير طالب واحد (PAT-4 — دفعة #10): إجمالي وعدد غير المسدد
 * (isUnpaid) وإجمالي المدفوع عبر كل الفواتير. استُخرج حرفياً من
 * StudentPaymentsTab حيث كان inline داخل useMemo.
 */
export function summarizeStudentInvoices(invoices: InvoiceListItem[]): StudentInvoicesSummary {
  const due = invoices.filter(isUnpaid)
  return {
    dueTotal: due.reduce((s, i) => s + i.balance, 0),
    dueCount: due.length,
    totalPaid: invoices.reduce((s, i) => s + i.paid, 0),
  }
}
