import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../lib/format'
import type { InvoiceBalanceRow, SessionRow } from '../../types/database'

function db() {
  if (!supabase) throw new Error('Supabase غير مربوط — راجع إعدادات .env')
  return supabase
}

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
  if (mins < 60) return `${mins} دقيقة`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const hTxt = h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${h} ساعة`
  return m ? `${hTxt} و${m} دقيقة` : hTxt
}

/** الوقت النسبي لحصة اليوم (المرجع §5.5 ‏relTime): «بعد…» / «بدأت من…» / «خلصت» */
export function relLabel(s: { session_date: string; start_time: string; duration_minutes: number }, now: Date): string {
  const start = sessionStart(s)
  const end = sessionEnd(s)
  if (now < start) return `بعد ${fmtDuration(start.getTime() - now.getTime())}`
  if (now <= end) return `بدأت من ${fmtDuration(now.getTime() - start.getTime())}`
  return 'خلصت'
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
  return { marked, attended, rate: marked ? Math.round((attended / marked) * 100) : null }
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
// التنبيهات المختصرة — نفس أنواع getAlerts في المرجع (§5.7)، محسوبة من الجداول
// الحالية. المالية (fin) والنسخ الاحتياطي (backup) للمالك فقط كما في المرجع.
// ---------------------------------------------------------------------------

export interface HomeAlert {
  kind: 'att' | 'prepaid' | 'fin' | 'grade' | 'backup'
  text: string
  to: string
}

export async function fetchHomeAlerts(
  teacherId: string,
  today: string,
  isOwner: boolean,
): Promise<HomeAlert[]> {
  const alerts: HomeAlert[] = []
  const supa = db()

  // att: حصص اليوم المجدولة فيها طلاب بلا حالة حضور مسجلة
  const todaySessions = (await fetchSessionsInRange(teacherId, today, today)).filter(
    (s) => s.status === 'scheduled',
  )
  if (todaySessions.length > 0) {
    const counts = await fetchActiveCountsByGroup(
      teacherId,
      todaySessions.map((s) => s.group_id),
    )
    const marks = await fetchAttendanceForSessions(
      teacherId,
      todaySessions.map((s) => s.id),
    )
    const markedBySession = new Map<string, number>()
    for (const m of marks) {
      if (m.status != null) markedBySession.set(m.session_id, (markedBySession.get(m.session_id) ?? 0) + 1)
    }
    for (const s of todaySessions) {
      const total = counts.get(s.group_id) ?? 0
      const unmarked = total - (markedBySession.get(s.id) ?? 0)
      if (total > 0 && unmarked > 0) {
        alerts.push({
          kind: 'att',
          text: `${s.group_name}: ${unmarked} طالب لسه متسجلش حضورهم`,
          to: `/attendance?session=${s.id}`,
        })
      }
    }
  }

  // prepaid: باقي باقة طالب ≤ 1 (عدّاد الباقة في المرجع §5.7)
  {
    const { data: enr, error } = await supa
      .from('enrollments')
      .select('student_id, group_id, prepaid_sessions, groups(name), students!inner(paused)')
      .eq('teacher_id', teacherId)
      .not('prepaid_sessions', 'is', null)
      .eq('students.paused', false)
    if (error) throw error
    const rows = (enr ?? []) as unknown as {
      student_id: string
      group_id: string
      prepaid_sessions: number
      groups: { name?: string } | null
    }[]
    if (rows.length > 0) {
      const { data: att, error: attErr } = await supa
        .from('attendance')
        .select('student_id, sessions!inner(group_id)')
        .eq('teacher_id', teacherId)
        .in('status', ['p', 'l', 'm'])
      if (attErr) throw attErr
      const used = new Map<string, number>()
      for (const row of (att ?? []) as unknown as { student_id: string; sessions: { group_id: string } }[]) {
        const key = `${row.student_id}|${row.sessions.group_id}`
        used.set(key, (used.get(key) ?? 0) + 1)
      }
      for (const r of rows) {
        const left = Math.max(0, r.prepaid_sessions - (used.get(`${r.student_id}|${r.group_id}`) ?? 0))
        if (left <= 1) {
          alerts.push({
            kind: 'prepaid',
            text: `(${r.groups?.name ?? 'مجموعة'}): متبقي ${left} حصة فقط من الباقة`,
            to: `/students/${r.student_id}`,
          })
        }
      }
    }
  }

  // fin (مالك فقط): طالب نشط رصيده > 0 — تنبيه لكل طالب
  if (isOwner) {
    const { data: bals, error } = await supa
      .from('student_balances')
      .select('student_id, balance')
      .eq('teacher_id', teacherId)
      .gt('balance', 0)
    if (error) throw error
    const balRows = (bals ?? []) as unknown as { student_id: string; balance: number | string }[]
    if (balRows.length > 0) {
      const { data: studs, error: stErr } = await supa
        .from('students')
        .select('id, name, paused')
        .eq('teacher_id', teacherId)
        .in('id', balRows.map((b) => b.student_id))
      if (stErr) throw stErr
      const byId = new Map(
        ((studs ?? []) as unknown as { id: string; name: string; paused: boolean }[]).map((s) => [s.id, s]),
      )
      for (const b of balRows) {
        const st = byId.get(b.student_id)
        if (!st || st.paused) continue
        alerts.push({
          kind: 'fin',
          text: `${st.name} عليه ${formatMoney(Number(b.balance) || 0)}`,
          to: `/students/${b.student_id}`,
        })
      }
    }
  }

  // grade: تقييم فيه درجات أقل من 50%
  {
    const { data, error } = await supa
      .from('scores')
      .select('score, assessments!inner(id, title, max_score)')
      .eq('teacher_id', teacherId)
    if (error) throw error
    const byAssessment = new Map<string, { title: string; count: number }>()
    for (const row of (data ?? []) as unknown as {
      score: number | string
      assessments: { id: string; title: string; max_score: number | string }
    }[]) {
      const max = Number(row.assessments.max_score) || 0
      if (max <= 0) continue
      if ((Number(row.score) / max) * 100 < 50) {
        const cur = byAssessment.get(row.assessments.id) ?? { title: row.assessments.title, count: 0 }
        cur.count += 1
        byAssessment.set(row.assessments.id, cur)
      }
    }
    for (const [id, v] of byAssessment) {
      alerts.push({ kind: 'grade', text: `${v.count} طالب تحت 50% في ${v.title}`, to: `/assessments/${id}` })
    }
  }

  // backup (مالك فقط): لا تصدير أبداً أو مرّت ≥ 30 يوماً على آخر تصدير
  if (isOwner) {
    const { data, error } = await supa
      .from('teacher_settings')
      .select('last_export_at')
      .eq('teacher_id', teacherId)
      .maybeSingle()
    if (error) throw error
    const last = (data as unknown as { last_export_at: string | null } | null)?.last_export_at
    const due = !last || Date.now() - new Date(last).getTime() >= 30 * 24 * 60 * 60 * 1000
    if (due) {
      alerts.push({ kind: 'backup', text: 'مفيش نسخة احتياطية من أكتر من 30 يوم', to: '/backup' })
    }
  }

  return alerts
}
