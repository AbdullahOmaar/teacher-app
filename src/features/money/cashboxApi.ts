import { supabase } from '../../lib/supabase'
import type {
  DailyClosingInput,
  DailyClosingRow,
  PaymentMethod,
} from '../../types/database'
import { logActivity } from '../activity/api'

function db() {
  if (!supabase) throw new Error('Supabase غير مربوط — راجع إعدادات .env')
  return supabase
}

// ---------------------------------------------------------------------------
// الإغلاق اليومي للخزنة (Phase 2 — الخطوة 5) — طبقة فوق الدفعات الحالية،
// لا تغيير في منطق payments/invoices إطلاقاً.
//
// تعريف «المتوقع» لليوم — مطابق حرفياً لتعريف النظام القائم:
// • اليوم = payments.paid_on = التاريخ المختار (نفس أساس «محصّل اليوم»
//   في الرئيسية و«محصّل الشهر» في view ‏monthly_profit).
// • نقدي = مجموع amount حيث method = 'cash'.
// • إلكتروني = مجموع amount لباقي الطرق (vodafone_cash / instapay /
//   bank_transfer) — وهي قنوات لا تُعدّ يدوياً بل تُراجع من كشوفها.
// • الدفعات العكسية (amount سالب، تُنشأ بعكس دفعة) تدخل في مجموع قناتها
//   بصافيها وبطريقتها الأصلية وبتاريخ يوم العكس — تماماً كما يجمعها
//   monthly_profit في صافي الشهر، فلا يمكن أن يختلف إغلاق اليوم عن
//   ملخص الشهر أبداً.
// • عدد الدفعات = عدد صفوف دفعات اليوم كلها (يشمل صفوف العكس، لأنها
//   حركة خزنة حقيقية في ذلك اليوم).
// • مصروفات اليوم = مجموع expenses.amount حيث expense_date = اليوم،
//   وتُعرض في الملخص وتُحفظ كلقطة في سجل الإغلاق، لكنها لا تُخصم من
//   المتوقع: جدول expenses بلا طريقة دفع، فلا يمكن نسبتها لقناة نقدية
//   أو إلكترونية بأمانة. «صافي اليوم» المعروض = إجمالي التحصيل −
//   المصروفات (للعرض فقط).
// • حفظ الإغلاق يخزّن لقطة المتوقع وقت الضغط على «حفظ»؛ دفعة متأخرة
//   بتاريخ قديم بعد إغلاق يومها لا تغيّر السجل المحفوظ، وتظهر كفرق
//   جديد عند إعادة فتح ذلك اليوم (المتوقع يُعاد حسابه حياً دائماً).
// ---------------------------------------------------------------------------

export interface DaySummary {
  /** التاريخ 'YYYY-MM-DD' */
  date: string
  /** متوقع نقدي: مجموع دفعات cash في اليوم (صافي العكسيات) */
  cash: number
  /** متوقع إلكتروني: مجموع دفعات الطرق الإلكترونية في اليوم (صافي العكسيات) */
  electronic: number
  /** إجمالي تحصيل اليوم = نقدي + إلكتروني */
  total: number
  /** عدد صفوف دفعات اليوم (يشمل صفوف العكس) */
  paymentCount: number
  /** عدد صفوف العكس داخل دفعات اليوم */
  reversalCount: number
  /** تفصيل المتوقع بكل طريقة دفع على حدة */
  byMethod: Record<PaymentMethod, number>
  /** مصروفات اليوم وعددها */
  expenses: number
  expensesCount: number
  /** صافي اليوم للعرض = إجمالي التحصيل − المصروفات */
  net: number
}

const ELECTRONIC_METHODS: PaymentMethod[] = ['vodafone_cash', 'instapay', 'bank_transfer']

/** ملخص يوم واحد محسوباً حياً من payments + expenses لذلك اليوم */
export async function fetchDaySummary(teacherId: string, date: string): Promise<DaySummary> {
  const { data: pays, error: payErr } = await db()
    .from('payments')
    .select('amount, method')
    .eq('teacher_id', teacherId)
    .eq('paid_on', date)
  if (payErr) throw payErr

  const byMethod: Record<PaymentMethod, number> = {
    cash: 0,
    vodafone_cash: 0,
    instapay: 0,
    bank_transfer: 0,
  }
  let paymentCount = 0
  let reversalCount = 0
  for (const row of (pays ?? []) as { amount: number | string; method: PaymentMethod }[]) {
    const amt = Number(row.amount) || 0
    byMethod[row.method] = (byMethod[row.method] ?? 0) + amt
    paymentCount += 1
    if (amt < 0) reversalCount += 1
  }
  const cash = byMethod.cash
  const electronic = ELECTRONIC_METHODS.reduce((s, m) => s + byMethod[m], 0)
  const total = cash + electronic

  const { data: exps, error: expErr } = await db()
    .from('expenses')
    .select('amount')
    .eq('teacher_id', teacherId)
    .eq('expense_date', date)
  if (expErr) throw expErr
  let expenses = 0
  let expensesCount = 0
  for (const row of (exps ?? []) as { amount: number | string }[]) {
    expenses += Number(row.amount) || 0
    expensesCount += 1
  }

  return {
    date,
    cash,
    electronic,
    total,
    paymentCount,
    reversalCount,
    byMethod,
    expenses,
    expensesCount,
    net: total - expenses,
  }
}

