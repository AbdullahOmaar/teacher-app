import { db } from '../../lib/supabase'
import type {
  ExpenseInput,
  ExpenseRow,
  MonthlyProfitRow,
  RecurringExpenseInput,
  RecurringExpenseRow,
} from '../../types/database'
import { monthEndStr, monthStartStr } from '../home/api'

// ---------------------------------------------------------------------------
// فئات المصروفات — قيد المخطط على expenses.category و recurring_expenses.category
// حرفياً، وهي نفس EXP_CATS في المرجع (§1): لا فئات حرة أبداً.
// ---------------------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  'إيجار قاعات',
  'طباعة وتصوير',
  'رواتب مساعدين',
  'أدوات',
  'أخرى',
] as const

// ---------------------------------------------------------------------------
// تعريفات مالية — مصدرها الوحيد view ‏monthly_profit في المخطط (0001_init.sql)
// مطابقاً للمرجع §3.12 حرفياً:
//
// • المحصّل (collected) = مجموع payments.amount في الشهر حسب paid_on
//   (يشمل الدفعات العكسية السالبة — دفتر الدفعات كما هو).
// • المصروفات (expenses) = مجموع expenses.amount في الشهر حسب expense_date.
// • نسبة السنتر (center_share_amount) = المحصّل × teacher_settings.
//   center_share_percent ÷ 100 — أي نسبة % من «محصّل الشهر» نفسه كما في
//   بطاقة نسبة السنتر في المرجع («النسبة % وقيمة الخصم من محصّل الشهر»).
//   لا توجد في المخطط أي علاقة بين مجموعة وسنتر (لا عمود مركز/مكان مالي
//   على groups)، فالنسبة عامة على كل المحصّل لا على فواتير مجموعات بعينها.
// • صافي الربح (net_profit) = المحصّل − المصروفات − نسبة السنتر.
//
// الشاشة تقرأ هذه الأرقام من الـ view ولا تعيد حسابها محلياً، فلا يمكن أن
// تختلف عن تعريف قاعدة البيانات أبداً.
// ---------------------------------------------------------------------------

const PROFIT_COLS = 'teacher_id, month, collected, expenses, center_share_amount, net_profit'
const EXPENSE_COLS = 'id, teacher_id, expense_date, category, amount, note, created_at'
const RECURRING_COLS = 'id, teacher_id, category, amount, note, created_at, updated_at'

function toProfit(row: Record<string, unknown>): MonthlyProfitRow {
  return {
    teacher_id: row.teacher_id as string,
    month: row.month as string,
    collected: Number(row.collected) || 0,
    expenses: Number(row.expenses) || 0,
    center_share_amount: Number(row.center_share_amount) || 0,
    net_profit: Number(row.net_profit) || 0,
  }
}

function toExpense(row: Record<string, unknown>): ExpenseRow {
  return { ...(row as unknown as ExpenseRow), amount: Number(row.amount) || 0 }
}

function toRecurring(row: Record<string, unknown>): RecurringExpenseRow {
  return { ...(row as unknown as RecurringExpenseRow), amount: Number(row.amount) || 0 }
}

/** كل صفوف ملخص الأرباح الشهرية للمدرس من view ‏monthly_profit — الأحدث أولاً */
export async function fetchMonthlyProfit(teacherId: string): Promise<MonthlyProfitRow[]> {
  const { data, error } = await db()
    .from('monthly_profit')
    .select(PROFIT_COLS)
    .eq('teacher_id', teacherId)
    .order('month', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toProfit)
}

/**
 * نسبة السنتر % من teacher_settings.center_share_percent (صف الإعدادات قد لا
 * يوجد بعد — عندها النسبة 0 كما هو افتراضي المخطط، والـ view يعامل غياب
 * الصف بنفس الطريقة عبر coalesce).
 */
export async function fetchCenterSharePercent(teacherId: string): Promise<number> {
  const { data, error } = await db()
    .from('teacher_settings')
    .select('center_share_percent')
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (error) throw error
  const v = (data as unknown as { center_share_percent?: number | string } | null)
    ?.center_share_percent
  return Number(v) || 0
}

