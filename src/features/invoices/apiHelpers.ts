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

// ---------------------------------------------------------------------------
// فلتر الشهر لقائمة الفواتير (ملاحظة المالك 2026-11-28: «الصفحه دي لما يكون
// فيها اكتر من شهر يكون فلتر») — الشهر هنا هو invoices.period_month نفسه:
// الصفحة تجمّع به وترتّب به وتعرض تسميته، فالفلتر يطابق نفس التعريف حرفياً.
// ---------------------------------------------------------------------------

/** قيمة فلتر الشهر «كل الشهور» — لا قيد على الفترة */
export const INVOICE_MONTH_ALL = 'all'

/** فلتر حالة القائمة — مفاتيح رقائق صفحة الفواتير */
export type InvoiceStatusFilter = 'all' | 'due' | 'partial' | 'paid'

/**
 * الشهور المميزة الموجودة فعلاً في البيانات (period_month) — الأحدث أولاً.
 * طولها هو شرط ظهور زر تصفية الشهر: أكثر من شهر = الزر يظهر، شهر واحد
 * أو أقل = لا زر (الصفحة كما هي).
 */
export function invoiceMonthOptions(invoices: InvoiceListItem[]): string[] {
  return [...new Set(invoices.map((i) => i.period_month))].sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0,
  )
}

/**
 * القيمة الفعّالة لفلتر الشهر: اختيار المستخدم الصريح يُحترم ما دام موجوداً
 * في البيانات («كل الشهور» اختيار صريح دائماً)؛ وبلا اختيار — أو اختيار
 * لشهر اختفى من البيانات — فالافتراضي هو الشهر الحالي إن وُجد في البيانات،
 * وإلا «كل الشهور» حتى لا تفتح الصفحة فارغة وبياناتها موجودة (تنقيح موثّق
 * لافتراضي «الشهر الحالي»: مشروط بوجود فواتير فيه فعلاً).
 */
export function resolveInvoiceMonthFilter(
  choice: string | null,
  months: string[],
  currentMonth: string,
): string {
  if (choice === INVOICE_MONTH_ALL) return INVOICE_MONTH_ALL
  if (choice != null && months.includes(choice)) return choice
  return months.includes(currentMonth) ? currentMonth : INVOICE_MONTH_ALL
}

/**
 * فلترة قائمة الفواتير المعروضة: شهر ∩ حالة ∩ بحث — نفس دلالات رقائق
 * الحالة والبحث كما كانت inline في الصفحة حرفياً (نُقلت هنا لتُختبَر):
 * مستحقة = رصيد موجب، جزئية = دُفع بعضها وبقي رصيد، مسددة = لا رصيد باقٍ.
 */
export function filterInvoiceList(
  invoices: InvoiceListItem[],
  opts: { month: string; status: InvoiceStatusFilter; query: string },
): InvoiceListItem[] {
  const q = opts.query.trim().toLowerCase()
  return invoices.filter((inv) => {
    if (opts.month !== INVOICE_MONTH_ALL && inv.period_month !== opts.month) return false
    if (opts.status === 'due' && !(inv.balance > 0)) return false
    if (opts.status === 'partial' && !(inv.paid > 0 && inv.balance > 0)) return false
    if (opts.status === 'paid' && !(inv.balance <= 0)) return false
    if (!q) return true
    return (
      inv.student_name.toLowerCase().includes(q) ||
      periodYm(inv.period_month).includes(q) ||
      periodLabel(inv.period_month).includes(q)
    )
  })
}

// ---------------------------------------------------------------------------
// الدفع الجماعي (قرار المدير 2026-11-28): تحديد فواتير من القائمة وتسجيل
// دفع كامل لكلٍّ منها بإيصالها المستقل عبر مسار الدفع الفردي نفسه
// (createPayment بحارس الدفع الزائد 3A-910). لا معاملة جماعية من جهة
// العميل: التنفيذ متسلسل فاتورةً فاتورة، والفشل الجزئي يُبلَّغ كما هو
// في الملخص — لا ادّعاء ذرّية أبداً.
// ---------------------------------------------------------------------------