// ---------------------------------------------------------------------------
// سجلات الإغلاق — جدول daily_closings (migration 0004): صف واحد لكل
// (مدرس، يوم) بقيد فريد، فالحفظ upsert: أول حفظ ينشئ الصف، وإعادة الفتح
// تحدّث المعدود واللقطة والملحوظة في نفس الصف (created_at يبقى شاهداً
// على أول إغلاق و updated_at على آخر تعديل).
// ---------------------------------------------------------------------------

const CLOSING_COLS =
  'id, teacher_id, closing_date, expected_cash, expected_electronic, expenses_total, counted_cash, counted_electronic, note, closed_by, created_at, updated_at'

function toClosing(row: Record<string, unknown>): DailyClosingRow {
  return {
    ...(row as unknown as DailyClosingRow),
    expected_cash: Number(row.expected_cash) || 0,
    expected_electronic: Number(row.expected_electronic) || 0,
    expenses_total: Number(row.expenses_total) || 0,
    counted_cash: Number(row.counted_cash) || 0,
    counted_electronic: Number(row.counted_electronic) || 0,
  }
}

/** سجل الإغلاقات المحفوظة — الأحدث أولاً (للقائمة التاريخية) */
export async function fetchDailyClosings(
  teacherId: string,
  limit = 60,
): Promise<DailyClosingRow[]> {
  const { data, error } = await db()
    .from('daily_closings')
    .select(CLOSING_COLS)
    .eq('teacher_id', teacherId)
    .order('closing_date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toClosing)
}

/** إغلاق يوم واحد إن وُجد */
export async function fetchDailyClosing(
  teacherId: string,
  date: string,
): Promise<DailyClosingRow | null> {
  const { data, error } = await db()
    .from('daily_closings')
    .select(CLOSING_COLS)
    .eq('teacher_id', teacherId)
    .eq('closing_date', date)
    .maybeSingle()
  if (error) throw error
  return data ? toClosing(data as unknown as Record<string, unknown>) : null
}

/** حفظ/تعديل إغلاق يوم (upsert على (teacher_id, closing_date)) */
export async function upsertDailyClosing(
  teacherId: string,
  closedBy: string,
  input: DailyClosingInput,
): Promise<DailyClosingRow> {
  if (!(input.counted_cash >= 0)) throw new Error('المعدود النقدي لا يمكن أن يكون سالباً')
  if (!(input.counted_electronic >= 0)) throw new Error('المعدود الإلكتروني لا يمكن أن يكون سالباً')
  const { data, error } = await db()
    .from('daily_closings')
    .upsert(
      { teacher_id: teacherId, closed_by: closedBy, ...input },
      { onConflict: 'teacher_id,closing_date' },
    )
    .select(CLOSING_COLS)
    .single()
  if (error) throw error
  const closing = toClosing(data as unknown as Record<string, unknown>)
  // سجل النشاط: إغلاق/إعادة إغلاق يوم للخزنة (upsert — الحدث واحد في
  // الحالتين، والتفاصيل تحمل لقطة المعدود والمتوقع والفرق الكلي)
  void logActivity(teacherId, {
    event_type: 'cashbox_closed',
    entity_type: 'daily_closing',
    entity_id: closing.id,
    entity_label: closing.closing_date,
    details: {
      closing_date: closing.closing_date,
      counted_total: closing.counted_cash + closing.counted_electronic,
      expected_total: closing.expected_cash + closing.expected_electronic,
      diff_total:
        closing.counted_cash +
        closing.counted_electronic -
        (closing.expected_cash + closing.expected_electronic),
    },
  })
  return closing
}

// ---------------------------------------------------------------------------
// الفروق — مشتقة دائماً من (معدود − متوقع)، لا تُخزّن أبداً
// ---------------------------------------------------------------------------

export interface ClosingDiff {
  cash: number
  electronic: number
  total: number
}

export function diffOf(c: {
  counted_cash: number
  counted_electronic: number
  expected_cash: number
  expected_electronic: number
}): ClosingDiff {
  const cash = c.counted_cash - c.expected_cash
  const electronic = c.counted_electronic - c.expected_electronic
  return { cash, electronic, total: cash + electronic }
}

export type DiffState = 'match' | 'surplus' | 'shortage'

/** حالة فرق: مطابق عند صفر فعلي (بتسامح كسور النقود)، زيادة موجب، عجز سالب */
export function diffState(diff: number): DiffState {
  if (Math.abs(diff) < 0.005) return 'match'
  return diff > 0 ? 'surplus' : 'shortage'
}

export const DIFF_LABELS: Record<DiffState, string> = {
  match: 'مطابق',
  surplus: 'زيادة',
  shortage: 'عجز',
}

/** ألوان حالة الفرق بنسختيها المصححتي التباين (بحث §5): خلفية ناعمة + نص */
export const DIFF_BADGE_CLS: Record<DiffState, string> = {
  match: 'bg-ok-soft text-ok-text',
  surplus: 'bg-warn-soft text-warn-text',
  shortage: 'bg-bad-soft text-bad-text',
}

export const DIFF_TEXT_CLS: Record<DiffState, string> = {
  match: 'text-ok-text',
  surplus: 'text-warn-text',
  shortage: 'text-bad-text',
}
