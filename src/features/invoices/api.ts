import { db } from '../../lib/supabase'
import { formatMoney, waLink } from '../../lib/format'
import type {
  AttendanceStatus,
  GroupRow,
  InvoiceBalanceRow,
  InvoiceLineRow,
  PaymentMethod,
  PaymentRow,
  StudentRow,
} from '../../types/database'
import { monthEndStr, monthStartStr, todayStr } from '../home/api'
import { MONTH_NAMES, ensureSessionsGenerated } from '../schedule/api'
import { isAttended, saveAttendance } from '../attendance/api'
import { fetchGroups } from '../groups/api'
import { logActivity } from '../activity/api'

// ---------------------------------------------------------------------------
// طرق الدفع — enum ‏payment_method في المخطط حرفياً
// ---------------------------------------------------------------------------

export const PAYMENT_METHODS: { code: PaymentMethod; label: string }[] = [
  { code: 'cash', label: 'كاش' },
  { code: 'vodafone_cash', label: 'فودافون كاش' },
  { code: 'instapay', label: 'إنستاباي' },
  { code: 'bank_transfer', label: 'تحويل بنكي' },
]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'كاش',
  vodafone_cash: 'فودافون كاش',
  instapay: 'إنستاباي',
  bank_transfer: 'تحويل بنكي',
}

// ---------------------------------------------------------------------------
// مساعدات الفترة — invoices.period_month هو أول يوم في الشهر 'YYYY-MM-DD'
// ---------------------------------------------------------------------------

/** '2026-11-01' → '2026-11' (صيغة الفترة في المرجع) */
export function periodYm(periodMonth: string): string {
  return periodMonth.slice(0, 7)
}

/** '2026-11-01' → 'نوفمبر 2026' */
export function periodLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split('-').map(Number)
  return `${MONTH_NAMES[(m ?? 1) - 1] ?? ''} ${y ?? ''}`.trim()
}

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

// ---------------------------------------------------------------------------
// القراءات — الفواتير من جدول invoices + أرصدتها من view ‏invoice_balances
// (الإجمالي/المدفوع/المتبقي محسوب في قاعدة البيانات دائماً، لا مخزّن)
// ---------------------------------------------------------------------------

