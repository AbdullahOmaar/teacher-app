import { t } from '../../i18n'
import { db } from '../../lib/supabase'
import { friendlyDbError } from '../../lib/supabaseErrors'
import type {
  MonthlyCentreFinanceRow,
  PaymentMethod,
  PurchaseBalanceRow,
  PurchaseLineRow,
  PurchasePaymentRow,
  PurchaseRow,
  SaleBalanceRow,
  SaleLineRow,
  SaleRow,
  SupplierPayableRow,
  SupplierRow,
  Tables,
} from '../../types/database'
import { balanceOf, type Balance, type LedgerLine } from './ledgerCalc'

// ---------------------------------------------------------------------------
// دفتر السنتر: مشتريات ومبيعات (migration ‏0051 — مهمة فيز 2 رقم 10).
//
// • المالية للمالك فقط في RLS (is_teacher_owner) — لا سياسة للمساعد إطلاقاً،
//   فالواجهة هنا تُعرض للمالك فقط وقسمها مخفي/مقفل لغيره كسائر المالية.
// • الإجماليات لا تُقرأ من الرأس أبداً: دائماً من view ‏purchase_balances /
//   sale_balances (مشتقة من البنود في القاعدة) — وتُعاد حسابات العرض النقية
//   في ledgerCalc بنفس التعريف حتى تتطابق الواجهة مع القاعدة.
// • الإنشاء الذرّي (رأس + بنود) عبر RPC ‏create_purchase / create_sale فقط؛
//   لا إدخال رأسي من العميل حتى لا توجد عملية بلا بنود ولو لحظياً.
// • مدفوعات الموردين دفتر: تُدخل ولا تُعدَّل/تُحذف (لا سياسات تحديث/حذف) —
//   التصحيح بقيد سالب من نفس نموذج الإدخال، مطابقاً لفلسفة payments.
// ---------------------------------------------------------------------------

export interface PurchaseListItem extends PurchaseRow {
  supplier_name: string | null
  balance: Balance
}

export interface SaleListItem extends SaleRow {
  student_name: string | null
  balance: Balance
}

export interface PurchaseDetail {
  purchase: PurchaseRow
  lines: PurchaseLineRow[]
  payments: PurchasePaymentRow[]
  balance: Balance
}

const SUPPLIER_COLS = 'id, teacher_id, name, phone, note, created_at, updated_at'
const PURCHASE_COLS = 'id, teacher_id, supplier_id, purchase_date, note, created_at, updated_at'
const SALE_COLS =
  'id, teacher_id, student_id, buyer_name, sale_date, amount_paid, note, created_at, updated_at'

function toBalance(row: PurchaseBalanceRow | SaleBalanceRow | undefined, fallbackTotal = 0): Balance {
  if (!row) return balanceOf(fallbackTotal, 0)
  return balanceOf(Number(row.total) || 0, Number(row.paid) || 0)
}

// ---------------------------------------------------------------------------
// الموردون
// ---------------------------------------------------------------------------

export async function fetchSuppliers(teacherId: string): Promise<SupplierRow[]> {
  const { data, error } = await db()
    .from('suppliers')
    .select(SUPPLIER_COLS)
    .eq('teacher_id', teacherId)
    .order('name')
  if (error) throw friendlyDbError(error, t('money.ledgerLoadError'))
  return data ?? []
}

export async function createSupplier(
  teacherId: string,
  input: { name: string; phone: string | null; note: string | null },
): Promise<void> {
  const { error } = await db()
    .from('suppliers')
    .insert({ teacher_id: teacherId, name: input.name.trim(), phone: input.phone, note: input.note })
  if (error) throw friendlyDbError(error, t('money.ledgerLoadError'))
}

export async function updateSupplier(
  id: string,
  input: { name: string; phone: string | null; note: string | null },
): Promise<void> {
  const { error } = await db()
    .from('suppliers')
    .update({ name: input.name.trim(), phone: input.phone, note: input.note })
    .eq('id', id)
  if (error) throw friendlyDbError(error, t('money.ledgerLoadError'))
}

