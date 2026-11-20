import { supabase } from '../../lib/supabase'
import { monthStartStr, todayStr } from '../home/api'
import { fetchMonthlyProfit } from '../money/api'

function db() {
  if (!supabase) throw new Error('Supabase غير مربوط — راجع إعدادات .env')
  return supabase
}

// ---------------------------------------------------------------------------
// لوحة التحليلات (Phase 3 — الخطوة 3): مصادر البيانات وتعريفاتها.
//
// لا هجرة جديدة (0010 غير لازمة): كل السلاسل قابلة للاشتقاق الصحيح من
// الـ views والجداول القائمة، وتُجمَّع هنا في العميل فوق صفوف خام محكومة
// بـ RLS (security_invoker على الـ views + سياسات الجداول):
//
// • التحصيل الشهري: view ‏monthly_profit ‏(collected = مجموع payments
//   حسب paid_on) — نفس مصدر شاشة الفلوس حرفياً، فلا اختلاف ممكن بينهما.
// • نسبة الحضور الشهرية: صفوف attendance المُسجّلة (status غير خالٍ)
//   مربوطة بـ sessions.session_date، وبنفس تعريف «حاضر» في view
//   ‏student_attendance_stats: الحالات p/l/m تُعد حضوراً. النسبة =
//   الحاضر ÷ المُسجّل × 100 لكل شهر (null عند غياب أي تسجيل — فجوة
//   صادقة في الخط لا صفر مضلّل).
// • المتأخرات عبر الأشهر: من view ‏invoice_balances — مجموع الأرصدة
//   الموجبة الحالية مجمّعة حسب شهر استحقاق الفاتورة (period_month).
//   هذا «توزيع المتأخرات الحالية على أشهر الاستحقاق» وليس إعادة بناء
//   تاريخية لأرصدة نهاية كل شهر (غير قابلة للاشتقاق: الدفعات لا تحمل
//   لقطة رصيد زمنية، وإعادة بنائها من تواريخ الدفع تخترع أرقاماً).
//   إجمالي المتأخرات الحالية (KPI) = مجموع كل الأرصدة الموجبة بلا قيد
//   شهر — يشمل شهوراً أقدم من مدى العرض.
// • نمو الطلاب: جدد الشهر = students.created_at داخل الشهر؛ التراكمي =
//   كل من أُنشئ حتى نهاية الشهر (يشمل ما قبل المدى)؛ النشطون حالياً
//   (KPI) = paused = false الآن (الحالة الحالية وحدها القابلة للمعرفة).
// ---------------------------------------------------------------------------

export type AnalyticsRange = 3 | 6 | 12

export interface AnalyticsMonth {
  /** أول يوم في الشهر 'YYYY-MM-DD' */
  month: string
  /** تحصيل الشهر من monthly_profit (0 عند غياب الصف = لا حركة) */
  collected: number
  /** نسبة الحضور % برقم عشري واحد — null = لا تسجيلات في الشهر */
  attendanceRate: number | null
  attended: number
  marked: number
  /** متأخرات حالية مستحقة عن فواتير هذا الشهر (أرصدة موجبة) */
  overdue: number
  /** طلاب أُنشئوا في هذا الشهر */
  newStudents: number
  /** إجمالي الطلاب المنشأين حتى نهاية هذا الشهر */
  cumulativeStudents: number
}

export interface AnalyticsData {
  months: AnalyticsMonth[]
  /** إجمالي التحصيل داخل المدى */
  totalCollected: number
  /** متوسط الحضور المرجّح داخل المدى (الحاضر ÷ المُسجّل) — null بلا تسجيلات */
  avgAttendance: number | null
  /** كل المتأخرات الحالية الآن (كل الشهور، لا المدى فقط) */
  currentOverdue: number
  /** الطلاب النشطون الآن (غير موقوفين) */
  activeStudents: number
  /** أي أثر بيانات داخل المدى أو تراكمياً — false لمدرس جديد تماماً */
  hasAnyData: boolean
}

const PAGE = 1000

/** جلب مُصفّح: حد PostgREST الافتراضي 1000 صف — نلفّ حتى تنتهي الصفوف */
async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const page = await fetchPage(from, from + PAGE - 1)
    out.push(...page)
    if (page.length < PAGE) return out
  }
}

/** قائمة شهور المدى من الأقدم للأحدث، منتهية بشهر اليوم */
export function rangeMonths(range: AnalyticsRange): string[] {
  const anchor = monthStartStr(todayStr())
  const [y, m] = anchor.split('-').map(Number)
  const out: string[] = []
  for (let back = range - 1; back >= 0; back--) {
    const d = new Date(y, m - 1 - back, 1)
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
    )
  }
  return out
}

interface AttendanceAgg {
  marked: number
  attended: number
}

