import { t } from '../../i18n'
import { attendanceRatePct } from '../../lib/format'
import { db } from '../../lib/supabase'
import type { InvoiceBalanceRow, SessionRow } from '../../types/database'

// ---------------------------------------------------------------------------
// مساعدات التاريخ — بالتوقيت المحلي للجهاز، وبصيغة 'YYYY-MM-DD' مثل المخطط
// ---------------------------------------------------------------------------

export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr(): string {
  return toDateStr(new Date())
}

export function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

/** أول يوم في شهر التاريخ المعطى — يطابق invoices.period_month في المخطط */
export function monthStartStr(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`
}

export function monthEndStr(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number)
  return toDateStr(new Date(y, m, 0))
}

export function sessionStart(s: { session_date: string; start_time: string }): Date {
  return new Date(`${s.session_date}T${s.start_time.slice(0, 8)}`)
}

export function sessionEnd(s: { session_date: string; start_time: string; duration_minutes: number }): Date {
  return new Date(sessionStart(s).getTime() + s.duration_minutes * 60_000)
}

function fmtDuration(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000))
  if (mins < 60) return t('home.apiMinutes', { mins })
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const hTxt = h === 1 ? t('home.apiHourOne') : h === 2 ? t('home.apiHourTwo') : t('home.apiHours', { h })
  return m ? t('home.apiHoursAndMinutes', { hTxt, m }) : hTxt
}

/** الوقت النسبي لحصة اليوم (المرجع §5.5 ‏relTime): «بعد…» / «بدأت من…» / «خلصت» */
export function relLabel(s: { session_date: string; start_time: string; duration_minutes: number }, now: Date): string {
  const start = sessionStart(s)
  const end = sessionEnd(s)
  if (now < start) return t('home.apiAfter', { duration: fmtDuration(start.getTime() - now.getTime()) })
  if (now <= end) return t('home.apiStartedAgo', { duration: fmtDuration(now.getTime() - start.getTime()) })
  return t('home.apiFinished')
}

// ---------------------------------------------------------------------------
// الاستعلامات
// ---------------------------------------------------------------------------

const SESSION_COLS =
  'id, teacher_id, group_id, session_date, start_time, duration_minutes, kind, status, origin_session_id, note, created_at, updated_at'

export interface SessionWithGroup extends SessionRow {
  group_name: string
  group_room: string | null
}

/** حصص مدى زمني (شامل الطرفين) مرتبة بالتاريخ ثم الميعاد، مع اسم المجموعة وقاعتها */
export async function fetchSessionsInRange(
  teacherId: string,
  from: string,
  to: string,
): Promise<SessionWithGroup[]> {
  const { data, error } = await db()
    .from('sessions')
    .select(`${SESSION_COLS}, groups(name, room)`)
    .eq('teacher_id', teacherId)
    .gte('session_date', from)
    .lte('session_date', to)
    .order('session_date', { ascending: true })
    .order('start_time', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const g = (row.groups ?? {}) as { name?: string; room?: string | null }
    return {
      ...(row as unknown as SessionRow),
      group_name: g.name ?? '—',
      group_room: g.room ?? null,
    }
  })
}

/** عدد الطلاب النشطين: students حيث paused = false */
export async function fetchActiveStudentsCount(teacherId: string): Promise<number> {
  const { count, error } = await db()
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', teacherId)
    .eq('paused', false)
  if (error) throw error
  return count ?? 0
}

export interface MonthlyAttendance {
  /** حصص الشهر التي سُجّلت لها حالة حضور (status غير null) */
  marked: number
  /** منها الحضور الفعلي p/l/m (المرجع §2.4) */
  attended: number
  /** النسبة % — null عند غياب أي حضور مسجل (لا نخترع صفراً) */
  rate: number | null
}

/** نسبة حضور الشهر الحالي من attendance لحصص sessions داخل الشهر */
export async function fetchMonthlyAttendance(
  teacherId: string,
  monthStart: string,
  monthEnd: string,
): Promise<MonthlyAttendance> {
  const { data: sess, error: sessErr } = await db()
    .from('sessions')
    .select('id')
    .eq('teacher_id', teacherId)
    .gte('session_date', monthStart)
    .lte('session_date', monthEnd)
  if (sessErr) throw sessErr
  const ids = ((sess ?? []) as { id: string }[]).map((s) => s.id)
  if (ids.length === 0) return { marked: 0, attended: 0, rate: null }

  const { data, error } = await db()
    .from('attendance')
    .select('status')
    .eq('teacher_id', teacherId)
    .in('session_id', ids)
  if (error) throw error
  let marked = 0
  let attended = 0
  for (const row of (data ?? []) as { status: string | null }[]) {
    if (row.status == null) continue
    marked += 1
    if (row.status === 'p' || row.status === 'l' || row.status === 'm') attended += 1
  }
  // النسبة بالعُشر الموحّد (PAT-4ب) — كانت عدداً صحيحاً هنا وعُشراً في
  // التحليلات لنفس البسط/المقام
  return { marked, attended, rate: attendanceRatePct(attended, marked) }
}

/**
 * عدد سجلات الحضور المُعلَّمة فعلياً (status غير خالٍ) عبر كل الفترات —
 * خطوة «سجّل أول حضور» في بطاقة «ابدأ هنا» تُحسم بأي تعليم تاريخي،
 * لا بحضور الشهر الحالي وحده (M3).
 */
export async function fetchAnyAttendanceCount(teacherId: string): Promise<number> {
  // جدول attendance بلا عمود id (مفتاحه المركب session_id+student_id) —
  // العدّ يكون على session_id؛ اختيار 'id' كان يفشل بـ 42703 فيبقى
  // الاستعلام بلا بيانات وتتعطل بطاقة «ابدأ هنا» كلها بصمت.
  const { count, error } = await db()
    .from('attendance')
    .select('session_id', { count: 'exact', head: true })
    .eq('teacher_id', teacherId)
    .not('status', 'is', null)
  if (error) throw error
  return count ?? 0
}

export interface MonthPayments {
  /** محصّل الشهر = مجموع payments.amount داخل الشهر (يشمل العكسيات السالبة) */
  collectedMonth: number
  /** محصّل اليوم = مجموع دفعات paid_on = اليوم */
  collectedToday: number
}

export async function fetchMonthPayments(
  teacherId: string,
  monthStart: string,
  monthEnd: string,
  today: string,
): Promise<MonthPayments> {
  const { data, error } = await db()
    .from('payments')
    .select('amount, paid_on')
    .eq('teacher_id', teacherId)
    .gte('paid_on', monthStart)
    .lte('paid_on', monthEnd)
  if (error) throw error
  let collectedMonth = 0
  let collectedToday = 0
  for (const row of (data ?? []) as { amount: number | string; paid_on: string }[]) {
    const amt = Number(row.amount) || 0
    collectedMonth += amt
    if (row.paid_on === today) collectedToday += amt
  }
  return { collectedMonth, collectedToday }
}

// ---------------------------------------------------------------------------
// مقارنات الدلتا (W5 — R-13): كل KPI في الرئيسية يقارن بنفس عدد أيام
// الشهر السابق — نافذة الشهر السابق تبدأ من أوله وتنتهي عند نفس رقم
// اليوم (مقصوصة عند نهاية الشهر الأقصر).
// ---------------------------------------------------------------------------

/** نافذة «نفس الأيام» من الشهر السابق لتاريخ معطى */
export function prevMonthSameDaysWindow(today: string): { start: string; end: string } {
  const day = Number(today.slice(8, 10))
  const [y, m] = monthStartStr(today).split('-').map(Number)
  const start = toDateStr(new Date(y, m - 2, 1))
  const prevEndAll = monthEndStr(start)
  const candidate = addDaysStr(start, day - 1)
  return { start, end: candidate <= prevEndAll ? candidate : prevEndAll }
}

export interface KpiDelta {
  /** الفرق المطلق (حالي − سابق) بوحدة المؤشر نفسه */
  abs: number
  /** النسبة % — null عند قاعدة صفرية (يُعرض المطلق فقط، R-13) */
  pct: number | null
  direction: 'up' | 'down' | 'flat'
}

/** دلتا نقية: القيمة الحالية مقابل نافذة المقارنة (R-13).
 * الفرق يُقرَّب لمنزلة عشرية واحدة: كل وحدات المؤشرات أعداد صحيحة أو نسب
 * بمنزلة واحدة (attendanceRatePct)، والطرح الخام كان يُظهر بقايا فاصلة
 * عائمة في الواجهة (87.5 − 84.2 = 3.299999999999997 — إصلاح المراجعة
 * الشاملة 3A-314 بعد رصده حياً في دلتا حضور الرئيسية). */
export function kpiDelta(current: number, previous: number): KpiDelta {
  const rounded = Math.round((current - previous) * 10) / 10
  const abs = rounded === 0 ? 0 : rounded
  return {
    abs,
    pct: previous !== 0 ? Math.round((abs / Math.abs(previous)) * 100) : null,
    direction: abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat',
  }
}

/** مجموع الدفعات داخل مدى تاريخي (paid_on ضمناً) — لنافذة مقارنة الشهر السابق */
export async function fetchCollectedInRange(
  teacherId: string,
  from: string,
  to: string,
): Promise<number> {
  const { data, error } = await db()
    .from('payments')
    .select('amount')
    .eq('teacher_id', teacherId)
    .gte('paid_on', from)
    .lte('paid_on', to)
  if (error) throw error
  return ((data ?? []) as { amount: number | string }[]).reduce(
    (sum, r) => sum + (Number(r.amount) || 0),
    0,
  )
}

/** عدد الطلاب المنشأين داخل مدى تاريخي (created_at) — لدلتا الانضمامات */
export async function fetchNewStudentsCount(
  teacherId: string,
  from: string,
  to: string,
): Promise<number> {
  const { count, error } = await db()
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', teacherId)
    .gte('created_at', from)
    .lt('created_at', addDaysStr(to, 1))
  if (error) throw error
  return count ?? 0
}

/** كل أرصدة الفواتير من view ‏invoice_balances (محسوبة في قاعدة البيانات) */
export async function fetchInvoiceBalances(teacherId: string): Promise<InvoiceBalanceRow[]> {
  const { data, error } = await db()
    .from('invoice_balances')
    .select('invoice_id, teacher_id, student_id, group_id, period_month, total, paid, balance, is_paid')
    .eq('teacher_id', teacherId)
  if (error) throw error
  return ((data ?? []) as unknown as InvoiceBalanceRow[]).map((r) => ({
    ...r,
    total: Number(r.total) || 0,
    paid: Number(r.paid) || 0,
    balance: Number(r.balance) || 0,
  }))
}

export interface SessionAttendanceMark {
  session_id: string
  student_id: string
  status: string | null
}

/** صفوف الحضور لحصص محددة — لحساب تقدّم تحضير حصص اليوم */
export async function fetchAttendanceForSessions(
  teacherId: string,
  sessionIds: string[],
): Promise<SessionAttendanceMark[]> {
  if (sessionIds.length === 0) return []
  const { data, error } = await db()
    .from('attendance')
    .select('session_id, student_id, status')
    .eq('teacher_id', teacherId)
    .in('session_id', sessionIds)
  if (error) throw error
  return (data ?? []) as unknown as SessionAttendanceMark[]
}

/** عدد الطلاب النشطين المسجلين في كل مجموعة (تسجيل + طالب غير موقوف) */
export async function fetchActiveCountsByGroup(
  teacherId: string,
  groupIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (groupIds.length === 0) return map
  const { data, error } = await db()
    .from('enrollments')
    .select('group_id, students!inner(paused)')
    .eq('teacher_id', teacherId)
    .in('group_id', groupIds)
    .eq('students.paused', false)
  if (error) throw error
  for (const row of (data ?? []) as unknown as { group_id: string }[]) {
    map.set(row.group_id, (map.get(row.group_id) ?? 0) + 1)
  }
  return map
}

// ---------------------------------------------------------------------------
// التنبيهات (getAlerts) انتقلت في الخطوة 8 إلى مصدر الاشتقاق الواحد
// features/notifications/api.ts (fetchAlerts): بطاقة تنبيهات الرئيسية
// (useHomeAlerts هنا) وشاشة الإشعارات تقرآن منها بنفس مفتاح الكاش،
// فنصوص الأنواع ووجهاتها وعددها لا يمكن أن تتناقض بين الشاشتين.
// ---------------------------------------------------------------------------