export async function deleteSupplier(id: string): Promise<void> {
  const { error } = await db().from('suppliers').delete().eq('id', id)
  if (error) {
    throw friendlyDbError(
      error,
      t('money.ledgerLoadError'),
      t('money.ledgerSupplierDeleteError'),
    )
  }
}

// ---------------------------------------------------------------------------
// المشتريات
// ---------------------------------------------------------------------------

export async function fetchPurchases(teacherId: string): Promise<PurchaseListItem[]> {
  const client = db()
  const [purchasesRes, balancesRes] = await Promise.all([
    client
      .from('purchases')
      .select(`${PURCHASE_COLS}, suppliers(name)`)
      .eq('teacher_id', teacherId)
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false }),
    client.from('purchase_balances').select('*').eq('teacher_id', teacherId),
  ])
  if (purchasesRes.error) throw friendlyDbError(purchasesRes.error, t('money.ledgerLoadError'))
  if (balancesRes.error) throw friendlyDbError(balancesRes.error, t('money.ledgerLoadError'))
  const byId = new Map((balancesRes.data ?? []).map((b) => [b.purchase_id, b]))
  return (purchasesRes.data ?? []).map((row) => {
    const { suppliers, ...purchase } = row
    return {
      ...purchase,
      supplier_name: suppliers?.name ?? null,
      balance: toBalance(byId.get(row.id)),
    }
  })
}

export async function fetchPurchaseDetail(purchaseId: string): Promise<PurchaseDetail> {
  const client = db()
  const [purchaseRes, linesRes, paymentsRes, balanceRes] = await Promise.all([
    client.from('purchases').select(PURCHASE_COLS).eq('id', purchaseId).single(),
    client
      .from('purchase_lines')
      .select('*')
      .eq('purchase_id', purchaseId)
      .order('created_at'),
    client
      .from('purchase_payments')
      .select('*')
      .eq('purchase_id', purchaseId)
      .order('paid_on', { ascending: false })
      .order('created_at', { ascending: false }),
    client.from('purchase_balances').select('*').eq('purchase_id', purchaseId).single(),
  ])
  if (purchaseRes.error) throw friendlyDbError(purchaseRes.error, t('money.ledgerLoadError'))
  if (linesRes.error) throw friendlyDbError(linesRes.error, t('money.ledgerLoadError'))
  if (paymentsRes.error) throw friendlyDbError(paymentsRes.error, t('money.ledgerLoadError'))
  if (balanceRes.error) throw friendlyDbError(balanceRes.error, t('money.ledgerLoadError'))
  return {
    purchase: purchaseRes.data,
    lines: linesRes.data ?? [],
    payments: paymentsRes.data ?? [],
    balance: toBalance(balanceRes.data),
  }
}

export async function createPurchase(
  teacherId: string,
  input: {
    supplierId: string | null
    purchaseDate: string
    note: string | null
    lines: LedgerLine[]
  },
): Promise<void> {
  const { error } = await db().rpc('create_purchase', {
    p_teacher_id: teacherId,
    p_supplier_id: input.supplierId,
    p_purchase_date: input.purchaseDate,
    p_note: input.note,
    p_lines: input.lines.map((l) => ({
      description: l.description.trim(),
      quantity: l.quantity,
      unit_price: l.unit_price,
    })),
  })
  if (error) throw friendlyDbError(error, t('money.ledgerLoadError'))
}

export async function recordPurchasePayment(
  teacherId: string,
  input: {
    purchaseId: string
    amount: number
    method: PaymentMethod
    paidOn: string
    note: string | null
  },
): Promise<void> {
  const { error } = await db().from('purchase_payments').insert({
    teacher_id: teacherId,
    purchase_id: input.purchaseId,
    amount: input.amount,
    method: input.method,
    paid_on: input.paidOn,
    note: input.note,
  })
  if (error) throw friendlyDbError(error, t('money.ledgerLoadError'))
}

export async function deletePurchase(purchaseId: string): Promise<void> {
  const { error } = await db().from('purchases').delete().eq('id', purchaseId)
  if (error) throw friendlyDbError(error, t('money.ledgerLoadError'))
}