const INVOICE_COLS = 'id, teacher_id, student_id, group_id, period_month, created_at'
const LINE_COLS = 'id, teacher_id, invoice_id, line_type, description, amount, reason, created_at'
const PAY_COLS =
  'id, teacher_id, invoice_id, amount, method, paid_on, receipt_no, reverses_payment_id, voided, created_at'
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
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
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
  return ((data ?? []) as unknown as InvoiceJoinRow[]).map((r) => toListItem(r, balances))
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
  return toListItem(data as unknown as InvoiceJoinRow, balances)
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
  return ((data ?? []) as unknown as InvoiceJoinRow[]).map((r) => toListItem(r, balances))
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
  return ((data ?? []) as unknown as InvoiceLineRow[]).map((r) => ({
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
  return ((data ?? []) as unknown as PaymentRow[]).map((r) => ({
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
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const inv = (row.invoices ?? {}) as {
      period_month?: string
      groups?: { name?: string } | null
    }
    return {
      ...(row as unknown as PaymentRow),
      amount: Number(row.amount) || 0,
      period_month: inv.period_month ?? '',
      group_name: inv.groups?.name ?? '—',
    }
  })
}

// ---------------------------------------------------------------------------
// إصدار الفواتير — المرجع §5.1 + جدول الأنظمة §2.3.
// لا توجد دالة توليد فواتير في المخطط، فالتوليد هنا على العميل فوق جداول
// المخطط، ومنع التكرار مضمون بقيد المخطط الفريد
// (teacher_id, student_id, group_id, period_month) + فحص مسبق + تجاهل 23505،
// فإعادة التشغيل لنفس الشهر آمنة تماماً (idempotent).
// ---------------------------------------------------------------------------

export interface IssueOptions {
  /** أول يوم في الشهر المطلوب 'YYYY-MM-01' */
  periodMonth: string
  /** خصم عام اختياري لكل فاتورة (ج) — يُقصّ عند قيمة البند الأساسي */
  discount: number
  discountNote: string | null
  /** عند التوليد من ملف طالب: يقتصر على هذا الطالب */
  studentId?: string
}

export interface IssueResult {
  created: number
  skipped: number
  total: number
}

interface EnrollmentForBilling {
  student_id: string
  group_id: string
  price_override: number | null
  prepaid_sessions: number | null
}

/** عدد أيام الشهر المطابقة لأيام جدول المجموعة (بديل عند غياب صفوف الحصص) */
export function calendarSessionsInMonth(group: GroupRow, periodMonth: string): number {
  const [y, m] = periodMonth.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  let count = 0
  for (let d = 1; d <= daysInMonth; d++) {
    if (group.days.includes(new Date(y, m - 1, d).getDay())) count += 1
  }
  return count
}

export interface BaseChargeInput {
  billingType: GroupRow['billing_type']
  /** السعر الفعّال: السعر الخاص في التسجيل وإلا سعر المجموعة (المرجع §5.1) */
  price: number
  /** صيغة الفترة 'YYYY-MM' — تدخل في نصوص البنود */
  ym: string
  /** كمية «مدفوعة مسبقاً» بعد حلّها (تسجيل ← حصص الشهر ← بديل تقويمي) */
  prepaidQty: number
  /** عدد مرات الحضور الفعلي (p/l/m) — لنظام per_session_attended */
  attendedCount: number
}

export interface BaseCharge {
  amount: number
  desc: string
}

/**
 * البند الأساسي لفاتورة (طالب × مجموعة × شهر) بحسب نظام فوترة المجموعة —
 * جدول الأنظمة §2.3. دالة نقية مستخرجة حرفياً من generateInvoices (موجة
 * W2) حتى تُختبَر الأنظمة الأربعة بلا قاعدة بيانات؛ المدخلات المحسوبة من
 * الجداول (الكمية/الحضور) تُمرَّر جاهزة.
 */
export function baseChargeFor(input: BaseChargeInput): BaseCharge {
  const { price, ym } = input
  switch (input.billingType) {
    case 'monthly_fixed':
      return { amount: price, desc: `اشتراك ${ym}` }
    case 'weekly_package':
      return { amount: 4 * price, desc: `باقة شهر ${ym} (4 أسابيع)` }
    case 'per_session_prepaid':
      return {
        amount: input.prepaidQty * price,
        desc: `${input.prepaidQty} حصة مدفوعة مسبقاً`,
      }
    case 'per_session_attended':
      return {
        amount: input.attendedCount * price,
        desc: `حصص حضرها (${input.attendedCount})`,
      }
  }
}

/** مبلغ الخصم الفعلي: لا يتجاوز قيمة البند الأساسي أبداً ولا ينزل تحت صفر */
export function clampedDiscount(discount: number, baseAmount: number): number {
  return Math.min(discount, Math.max(baseAmount, 0))
}

export async function generateInvoices(
  teacherId: string,
  opts: IssueOptions,
): Promise<IssueResult> {
  const period = monthStartStr(opts.periodMonth)
  const periodEnd = monthEndStr(period)
  const ym = periodYm(period)
  const today = todayStr()
  const supa = db()

  const groups = await fetchGroups(teacherId)
  const groupById = new Map(groups.map((g) => [g.id, g]))

  // نضمن حصص الشهر مولّدة (لازمة لعدّ حصص «مدفوعة مسبقاً» و«حسب الحضور»)؛
  // فشل التوليد لا يوقف الإصدار — نكمل بما في الجداول مع بديل تقويمي للباقات.
  try {
    await ensureSessionsGenerated(teacherId, groups, [period])
  } catch {
    // نتابع: العدّادات أدناه لها بدائل آمنة
  }

  // التسجيلات الفعّالة: طالب غير موقوف ومسجل في المجموعة (studentsOf في المرجع)
  let enrQuery = supa
    .from('enrollments')
    .select(
      'student_id, group_id, price_override, prepaid_sessions, students!inner(paused)',
    )
    .eq('teacher_id', teacherId)
    .eq('students.paused', false)
  if (opts.studentId) enrQuery = enrQuery.eq('student_id', opts.studentId)
  const { data: enrData, error: enrErr } = await enrQuery
  if (enrErr) throw enrErr
  const enrollments = (enrData ?? []) as unknown as EnrollmentForBilling[]

  // الفحص المسبق لمنع التكرار: فواتير الفترة القائمة
  const { data: existing, error: exErr } = await supa
    .from('invoices')
    .select('student_id, group_id')
    .eq('teacher_id', teacherId)
    .eq('period_month', period)
  if (exErr) throw exErr
  const existingKeys = new Set(
    ((existing ?? []) as { student_id: string; group_id: string }[]).map(
      (r) => `${r.student_id}|${r.group_id}`,
    ),
  )

  // عدّاد الحضور الفعلي (p/l/m) لحصص الشهر حتى اليوم — لنظام per_session_attended
  const attendedCount = new Map<string, number>()
  if (enrollments.some((e) => groupById.get(e.group_id)?.billing_type === 'per_session_attended')) {
    const upper = periodEnd < today ? periodEnd : today
    if (upper >= period) {
      const { data, error } = await supa
        .from('attendance')
        .select('student_id, sessions!inner(group_id, session_date)')
        .eq('teacher_id', teacherId)
        .in('status', ['p', 'l', 'm'])
        .gte('sessions.session_date', period)
        .lte('sessions.session_date', upper)
      if (error) throw error
      for (const row of (data ?? []) as unknown as {
        student_id: string
        sessions: { group_id: string }
      }[]) {
        const key = `${row.student_id}|${row.sessions.group_id}`
        attendedCount.set(key, (attendedCount.get(key) ?? 0) + 1)
      }
    }
  }

  // عدّاد حصص الشهر المجدولة لكل مجموعة — لنظام per_session_prepaid عند غياب
  // prepaid_sessions على التسجيل (qty = عدد حصص الشهر في المرجع §2.3)
  const monthSessionCount = new Map<string, number>()
  const prepaidGroupIds = [
    ...new Set(
      enrollments
        .filter(
          (e) =>
            groupById.get(e.group_id)?.billing_type === 'per_session_prepaid' &&
            e.prepaid_sessions == null,
        )
        .map((e) => e.group_id),
    ),
  ]
  if (prepaidGroupIds.length > 0) {
    const { data, error } = await supa
      .from('sessions')
      .select('group_id')
      .eq('teacher_id', teacherId)
      .in('group_id', prepaidGroupIds)
      .gte('session_date', period)
      .lte('session_date', periodEnd)
      .eq('status', 'scheduled')
    if (error) throw error
    for (const row of (data ?? []) as { group_id: string }[]) {
      monthSessionCount.set(row.group_id, (monthSessionCount.get(row.group_id) ?? 0) + 1)
    }
  }

  let skipped = 0

  // بناء كل الفواتير وبنودها محلياً أولاً — لا أي طلب شبكة داخل الحلقة
  // (أداء 3A-296: كان الإصدار يرسل طلبين لكل تسجيل: فاتورة ثم بنودها).
  interface PlannedLine {
    line_type: 'base' | 'discount'
    description: string
    amount: number
    reason: string | null
  }
  interface PlannedInvoice {
    studentId: string
    groupId: string
    lines: PlannedLine[]
  }
  const planned: PlannedInvoice[] = []

  for (const e of enrollments) {
    const group = groupById.get(e.group_id)
    if (!group) continue
    const key = `${e.student_id}|${e.group_id}`
    if (existingKeys.has(key)) {
      skipped += 1
      continue
    }

    // السعر الفعّال: السعر الخاص في التسجيل وإلا سعر المجموعة (المرجع §5.1)
    const price = e.price_override ?? group.price
    // كمية «مدفوعة مسبقاً»: من التسجيل، وإلا عدد حصص الشهر المجدولة،
    // وإلا البديل التقويمي — بنفس ترتيب الحلّ الأصلي حرفياً
    const prepaidQty =
      e.prepaid_sessions ??
      (monthSessionCount.get(e.group_id) || calendarSessionsInMonth(group, period))
    const { amount: baseAmount, desc: baseDesc } = baseChargeFor({
      billingType: group.billing_type,
      price,
      ym,
      prepaidQty,
      attendedCount: attendedCount.get(key) ?? 0,
    })

    const lines: PlannedLine[] = [
      { line_type: 'base', description: baseDesc, amount: baseAmount, reason: null },
    ]
    // الخصم العام (المرجع §5.1): بند سالب لا يتجاوز قيمة البند الأساسي أبداً
    if (opts.discount > 0) {
      const discAmt = clampedDiscount(opts.discount, baseAmount)
      if (discAmt > 0) {
        lines.push({
          line_type: 'discount',
          description: `خصم (${opts.discountNote?.trim() ? opts.discountNote.trim() : 'خصم خاص'})`,
          amount: -discAmt,
          reason: opts.discountNote?.trim() ? opts.discountNote.trim() : null,
        })
      }
    }
    planned.push({ studentId: e.student_id, groupId: e.group_id, lines })
  }

  // الإدراج الجماعي: طلب واحد للفواتير + طلب واحد لكل البنود.
  // فشل البنود يعوّض بحذف الفواتير المدرجة (لا فاتورة بلا بنود)، وفشل
  // القيد الفريد (سباق نادر: فاتورة أُنشئت بين الفحص والإدراج) يهبط بنا
  // للمسار الفردي لعزل المتعارض وعدّه متخطّى — نفس الدلالات الأصلية.
  let created = 0
  if (planned.length > 0) {
    const insertLinesFor = async (invoiceIdByKey: Map<string, string>) => {
      const allLines = planned.flatMap((p) =>
        p.lines.map((l) => ({
          teacher_id: teacherId,
          invoice_id: invoiceIdByKey.get(`${p.studentId}|${p.groupId}`)!,
          line_type: l.line_type,
          description: l.description,
          amount: l.amount,
          reason: l.reason,
        })),
      )
      const { error } = await supa.from('invoice_lines').insert(allLines)
      if (error) throw error
    }
    try {
      const { data: inserted, error: bulkErr } = await supa
        .from('invoices')
        .insert(
          planned.map((p) => ({
            teacher_id: teacherId,
            student_id: p.studentId,
            group_id: p.groupId,
            period_month: period,
          })),
        )
        .select('id, student_id, group_id')
      if (bulkErr) throw bulkErr
      const idByKey = new Map(
        ((inserted ?? []) as unknown as { id: string; student_id: string; group_id: string }[]).map(
          (r) => [`${r.student_id}|${r.group_id}`, r.id] as const,
        ),
      )
      try {
        await insertLinesFor(idByKey)
      } catch (lineErr) {
        await supa
          .from('invoices')
          .delete()
          .eq('teacher_id', teacherId)
          .in('id', [...idByKey.values()])
        throw lineErr
      }
      created = planned.length
    } catch (bulkFailure) {
      if ((bulkFailure as { code?: string }).code !== '23505') throw bulkFailure
      // مسار فردي احتياطي عند سباق القيد الفريد فقط
      for (const p of planned) {
        const { data: inv, error: invErr } = await supa
          .from('invoices')
          .insert({
            teacher_id: teacherId,
            student_id: p.studentId,
            group_id: p.groupId,
            period_month: period,
          })
          .select('id')
          .single()
        if (invErr) {
          if ((invErr as { code?: string }).code === '23505') {
            skipped += 1
            continue
          }
          throw invErr
        }
        const invoiceId = (inv as unknown as { id: string }).id
        const { error: lineErr } = await supa.from('invoice_lines').insert(
          p.lines.map((l) => ({
            teacher_id: teacherId,
            invoice_id: invoiceId,
            line_type: l.line_type,
            description: l.description,
            amount: l.amount,
            reason: l.reason,
          })),
        )
        if (lineErr) {
          await supa.from('invoices').delete().eq('teacher_id', teacherId).eq('id', invoiceId)
          throw lineErr
        }
        created += 1
      }
    }
  }

  // سجل النشاط: حدث واحد للتوليد كله (أو فاتورة فردية عند استهداف طالب
  // واحد) — لا يُسجَّل توليد لم ينشئ شيئاً. Fail-safe: لا يكسر الإصدار.
  if (created > 0) {
    void logActivity(teacherId, {
      event_type: opts.studentId ? 'invoice_created' : 'invoices_generated',
      entity_type: 'invoice_batch',
      entity_label: periodLabel(period),
      details: {
        period,
        period_label: periodLabel(period),
        created,
        skipped,
        total: enrollments.length,
        ...(opts.studentId ? { student_id: opts.studentId } : {}),
      },
    })
  }

  return { created, skipped, total: enrollments.length }
}

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
  if (!(input.amount > 0)) throw new Error('مبلغ الدفعة لازم يكون أكبر من صفر')
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
  if (error) throw error
  const row = data as unknown as PaymentRow
  const payment = { ...row, amount: Number(row.amount) || 0 }
  // سجل النشاط: إنشاء دفعة (يشمل الدفعة التي ينشئها اعتماد إثبات دفع —
  // حدث الاعتماد نفسه يُسجَّل منفصلاً من وحدة الإثباتات)
  void logActivity(teacherId, {
    event_type: 'payment_created',
    entity_type: 'payment',
    entity_id: payment.id,
    entity_label: `إيصال ${payment.receipt_no}`,
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
  if (error) throw error

  const { error: markErr } = await db()
    .from('payments')
    .update({ voided: true })
    .eq('teacher_id', teacherId)
    .eq('id', payment.id)
  if (markErr) throw markErr

  const row = data as unknown as PaymentRow
  const reversal = { ...row, amount: Number(row.amount) || 0 }
  // سجل النشاط: عكس الدفعة هو «حذف/إبطال» الدفعات في هذا النظام (لا حذف
  // فعلي للدفتر أبداً) — يُسجَّل باسم الأصلية المعكوسة ومبلغها الأصلي.
  void logActivity(teacherId, {
    event_type: 'payment_voided',
    entity_type: 'payment',
    entity_id: payment.id,
    entity_label: `إيصال ${payment.receipt_no}`,
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

// ---------------------------------------------------------------------------
// تسوية حضور — لفواتير per_session_attended فقط (المرجع §5.3):
// تغيير حالة الحضور لا يعدّل البند الأساسي؛ الفرق × السعر الفعّال يُضاف
// كبند تسوية (line_type='adjustment') بسبب إلزامي، والحالة تُحدَّث فعلياً.
// ---------------------------------------------------------------------------

export interface InvoiceMonthSession {
  session_id: string
  session_date: string
  start_time: string
  status: AttendanceStatus | null
  homework_done: boolean
  starred: boolean
}

export async function fetchInvoiceMonthAttendance(
  teacherId: string,
  invoice: { student_id: string; group_id: string; period_month: string },
): Promise<InvoiceMonthSession[]> {
  const period = monthStartStr(invoice.period_month)
  const periodEnd = monthEndStr(period)
  const today = todayStr()
  const upper = periodEnd < today ? periodEnd : today
  if (upper < period) return []

  const { data: sess, error: sessErr } = await db()
    .from('sessions')
    .select('id, session_date, start_time')
    .eq('teacher_id', teacherId)
    .eq('group_id', invoice.group_id)
    .gte('session_date', period)
    .lte('session_date', upper)
    .order('session_date', { ascending: true })
    .order('start_time', { ascending: true })
  if (sessErr) throw sessErr
  const sessions = (sess ?? []) as unknown as {
    id: string
    session_date: string
    start_time: string
  }[]
  if (sessions.length === 0) return []

  const { data: att, error: attErr } = await db()
    .from('attendance')
    .select('session_id, status, homework_done, starred')
    .eq('teacher_id', teacherId)
    .eq('student_id', invoice.student_id)
    .in(
      'session_id',
      sessions.map((s) => s.id),
    )
  if (attErr) throw attErr
  const bySession = new Map(
    ((att ?? []) as unknown as {
      session_id: string
      status: AttendanceStatus | null
      homework_done: boolean
      starred: boolean
    }[]).map((a) => [a.session_id, a]),
  )
  return sessions.map((s) => {
    const a = bySession.get(s.id)
    return {
      session_id: s.id,
      session_date: s.session_date,
      start_time: s.start_time,
      status: a?.status ?? null,
      homework_done: a?.homework_done ?? false,
      starred: a?.starred ?? false,
    }
  })
}

export async function applyAttendanceAdjustment(
  teacherId: string,
  invoice: InvoiceListItem,
  session: InvoiceMonthSession,
  newStatus: AttendanceStatus,
  reason: string,
): Promise<{ delta: number }> {
  const trimmed = reason.trim()
  if (!trimmed) throw new Error('سبب التسوية إلزامي')

  // السعر الفعّال من التسجيل (price_override وإلا سعر المجموعة)
  const { data: enr, error: enrErr } = await db()
    .from('enrollments')
    .select('price_override, groups(price)')
    .eq('teacher_id', teacherId)
    .eq('student_id', invoice.student_id)
    .eq('group_id', invoice.group_id)
    .maybeSingle()
  if (enrErr) throw enrErr
  const enrRow = enr as unknown as {
    price_override: number | null
    groups: { price?: number | string } | null
  } | null
  const price = enrRow?.price_override ?? Number(enrRow?.groups?.price ?? 0)

  const delta =
    (isAttended(newStatus) ? 1 : 0) - (isAttended(session.status) ? 1 : 0)
  const deltaAmount = delta * price

  // تحديث حالة الحضور نفسها (مع الحفاظ على الواجب والتمييز)
  await saveAttendance(teacherId, session.session_id, invoice.student_id, {
    status: newStatus,
    homework_done: session.homework_done,
    starred: session.starred,
  })

  if (deltaAmount !== 0) {
    const { error } = await db().from('invoice_lines').insert({
      teacher_id: teacherId,
      invoice_id: invoice.invoice_id,
      line_type: 'adjustment',
      description: `تسوية حصة ${session.session_date}`,
      amount: deltaAmount,
      reason: trimmed,
    })
    if (error) throw error
  }
  return { delta: deltaAmount }
}

// ---------------------------------------------------------------------------
// الإيصال — بيانات العرض ورسالة واتساب (المرجع §3.6 + §5.6)
// ---------------------------------------------------------------------------

export async function fetchTeacherDisplayName(teacherId: string): Promise<string> {
  const { data, error } = await db()
    .from('teachers')
    .select('display_name')
    .eq('id', teacherId)
    .maybeSingle()
  if (error) throw error
  return ((data as unknown as { display_name?: string } | null)?.display_name ?? '').trim()
}

export async function fetchWhatsappTemplate(teacherId: string): Promise<string | null> {
  const { data, error } = await db()
    .from('teacher_settings')
    .select('whatsapp_template')
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (error) throw error
  const tpl = (data as unknown as { whatsapp_template?: string } | null)?.whatsapp_template
  return tpl?.trim() ? tpl : null
}

export const DEFAULT_WA_TEMPLATE =
  'أهلاً {guardian}، إيصال الطالب {name} عن {period}: المدفوع {paid} من {total}، والمتبقي {balance}. شكراً لك.'

/** تعويض متغيرات قالب الإيصال (المرجع §5.6) — {period} بصيغة YYYY-MM */
export function buildReceiptMessage(
  template: string,
  vars: {
    guardian: string
    name: string
    periodMonth: string
    paid: number
    total: number
    balance: number
  },
): string {
  return template
    .replaceAll('{guardian}', vars.guardian)
    .replaceAll('{name}', vars.name)
    .replaceAll('{period}', periodYm(vars.periodMonth))
    .replaceAll('{paid}', formatMoney(vars.paid))
    .replaceAll('{total}', formatMoney(vars.total))
    .replaceAll('{balance}', formatMoney(vars.balance))
}

/** رابط إرسال الإيصال عبر واتساب لولي الأمر (guardian_phone وإلا phone) */
export function receiptWaUrl(
  student: Pick<StudentRow, 'guardian_phone' | 'phone'>,
  message: string,
): string | null {
  const base = waLink(student.guardian_phone ?? student.phone)
  if (!base) return null
  return `${base}?text=${encodeURIComponent(message)}`
}