/** تجميع الحضور شهرياً من صفوف attendance مربوطة بتاريخ حصتها */
async function fetchAttendanceByMonth(
  teacherId: string,
  fromMonth: string,
  toMonthEnd: string,
): Promise<Map<string, AttendanceAgg>> {
  type Row = { status: string | null; sessions: { session_date: string } | null }
  const rows = await fetchAllPages<Row>(async (from, to) => {
    const { data, error } = await db()
      .from('attendance')
      .select('status, sessions!inner(session_date)')
      .eq('teacher_id', teacherId)
      .not('status', 'is', null)
      .gte('sessions.session_date', fromMonth)
      .lte('sessions.session_date', toMonthEnd)
      .order('session_id', { ascending: true })
      .order('student_id', { ascending: true })
      .range(from, to)
    if (error) throw error
    return (data ?? []) as unknown as Row[]
  })
  const map = new Map<string, AttendanceAgg>()
  for (const r of rows) {
    const date = r.sessions?.session_date
    if (!date || !r.status) continue
    const key = monthStartStr(date)
    const agg = map.get(key) ?? { marked: 0, attended: 0 }
    agg.marked += 1
    if (r.status === 'p' || r.status === 'l' || r.status === 'm') agg.attended += 1
    map.set(key, agg)
  }
  return map
}

/** كل أرصدة الفواتير (period_month + balance) — تُشتق منها سلسلة المتأخرات وإجماليها */
async function fetchInvoiceBalances(
  teacherId: string,
): Promise<{ period_month: string; balance: number }[]> {
  type Row = { period_month: string; balance: number | string }
  const rows = await fetchAllPages<Row>(async (from, to) => {
    const { data, error } = await db()
      .from('invoice_balances')
      .select('period_month, balance')
      .eq('teacher_id', teacherId)
      .order('invoice_id', { ascending: true })
      .range(from, to)
    if (error) throw error
    return (data ?? []) as unknown as Row[]
  })
  return rows.map((r) => ({ period_month: r.period_month, balance: Number(r.balance) || 0 }))
}

/** كل الطلاب (created_at + paused) — للجدد/التراكمي/النشطين */
async function fetchStudentsLite(
  teacherId: string,
): Promise<{ created_at: string; paused: boolean }[]> {
  type Row = { created_at: string; paused: boolean }
  const rows = await fetchAllPages<Row>(async (from, to) => {
    const { data, error } = await db()
      .from('students')
      .select('created_at, paused')
      .eq('teacher_id', teacherId)
      .order('id', { ascending: true })
      .range(from, to)
    if (error) throw error
    return (data ?? []) as unknown as Row[]
  })
  return rows
}

/** بناء بيانات اللوحة كاملة لمدى معيّن — كل المصادر بالتوازي */
export async function fetchAnalytics(
  teacherId: string,
  range: AnalyticsRange,
): Promise<AnalyticsData> {
  const months = rangeMonths(range)
  const firstMonth = months[0]
  const lastMonth = months[months.length - 1]
  const [y, m] = lastMonth.split('-').map(Number)
  const lastMonthEnd = `${lastMonth.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`

  const [profitRows, attendanceMap, balances, students] = await Promise.all([
    fetchMonthlyProfit(teacherId),
    fetchAttendanceByMonth(teacherId, firstMonth, lastMonthEnd),
    fetchInvoiceBalances(teacherId),
    fetchStudentsLite(teacherId),
  ])

  const profitByMonth = new Map(profitRows.map((r) => [r.month, r.collected]))
  const overdueByMonth = new Map<string, number>()
  let currentOverdue = 0
  for (const b of balances) {
    if (b.balance > 0) {
      currentOverdue += b.balance
      overdueByMonth.set(b.period_month, (overdueByMonth.get(b.period_month) ?? 0) + b.balance)
    }
  }

  const newByMonth = new Map<string, number>()
  for (const s of students) {
    const key = monthStartStr(s.created_at.slice(0, 10))
    newByMonth.set(key, (newByMonth.get(key) ?? 0) + 1)
  }
  const activeStudents = students.filter((s) => !s.paused).length

  let totalCollected = 0
  let totalMarked = 0
  let totalAttended = 0
  const monthRows: AnalyticsMonth[] = months.map((month) => {
    const collected = profitByMonth.get(month) ?? 0
    const agg = attendanceMap.get(month)
    const marked = agg?.marked ?? 0
    const attended = agg?.attended ?? 0
    totalCollected += collected
    totalMarked += marked
    totalAttended += attended
    const cumulative = students.filter(
      (s) => monthStartStr(s.created_at.slice(0, 10)) <= month,
    ).length
    return {
      month,
      collected,
      attendanceRate: marked > 0 ? Math.round((attended / marked) * 1000) / 10 : null,
      attended,
      marked,
      overdue: overdueByMonth.get(month) ?? 0,
      newStudents: newByMonth.get(month) ?? 0,
      cumulativeStudents: cumulative,
    }
  })

  const hasAnyData =
    students.length > 0 ||
    balances.length > 0 ||
    profitRows.length > 0 ||
    totalMarked > 0

  return {
    months: monthRows,
    totalCollected,
    avgAttendance:
      totalMarked > 0 ? Math.round((totalAttended / totalMarked) * 1000) / 10 : null,
    currentOverdue,
    activeStudents,
    hasAnyData,
  }
}