export interface MonthSummary {
  /** أول يوم في الشهر 'YYYY-MM-DD' */
  month: string
  collected: number
  expenses: number
  center_share_amount: number
  net_profit: number
}

const ZERO_SUMMARY = { collected: 0, expenses: 0, center_share_amount: 0, net_profit: 0 }

/** ملخص شهر واحد من صفوف الـ view — غياب الصف يعني شهر بلا حركة مالية (أصفار) */
export function summaryOf(rows: MonthlyProfitRow[], monthStart: string): MonthSummary {
  const row = rows.find((r) => r.month === monthStart)
  return row ? { ...row } : { month: monthStart, ...ZERO_SUMMARY }
}

/**
 * آخر 6 شهور تقويمية منتهية بشهر المرساة (شاملاً): صف الـ view إن وُجد،
 * وأصفار صادقة للشهور بلا حركة (الـ view نفسه لا يولّد صفوفاً إلا للشهور
 * ذات الدفعات أو المصروفات). مرتّبة من الأقدم للأحدث لعرض الأشرطة.
 */
export function lastSixMonths(rows: MonthlyProfitRow[], anchorMonthStart: string): MonthSummary[] {
  const out: MonthSummary[] = []
  const [y, m] = anchorMonthStart.split('-').map(Number)
  for (let back = 5; back >= 0; back--) {
    const d = new Date(y, m - 1 - back, 1)
    const start = monthStartStr(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
    )
    out.push(summaryOf(rows, start))
  }
  return out
}

// ---------------------------------------------------------------------------
// المصروفات الفعلية — جدول expenses (expense_date / category / amount / note)
// ---------------------------------------------------------------------------

/** مصروفات شهر واحد (حسب expense_date داخل الشهر) — الأحدث أولاً */
export async function fetchMonthExpenses(
  teacherId: string,
  monthStart: string,
): Promise<ExpenseRow[]> {
  const start = monthStartStr(monthStart)
  const end = monthEndStr(start)
  const { data, error } = await db()
    .from('expenses')
    .select(EXPENSE_COLS)
    .eq('teacher_id', teacherId)
    .gte('expense_date', start)
    .lte('expense_date', end)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toExpense)
}

export async function createExpense(
  teacherId: string,
  input: ExpenseInput,
): Promise<ExpenseRow> {
  if (!(input.amount > 0)) throw new Error('مبلغ المصروف لازم يكون أكبر من صفر')
  const { data, error } = await db()
    .from('expenses')
    .insert({ teacher_id: teacherId, ...input })
    .select(EXPENSE_COLS)
    .single()
  if (error) throw error
  return toExpense(data as unknown as Record<string, unknown>)
}

export async function updateExpense(
  teacherId: string,
  expenseId: string,
  input: ExpenseInput,
): Promise<ExpenseRow> {
  if (!(input.amount > 0)) throw new Error('مبلغ المصروف لازم يكون أكبر من صفر')
  const { data, error } = await db()
    .from('expenses')
    .update(input)
    .eq('teacher_id', teacherId)
    .eq('id', expenseId)
    .select(EXPENSE_COLS)
    .single()
  if (error) throw error
  return toExpense(data as unknown as Record<string, unknown>)
}

