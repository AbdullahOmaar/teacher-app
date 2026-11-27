// ===========================================================================
// الفواتير — القراءات: جلب الفواتير وبنودها ودفعاتها من الجداول وview
// الأرصدة. (فُصل من api.ts — برنامج الكود النظيف 2026-11-27، نمط COD-2)
// ===========================================================================

import { db } from '../../lib/supabase'
import type { InvoiceBalanceRow, InvoiceLineRow, PaymentRow } from '../../types/database'
import { PAY_COLS } from './apiShared'

// ---------------------------------------------------------------------------
// القراءات — الفواتير من جدول invoices + أرصدتها من view ‏invoice_balances
// (الإجمالي/المدفوع/المتبقي محسوب في قاعدة البيانات دائماً، لا مخزّن)
// ---------------------------------------------------------------------------

const INVOICE_COLS = 'id, teacher_id, student_id, group_id, period_month, created_at'
const LINE_COLS = 'id, teacher_id, invoice_id, line_type, description, amount, reason, created_at'
const BALANCE_COLS =
  'invoice_id, teacher_id, student_id, group_id, period_month, total, paid, balance, is_paid'

export interface InvoiceListItem extends InvoiceBalanceRow {
  created_at: string
  student_name: string
  student_code: string
  group_name: string
}

function toBalance(row: Record<string, unknown>): InvoiceBalanceRow {
  return {
    invoice_id: row.invoice_id as string,
    teacher_id: row.teacher_id as string,
    student_id: row.student_id as string,
    group_id: row.group_id as string,
    period_month: row.period_month as string,
    total: Number(row.total) || 0,
    paid: Number(row.paid) || 0,
    balance: Number(row.balance) || 0,
    is_paid: Boolean(row.is_paid),
  }
}

async function fetchBalancesByInvoice(teacherId: string): Promise<Map<string, InvoiceBalanceRow>> {
  const { data, error } = await db()
    .from('invoice_balances')
    .select(BALANCE_COLS)
    .eq('teacher_id', teacherId)
  if (error) throw error
  const map = new Map<string, InvoiceBalanceRow>()
  for (const row of data ?? []) {
    const b = toBalance(row)
    map.set(b.invoice_id, b)
  }
  return map
}

interface InvoiceJoinRow {
  id: string
  teacher_id: string
  student_id: string
  group_id: string
  period_month: string
  created_at: string
  students: { name?: string; public_code?: string } | null
  groups: { name?: string } | null
}

function toListItem(row: InvoiceJoinRow, balances: Map<string, InvoiceBalanceRow>): InvoiceListItem {
  const b = balances.get(row.id) ?? {
    invoice_id: row.id,
    teacher_id: row.teacher_id,
    student_id: row.student_id,
    group_id: row.group_id,
    period_month: row.period_month,
    total: 0,
    paid: 0,
    balance: 0,
    is_paid: true,
  }
  return {
    ...b,
    created_at: row.created_at,
    student_name: row.students?.name ?? '—',
    student_code: row.students?.public_code ?? '',
    group_name: row.groups?.name ?? '—',
  }
}

/** كل فواتير المدرس — الأحدث أولاً (الفترة ثم تاريخ الإنشاء) */
export async function fetchInvoices(teacherId: string): Promise<InvoiceListItem[]> {
  const { data, error } = await db()
    .from('invoices')
    .select(`${INVOICE_COLS}, students(name, public_code), groups(name)`)
    .eq('teacher_id', teacherId)
    .order('period_month', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  const balances = await fetchBalancesByInvoice(teacherId)
  return (data ?? []).map((r) => toListItem(r, balances))
}

/** فاتورة واحدة مع رصيدها وأسماء الطالب والمجموعة */
export async function fetchInvoice(
  teacherId: string,
  invoiceId: string,
): Promise<InvoiceListItem | null> {
  const { data, error } = await db()
    .from('invoices')
    .select(`${INVOICE_COLS}, students(name, public_code), groups(name)`)
    .eq('teacher_id', teacherId)
    .eq('id', invoiceId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const balances = await fetchBalancesByInvoice(teacherId)
  return toListItem(data, balances)
}

/** فواتير طالب واحد — لتبويب المدفوعات في ملفه */
export async function fetchStudentInvoices(
  teacherId: string,
  studentId: string,
): Promise<InvoiceListItem[]> {
  const { data, error } = await db()
    .from('invoices')
    .select(`${INVOICE_COLS}, students(name, public_code), groups(name)`)
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
    .order('period_month', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  const balances = await fetchBalancesByInvoice(teacherId)
  return (data ?? []).map((r) => toListItem(r, balances))
}

export async function fetchInvoiceLines(
  teacherId: string,
  invoiceId: string,
): Promise<InvoiceLineRow[]> {
  const { data, error } = await db()
    .from('invoice_lines')
    .select(LINE_COLS)
    .eq('teacher_id', teacherId)
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({
    ...r,
    amount: Number(r.amount) || 0,
  }))
}

export async function fetchInvoicePayments(
  teacherId: string,
  invoiceId: string,
): Promise<PaymentRow[]> {
  const { data, error } = await db()
    .from('payments')
    .select(PAY_COLS)
    .eq('teacher_id', teacherId)
    .eq('invoice_id', invoiceId)
    .order('paid_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    ...r,
    amount: Number(r.amount) || 0,
  }))
}

export interface StudentPaymentItem extends PaymentRow {
  period_month: string
  group_name: string
}

/** كل دفعات طالب عبر فواتيره — لتبويب المدفوعات في ملفه */
export async function fetchStudentPayments(
  teacherId: string,
  studentId: string,
): Promise<StudentPaymentItem[]> {
  const { data, error } = await db()
    .from('payments')
    .select(`${PAY_COLS}, invoices!inner(student_id, period_month, groups(name))`)
    .eq('teacher_id', teacherId)
    .eq('invoices.student_id', studentId)
    .order('paid_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => {
    const { invoices: inv, ...pay } = row
    return {
      ...pay,
      amount: Number(row.amount) || 0,
      period_month: inv.period_month ?? '',
      group_name: inv.groups?.name ?? '—',
    }
  })
}
