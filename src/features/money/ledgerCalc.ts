// ---------------------------------------------------------------------------
// حسابات دفتر السنتر النقية (مشتريات/مبيعات — مهاجرة 0051، مهمة فيز 2 رقم 10).
// كلها دوال صافية بلا أي اعتماد على الشبكة أو التخزين، حتى تُختبر وحدوياً
// وتُعاد في الواجهة كما هي — الأرصدة المعروضة هنا مطابقة لتعريف Views
// القاعدة (purchase_balances / sale_balances): الإجمالي = مجموع البنود،
// والباقي = الإجمالي − المدفوع. التقريب لخانتين عند كل خطوة حتى لا تنحرف
// الكسور العائمة عن حساب numeric في القاعدة.
// ---------------------------------------------------------------------------

export interface LedgerLine {
  description: string
  quantity: number
  unit_price: number
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function lineTotal(line: LedgerLine): number {
  return round2(line.quantity * line.unit_price)
}

export function linesTotal(lines: LedgerLine[]): number {
  return round2(lines.reduce((sum, l) => sum + lineTotal(l), 0))
}

export type BalanceStatus = 'paid' | 'partial' | 'unpaid' | 'overpaid'

export interface Balance {
  total: number
  paid: number
  remaining: number
  status: BalanceStatus
}

export function balanceOf(total: number, paid: number): Balance {
  const t = round2(total)
  const p = round2(paid)
  const remaining = round2(t - p)
  const status: BalanceStatus =
    remaining < 0 ? 'overpaid' : remaining === 0 ? 'paid' : p > 0 ? 'partial' : 'unpaid'
  return { total: t, paid: p, remaining, status }
}

/** تحقق بنود الإدخال — يرجع مفتاح خطأ i18n أو null عند السلامة */
export function linesError(lines: LedgerLine[]): 'empty' | 'description' | 'quantity' | 'price' | null {
  if (lines.length === 0) return 'empty'
  for (const l of lines) {
    if (!l.description.trim()) return 'description'
    if (!(l.quantity > 0)) return 'quantity'
    if (!(l.unit_price >= 0)) return 'price'
  }
  return null
}

/** المحصّل من عملية بيع لا يتجاوز إجماليها ولا يقل عن صفر */
export function salePaymentError(total: number, amountPaid: number): 'negative' | 'exceeds' | null {
  if (!(amountPaid >= 0)) return 'negative'
  if (round2(amountPaid) > round2(total)) return 'exceeds'
  return null
}

// ---------------------------------------------------------------------------
// أعمار المستحقات (payables aging): كم مضى على تاريخ الشراء حتى اليوم.
// الفئات: حتى 30 يوماً / 31–60 / 61–90 / أكثر من 90 — نفس تقسيم تقارير
// أعمار الديون المعتاد، ويُستخدم لتلخيص مستحقات الموردين في الواجهة.
// ---------------------------------------------------------------------------

export type AgingBucket = 'd0_30' | 'd31_60' | 'd61_90' | 'over90'

export const AGING_BUCKETS: AgingBucket[] = ['d0_30', 'd31_60', 'd61_90', 'over90']

export function daysBetween(fromDate: string, toDate: string): number {
  const a = Date.parse(`${fromDate}T00:00:00Z`)
  const b = Date.parse(`${toDate}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

export function agingBucket(purchaseDate: string, today: string): AgingBucket {
  const d = daysBetween(purchaseDate, today)
  if (d <= 30) return 'd0_30'
  if (d <= 60) return 'd31_60'
  if (d <= 90) return 'd61_90'
  return 'over90'
}

export interface PayableEntry {
  purchase_date: string
  remaining: number
}

/** تلخيص الباقي المستحق حسب فئة العمر — الصفوف المسددة بالكامل لا تدخل */
export function summarizePayables(
  entries: PayableEntry[],
  today: string,
): Record<AgingBucket, number> {
  const out: Record<AgingBucket, number> = { d0_30: 0, d31_60: 0, d61_90: 0, over90: 0 }
  for (const e of entries) {
    if (!(e.remaining > 0)) continue
    out[agingBucket(e.purchase_date, today)] = round2(out[agingBucket(e.purchase_date, today)] + e.remaining)
  }
  return out
}