/** حذف مصروف — فوري بلا تأكيد كما في المرجع (§5.10: حذف مصروف فوري) */
export async function deleteExpense(teacherId: string, expenseId: string): Promise<void> {
  const { error } = await db()
    .from('expenses')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('id', expenseId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// المصروفات المتكررة — قوالب recurring_expenses (category / amount / note).
//
// انحرافات المخطط الموثّقة (لا تعديل على المخطط مسموح في هذه الخطوة):
// • لا يوجد عمود تفعيل/إيقاف (is_active) ولا يوم استحقاق شهري ولا دالة
//   توليد في المخطط، فـ«الإيقاف» عملياً = حذف القالب، ولا توليد تلقائي.
// • آلية التطبيق هي آلية المرجع نفسها (§3.12): زر «إضافة الثوابت (N)»
//   يطبّق قوالب الشهر المعروض يدوياً عند ضغط المدرس — لا عند فتح الشاشة
//   بصمت، حتى يبقى المدرس متحكماً في شهر التطبيق وتاريخه.
// • تاريخ المصروف المولّد = أول يوم في الشهر المطبّق عليه (لا يوم استحقاق
//   في القالب يفرض غير ذلك).
// • منع التكرار (idempotent): لا يوجد عمود ربط (recurring_id) على expenses
//   ولا علامة «طُبّق في شهر كذا»، فمفتاح الازدواج هو (الشهر + الفئة +
//   المبلغ + الملحوظة بعد قصّ الفراغات): قالب سبق تطبيقه في نفس الشهر —
//   أو مصروف يدوي مطابق تماماً — يُتخطى ولا يُكرَّر أبداً عند إعادة الضغط.
//   حدّ معروف: تعديل مبلغ/ملحوظة قالب بعد تطبيقه يجعله يبدو جديداً في نفس
//   الشهر عند إعادة التطبيق؛ وحذف مصروف مطبّق ثم إعادة التطبيق يعيد إنشاءه.
// ---------------------------------------------------------------------------

export async function fetchRecurringExpenses(
  teacherId: string,
): Promise<RecurringExpenseRow[]> {
  const { data, error } = await db()
    .from('recurring_expenses')
    .select(RECURRING_COLS)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toRecurring)
}

export async function createRecurringExpense(
  teacherId: string,
  input: RecurringExpenseInput,
): Promise<RecurringExpenseRow> {
  if (!(input.amount > 0)) throw new Error('مبلغ المصروف الثابت لازم يكون أكبر من صفر')
  const { data, error } = await db()
    .from('recurring_expenses')
    .insert({ teacher_id: teacherId, ...input })
    .select(RECURRING_COLS)
    .single()
  if (error) throw error
  return toRecurring(data as unknown as Record<string, unknown>)
}

export async function updateRecurringExpense(
  teacherId: string,
  recurringId: string,
  input: RecurringExpenseInput,
): Promise<RecurringExpenseRow> {
  if (!(input.amount > 0)) throw new Error('مبلغ المصروف الثابت لازم يكون أكبر من صفر')
  const { data, error } = await db()
    .from('recurring_expenses')
    .update(input)
    .eq('teacher_id', teacherId)
    .eq('id', recurringId)
    .select(RECURRING_COLS)
    .single()
  if (error) throw error
  return toRecurring(data as unknown as Record<string, unknown>)
}

export async function deleteRecurringExpense(
  teacherId: string,
  recurringId: string,
): Promise<void> {
  const { error } = await db()
    .from('recurring_expenses')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('id', recurringId)
  if (error) throw error
}

export interface ApplyRecurringResult {
  created: number
  skipped: number
  total: number
}

function dedupeKey(category: string, amount: number, note: string | null): string {
  return `${category}|${amount}|${(note ?? '').trim()}`
}

/**
 * تطبيق القوالب الثابتة على شهر (المرجع §3.12 ‏apply-recurring-exp):
 * يُنشئ مصروفاً فعلياً بتاريخ أول الشهر لكل قالب غير مطبّق فيه بعد،
 * ويتخطى المطابق القائم — فإعادة التطبيق على نفس الشهر آمنة دائماً.
 */
export async function applyRecurringExpenses(
  teacherId: string,
  monthStart: string,
  templates: RecurringExpenseRow[],
): Promise<ApplyRecurringResult> {
  const start = monthStartStr(monthStart)
  const existing = await fetchMonthExpenses(teacherId, start)
  const seen = new Set(existing.map((e) => dedupeKey(e.category, e.amount, e.note)))

  let created = 0
  let skipped = 0
  for (const t of templates) {
    const key = dedupeKey(t.category, t.amount, t.note)
    if (seen.has(key)) {
      skipped += 1
      continue
    }
    await createExpense(teacherId, {
      expense_date: start,
      category: t.category,
      amount: t.amount,
      note: t.note,
    })
    seen.add(key)
    created += 1
  }
  return { created, skipped, total: templates.length }
}