/** الفواتير القابلة للدفع/التحديد: رصيد متبقٍّ موجب (مستحقة أو جزئية) */
export function payableInvoices(invoices: InvoiceListItem[]): InvoiceListItem[] {
  return invoices.filter((inv) => inv.balance > 0)
}

/**
 * «تحديد الكل»: يضيف القابل للدفع من المرئي حالياً (بعد فلاتر الشهر
 * والحالة والبحث) إلى التحديد القائم — التحديد نفسه بالمعرّف ويبقى
 * ثابتاً عبر تغيير الفلاتر.
 */
export function addVisiblePayableToSelection(
  current: ReadonlySet<string>,
  visible: InvoiceListItem[],
): Set<string> {
  const next = new Set(current)
  for (const inv of payableInvoices(visible)) next.add(inv.invoice_id)
  return next
}

/** عدّاد شريط التحديد وإجمالي المتبقي على كل المحدد — الحساب بالقرش */
export function selectionTotals(
  invoices: InvoiceListItem[],
  selectedIds: ReadonlySet<string>,
): { count: number; total: number } {
  let count = 0
  let piasters = 0
  for (const inv of invoices) {
    if (!selectedIds.has(inv.invoice_id)) continue
    count += 1
    piasters += Math.round(inv.balance * 100)
  }
  return { count, total: piasters / 100 }
}

export type BulkPayItemStatus = 'paid' | 'skipped' | 'failed'

export interface BulkPayItemResult {
  invoiceId: string
  status: BulkPayItemStatus
  /** المبلغ المسجل فعلياً (0 عند التخطي/الفشل) */
  amount: number
  receiptNo?: string
  /** سبب الفشل كما هو (رسالة الخطأ الأصلية) — التخطي سببه معلوم من حالته */
  reason?: string
}

export interface BulkPaySummary {
  results: BulkPayItemResult[]
  paidCount: number
  paidTotal: number
  skippedCount: number
  failedCount: number
}

export interface BulkPayDeps {
  /** إعادة قراءة الرصيد الحي وقت التنفيذ — null = لا صف رصيد للفاتورة */
  fetchBalance: (invoiceId: string) => Promise<number | null>
  /** تسجيل الدفعة عبر createPayment نفسها (بحارس الدفع الزائد) */
  pay: (invoiceId: string, amount: number) => Promise<{ receiptNo: string }>
}

/**
 * تنفيذ الدفع الجماعي متسلسلاً: لكل فاتورة يُعاد قراءة رصيدها الحي لحظة
 * تنفيذها — رصيد صفر/غائب = تُتخطّى وتُبلَّغ (سُدّدت منذ التحديد)،
 * والمبلغ المدفوع هو الرصيد المقروء الآن لا رصيد وقت التحديد، فيمرّ
 * بحارس الدفع الزائد طبيعياً ولا يُدفع قرش فوق المستحق أبداً. فشل أي
 * فاتورة لا يوقف الباقي، وسبب كل فشل يُحفظ في نتيجته كما هو.
 */
export async function runBulkPayments(
  invoiceIds: string[],
  deps: BulkPayDeps,
): Promise<BulkPaySummary> {
  const results: BulkPayItemResult[] = []
  let paidPiasters = 0
  for (const invoiceId of invoiceIds) {
    let balance: number | null
    try {
      balance = await deps.fetchBalance(invoiceId)
    } catch (e) {
      results.push({
        invoiceId,
        status: 'failed',
        amount: 0,
        reason: e instanceof Error ? e.message : String(e),
      })
      continue
    }
    if (balance == null || !(balance > 0)) {
      results.push({ invoiceId, status: 'skipped', amount: 0 })
      continue
    }
    const amount = Math.round(balance * 100) / 100
    try {
      const { receiptNo } = await deps.pay(invoiceId, amount)
      paidPiasters += Math.round(amount * 100)
      results.push({ invoiceId, status: 'paid', amount, receiptNo })
    } catch (e) {
      results.push({
        invoiceId,
        status: 'failed',
        amount: 0,
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return {
    results,
    paidCount: results.filter((r) => r.status === 'paid').length,
    paidTotal: paidPiasters / 100,
    skippedCount: results.filter((r) => r.status === 'skipped').length,
    failedCount: results.filter((r) => r.status === 'failed').length,
  }
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
