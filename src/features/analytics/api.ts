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

export interface AnalyticsInsights {
  /** المجموعة صاحبة أعلى متأخرات حالية */
  topOverdueGroup: { name: string; amount: number } | null
  /** أكبر تغيّر تحصيل بين شهرين مكتملين متتاليين داخل المدى */
  biggestCollectionChange: {
    fromMonth: string
    toMonth: string
    pct: number
    delta: number
  } | null
  /** أكثر مجموعة غياباً (حالات 'a') داخل المدى */
  mostAbsentGroup: { name: string; absences: number } | null
  /** أكثر طالب غياباً داخل المدى */
  mostAbsentStudent: { name: string; absences: number } | null
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
  /** أهم الرؤى الحتمية (W5 — R-14) — تُشتق من نفس بيانات اللوحة */
  insights: AnalyticsInsights
}

/**
 * بناء الرؤى الثلاث حتمياً (W5 — R-14): أعلى متأخرات لمجموعة، أكبر
 * تغيّر تحصيل بين شهرين مكتملين متتاليين (الشهر الحالي الجاري لا
 * يدخل المقارنة حتى لا يُقارن نصف شهر بشهر كامل)، وأعلى غياب.
 * دالة نقية فوق مجاميع جاهزة — بلا أي نموذج أو تخمين.
 */