// ---------------------------------------------------------------------------
// المبيعات
// ---------------------------------------------------------------------------

export async function fetchSales(teacherId: string): Promise<SaleListItem[]> {
  const client = db()
  const [salesRes, balancesRes] = await Promise.all([
    client
      .from('sales')
      .select(`${SALE_COLS}, students(name)`)
      .eq('teacher_id', teacherId)
      .order('sale_date', { ascending: false })
      .order('created_at', { ascending: false }),
    client.from('sale_balances').select('*').eq('teacher_id', teacherId),
  ])
  if (salesRes.error) throw friendlyDbError(salesRes.error, t('money.ledgerLoadError'))
  if (balancesRes.error) throw friendlyDbError(balancesRes.error, t('money.ledgerLoadError'))
  const byId = new Map((balancesRes.data ?? []).map((b) => [b.sale_id, b]))
  return (salesRes.data ?? []).map((row) => {
    const { students, ...sale } = row
    return {
      ...sale,
      amount_paid: Number(row.amount_paid) || 0,
      student_name: students?.name ?? null,
      balance: toBalance(byId.get(row.id), 0),
    }
  })
}

export async function fetchSaleLines(saleId: string): Promise<SaleLineRow[]> {
  const { data, error } = await db()
    .from('sale_lines')
    .select('*')
    .eq('sale_id', saleId)
    .order('created_at')
  if (error) throw friendlyDbError(error, t('money.ledgerLoadError'))
  return data ?? []
}

export async function createSale(
  teacherId: string,
  input: {
    studentId: string | null
    buyerName: string | null
    saleDate: string
    amountPaid: number
    note: string | null
    lines: LedgerLine[]
  },
): Promise<void> {
  const { error } = await db().rpc('create_sale', {
    p_teacher_id: teacherId,
    p_student_id: input.studentId,
    p_buyer_name: input.buyerName,
    p_sale_date: input.saleDate,
    p_amount_paid: input.amountPaid,
    p_note: input.note,
    p_lines: input.lines.map((l) => ({
      description: l.description.trim(),
      quantity: l.quantity,
      unit_price: l.unit_price,
    })),
  })
  if (error) throw friendlyDbError(error, t('money.ledgerLoadError'))
}

/** تحصيل دفعة لاحقة من بيع آجل: تحديث amount_paid بالقيمة الإجمالية الجديدة */
export async function updateSaleCollected(saleId: string, amountPaid: number): Promise<void> {
  const { error } = await db().from('sales').update({ amount_paid: amountPaid }).eq('id', saleId)
  if (error) throw friendlyDbError(error, t('money.ledgerLoadError'))
}

export async function deleteSale(saleId: string): Promise<void> {
  const { error } = await db().from('sales').delete().eq('id', saleId)
  if (error) throw friendlyDbError(error, t('money.ledgerLoadError'))
}

// ---------------------------------------------------------------------------
// التقارير: مستحقات الموردين + التقرير الشهري الموحّد
// ---------------------------------------------------------------------------

export async function fetchSupplierPayables(teacherId: string): Promise<SupplierPayableRow[]> {
  const { data, error } = await db()
    .from('supplier_payables')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('remaining', { ascending: false })
  if (error) throw friendlyDbError(error, t('money.ledgerLoadError'))
  return data ?? []
}

export async function fetchMonthlyCentreFinance(
  teacherId: string,
): Promise<MonthlyCentreFinanceRow[]> {
  const { data, error } = await db()
    .from('monthly_centre_finance')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('month', { ascending: false })
  if (error) throw friendlyDbError(error, t('money.ledgerLoadError'))
  return (data ?? []).map((row: Tables<'monthly_centre_finance'>) => ({
    teacher_id: row.teacher_id as string,
    month: row.month as string,
    tuition_collected: Number(row.tuition_collected) || 0,
    sales_total: Number(row.sales_total) || 0,
    sales_collected: Number(row.sales_collected) || 0,
    purchases_total: Number(row.purchases_total) || 0,
    purchases_paid: Number(row.purchases_paid) || 0,
    expenses: Number(row.expenses) || 0,
    net_cash: Number(row.net_cash) || 0,
  }))
}