export function buildInsights(args: {
  months: AnalyticsMonth[]
  overdueByGroup: { name: string; amount: number }[]
  absenceByGroup: { name: string; absences: number }[]
  absenceByStudent: { name: string; absences: number }[]
}): AnalyticsInsights {
  let topOverdueGroup: AnalyticsInsights['topOverdueGroup'] = null
  for (const g of args.overdueByGroup) {
    if (g.amount > 0 && (!topOverdueGroup || g.amount > topOverdueGroup.amount)) {
      topOverdueGroup = { name: g.name, amount: g.amount }
    }
  }
  let biggestCollectionChange: AnalyticsInsights['biggestCollectionChange'] = null
  const completed = args.months.slice(0, -1)
  for (let i = 1; i < completed.length; i++) {
    const from = completed[i - 1]
    const to = completed[i]
    if (from.collected <= 0) continue
    const pct = Math.round(((to.collected - from.collected) / from.collected) * 100)
    if (
      !biggestCollectionChange ||
      Math.abs(pct) > Math.abs(biggestCollectionChange.pct)
    ) {
      biggestCollectionChange = {
        fromMonth: from.month,
        toMonth: to.month,
        pct,
        delta: to.collected - from.collected,
      }
    }
  }
  const topAbsence = <T extends { name: string; absences: number }>(list: T[]) =>
    list.reduce<T | null>(
      (best, cur) => (cur.absences > 0 && (!best || cur.absences > best.absences) ? cur : best),
      null,
    )
  const mag = topAbsence(args.absenceByGroup)
  const mas = topAbsence(args.absenceByStudent)
  return {
    topOverdueGroup,
    biggestCollectionChange,
    mostAbsentGroup: mag ? { name: mag.name, absences: mag.absences } : null,
    mostAbsentStudent: mas ? { name: mas.name, absences: mas.absences } : null,
  }
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

interface AttendanceAggregates {
  byMonth: Map<string, AttendanceAgg>
  /** غيابات (status='a') لكل مجموعة داخل المدى — لرؤى W5 */
  absenceByGroup: Map<string, number>
  /** غيابات لكل طالب داخل المدى — لرؤى W5 */
  absenceByStudent: Map<string, number>
}

/** تجميع الحضور شهرياً من صفوف attendance مربوطة بتاريخ حصتها */
async function fetchAttendanceByMonth(
  teacherId: string,
  fromMonth: string,
  toMonthEnd: string,
): Promise<AttendanceAggregates> {
  type Row = {
    status: string | null
    student_id: string
    sessions: { session_date: string; group_id: string } | null
  }
  const rows = await fetchAllPages<Row>(async (from, to) => {
    const { data, error } = await db()
      .from('attendance')
      .select('status, student_id, sessions!inner(session_date, group_id)')
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
  const absenceByGroup = new Map<string, number>()
  const absenceByStudent = new Map<string, number>()
  for (const r of rows) {
    const date = r.sessions?.session_date
    if (!date || !r.status) continue
    const key = monthStartStr(date)
    const agg = map.get(key) ?? { marked: 0, attended: 0 }
    agg.marked += 1
    if (r.status === 'p' || r.status === 'l' || r.status === 'm') agg.attended += 1
    map.set(key, agg)
    if (r.status === 'a') {
      if (r.sessions?.group_id) {
        absenceByGroup.set(r.sessions.group_id, (absenceByGroup.get(r.sessions.group_id) ?? 0) + 1)
      }
      absenceByStudent.set(r.student_id, (absenceByStudent.get(r.student_id) ?? 0) + 1)
    }
  }
  return { byMonth: map, absenceByGroup, absenceByStudent }
}

/** كل أرصدة الفواتير (period_month + balance + group) — للسلسلة والإجمالي والرؤى */
async function fetchInvoiceBalances(
  teacherId: string,
): Promise<{ period_month: string; balance: number; group_id: string }[]> {
  type Row = { period_month: string; balance: number | string; group_id: string }
  const rows = await fetchAllPages<Row>(async (from, to) => {
    const { data, error } = await db()
      .from('invoice_balances')
      .select('period_month, balance, group_id')
      .eq('teacher_id', teacherId)
      .order('invoice_id', { ascending: true })
      .range(from, to)
    if (error) throw error
    return (data ?? []) as unknown as Row[]
  })
  return rows.map((r) => ({
    period_month: r.period_month,
    balance: Number(r.balance) || 0,
    group_id: r.group_id,
  }))
}

/** أسماء المجموعات (id ← name) — لتسمية رؤى المتأخرات/الغياب */
async function fetchGroupNames(teacherId: string): Promise<Map<string, string>> {
  const { data, error } = await db()
    .from('groups')
    .select('id, name')
    .eq('teacher_id', teacherId)
  if (error) throw error
  return new Map(((data ?? []) as { id: string; name: string }[]).map((g) => [g.id, g.name]))
}

/** كل الطلاب (id + name + created_at + paused) — للجدد/التراكمي/النشطين والرؤى */
async function fetchStudentsLite(
  teacherId: string,
): Promise<{ id: string; name: string; created_at: string; paused: boolean }[]> {
  type Row = { id: string; name: string; created_at: string; paused: boolean }
  const rows = await fetchAllPages<Row>(async (from, to) => {
    const { data, error } = await db()
      .from('students')
      .select('id, name, created_at, paused')
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

  const [profitRows, attendance, balances, students, groupNames] = await Promise.all([
    fetchMonthlyProfit(teacherId),
    fetchAttendanceByMonth(teacherId, firstMonth, lastMonthEnd),
    fetchInvoiceBalances(teacherId),
    fetchStudentsLite(teacherId),
    fetchGroupNames(teacherId),
  ])
  const attendanceMap = attendance.byMonth

  const profitByMonth = new Map(profitRows.map((r) => [r.month, r.collected]))
  const overdueByMonth = new Map<string, number>()
  const overdueByGroupId = new Map<string, number>()
  let currentOverdue = 0
  for (const b of balances) {
    if (b.balance > 0) {
      currentOverdue += b.balance
      overdueByMonth.set(b.period_month, (overdueByMonth.get(b.period_month) ?? 0) + b.balance)
      overdueByGroupId.set(b.group_id, (overdueByGroupId.get(b.group_id) ?? 0) + b.balance)
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

  const studentNames = new Map(students.map((s) => [s.id, s.name]))
  const insights = buildInsights({
    months: monthRows,
    overdueByGroup: [...overdueByGroupId.entries()].map(([id, amount]) => ({
      name: groupNames.get(id) ?? 'مجموعة',
      amount,
    })),
    absenceByGroup: [...attendance.absenceByGroup.entries()].map(([id, absences]) => ({
      name: groupNames.get(id) ?? 'مجموعة',
      absences,
    })),
    absenceByStudent: [...attendance.absenceByStudent.entries()].map(([id, absences]) => ({
      name: studentNames.get(id) ?? 'طالب',
      absences,
    })),
  })

  return {
    months: monthRows,
    totalCollected,
    avgAttendance:
      totalMarked > 0 ? Math.round((totalAttended / totalMarked) * 1000) / 10 : null,
    currentOverdue,
    activeStudents,
    hasAnyData,
    insights,
  }
}
