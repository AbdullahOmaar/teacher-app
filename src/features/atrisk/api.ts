import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import { formatMoney, waLink } from '../../lib/format'
import {
  fetchGuardianContacts,
  resolveGuardian,
  type GuardianContact,
  type RosterStudent,
} from '../attendance/api'
import { monthStartStr } from '../home/api'

// ---------------------------------------------------------------------------
// «معرّضون للفقد» (At-Risk) — Phase 5 / الخطوة 1 (خطة P5-1)
//
// قائمة مشتقّة في العميل من بيانات موجودة فقط (حضور + invoice_balances)،
// بلا أي منطق مالي أو حضور جديد. تعريف الخطر v1 — واضح وقابل للشرح
// للمدرس بجملة واحدة: طالب نشط (غير موقوف) ينطبق عليه أيٌّ من:
//
// (أ) غياب متتالٍ: سلسلة غيابات (status='a') متتالية ≥ 3 في أحدث حصص
//     مجموعته المسجَّلة (بترتيب الحصص الفعلي: التاريخ ثم الميعاد، وحصص
//     ≤ اليوم وغير الملغاة فقط). الحصص غير المُعلَّمة للطالب (بلا صف أو
//     status خالٍ) تُتخطّى ولا تكسر السلسلة — فالسلسلة تُقاس على آخر
//     حصص سُجّلت له فيها حالة فعلاً. تُحسب لكل مجموعة على حدة ويؤخذ
//     الأسوأ (أطول سلسلة).
// (ب) متأخرات ممتدة: فواتير متأخرة بالتعريف المعتمد في التطبيق
//     (period_month قبل الشهر الحالي، من invoice_balances برصيد > 0)
//     يمتد رصيدها لشهرين أو أكثر: عدد الشهور من أقدم شهر متأخر حتى
//     الشهر الحالي شاملاً الطرفين ≥ 2 (فاتورة أكتوبر ونحن في نوفمبر =
//     «متأخر شهرين»). المبلغ المعروض = مجموع أرصدة الفواتير المتأخرة
//     فقط (فاتورة الشهر الحالي المستحقة لا تدخل — ليست «متأخرة» بعد).
//
// الإخفاء بعد «تمت المتابعة» (at_risk_followups — migration ‏0018):
// يختفي الطالب طالما لا حدث خطر أحدث من آخر متابعة له. «الحدث» هنا:
// للغياب = ميعاد أحدث حصة غابها في السلسلة الحالية؛ للمتأخرات = الأحدث
// من (لحظة إنشاء الفاتورة، وبداية الشهر الذي أصبحت فيه متأخرة) — ففاتورة
// الشهر الماضي غير المسددة «تولد» كحدث جديد مع أول الشهر الحالي حتى لو
// أُنشئت قبله، وتبقى مخفية بعد متابعة لاحقة ما لم تظهر فاتورة أجدد.
//
// المالية للمالك فقط كما في باقي التطبيق: سبب المتأخرات لا يُشتق أصلاً
// عند isOwner=false (وRLS تحجب invoice_balances عن المساعد أصلاً)،
// فيرى المساعد قائمة الغياب فقط. الترتيب: عدد الأسباب أكثر أولاً، ثم
// الغياب الأطول، ثم مبلغ المتأخرات الأكبر، ثم الاسم.
// ---------------------------------------------------------------------------

/** عتبة الغياب المتتالي (حصص) */
export const ABSENCE_STREAK_THRESHOLD = 3
/** عتبة امتداد المتأخرات (شهور شاملة الطرفين من أقدم شهر متأخر) */
export const OVERDUE_SPAN_THRESHOLD = 2

export type AtRiskReason =
  | {
      kind: 'absence'
      text: string
      streak: number
      groupName: string
      /** ميعاد أحدث غياب في السلسلة (epoch ms) — مرجع مقارنة المتابعة */
      eventAt: number
    }
  | {
      kind: 'overdue'
      text: string
      monthsSpan: number
      amount: number
      /** أحدث لحظة أصبح فيها جزء من الرصيد متأخراً (epoch ms) */
      eventAt: number
    }

export interface AtRiskStudent {
  student: RosterStudent
  reasons: AtRiskReason[]
  /** أطول سلسلة غياب (0 عند غياب السبب) — مفتاح ترتيب */
  absenceStreak: number
  /** مجموع المتأخرات (0 عند غياب السبب) — مفتاح ترتيب */
  overdueAmount: number
  /** جهة اتصال ولي الأمر المحلولة — لبناء رابط واتساب في الواجهة */
  contact: GuardianContact | undefined
}

/** «4 حصص» / «12 حصة» — جمع عربي بسيط لأعداد الحصص */
export function sessionsWord(n: number): string {
  // صيغ CLDR من القاموس (W7): few = 3–10 «حصص»، وغيرها «حصة»
  return t('atrisk.sessions', { count: n })
}

/** «شهرين» / «3 شهور» / «12 شهراً» — امتداد المتأخرات بالشهور */
export function monthsSpanWord(n: number): string {
  // صيغ CLDR من القاموس (W7): two «شهرين»، few «شهور»، وغيرها «شهراً»
  return t('atrisk.monthsSpan', { count: n })
}

/** فرق الشهور بين شهري 'YYYY-MM-DD' (أولهما) — بلا أيام */
function monthDiff(fromMonthStart: string, toMonthStart: string): number {
  const [fy, fm] = fromMonthStart.split('-').map(Number)
  const [ty, tm] = toMonthStart.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** بداية الشهر التالي لشهر 'YYYY-MM-DD' كطابع زمني محلي */
function nextMonthStartTs(monthStart: string): number {
  const [y, m] = monthStart.split('-').map(Number)
  return new Date(y, m, 1).getTime()
}

// ---------------------------------------------------------------------------
// الاشتقاقات النقية (موجة W2 — مستخرجة حرفياً من fetchAtRisk حتى تُختبَر
// قواعد الخطر بلا قاعدة بيانات؛ الجلب يمرّر لها البيانات جاهزة)
// ---------------------------------------------------------------------------

export interface SessionMarkInput {
  /** ميعاد بداية الحصة (epoch ms) */
  at: number
  /** حالة الحضور المسجلة للطالب — null/undefined = غير مُعلَّمة (تُتخطّى ولا تكسر) */
  mark: string | null | undefined
}

/**
 * سلسلة الغياب المتتالي لحصص مرتبة بترتيبها الفعلي (الأقدم ← الأحدث):
 * نمشي من الأحدث للأقدم، نتخطى غير المُعلَّمة، ونقف عند أول حالة غير
 * غياب. lastAbsenceAt = ميعاد أحدث غياب في السلسلة (0 بلا سلسلة).
 */
export function absenceStreakOf(sessions: SessionMarkInput[]): {
  streak: number
  lastAbsenceAt: number
} {
  let streak = 0
  let lastAbsenceAt = 0
  for (let i = sessions.length - 1; i >= 0; i--) {
    const { mark, at } = sessions[i]
    if (mark == null) continue // غير مُعلَّمة له — تُتخطّى ولا تكسر
    if (mark !== 'a') break
    streak += 1
    if (lastAbsenceAt === 0) lastAbsenceAt = at
  }
  return { streak, lastAbsenceAt }
}

export interface OverdueBalanceInput {
  invoice_id: string
  period_month: string
  balance: number | string
}

export interface OverdueDerivation {
  monthsSpan: number
  amount: number
  eventAt: number
}

/**
 * اشتقاق سبب المتأخرات لطالب واحد من صفوف أرصدته المتأخرة (الفواتير ذات
 * period_month قبل الشهر الحالي فقط — الترشيح يحدث عند الجلب): الامتداد
 * = عدد الشهور من أقدم شهر متأخر حتى الشهر الحالي شاملاً الطرفين، وتحت
 * عتبة OVERDUE_SPAN_THRESHOLD يرجع null (لا سبب). eventAt = أحدث لحظة
 * «أصبح فيها جزء من الرصيد متأخراً» (إنشاء فاتورة أو بداية شهر تأخرها).
 */
export function overdueDerivationOf(
  rows: OverdueBalanceInput[],
  createdByInvoiceId: Map<string, number>,
  currentMonth: string,
): OverdueDerivation | null {
  if (rows.length === 0) return null
  const oldest = rows.reduce(
    (min, r) => (r.period_month < min ? r.period_month : min),
    rows[0].period_month,
  )
  const span = monthDiff(oldest, currentMonth) + 1
  if (span < OVERDUE_SPAN_THRESHOLD) return null
  const amount = rows.reduce((sum, r) => sum + (Number(r.balance) || 0), 0)
  const eventAt = Math.max(
    ...rows.map((r) =>
      Math.max(createdByInvoiceId.get(r.invoice_id) ?? 0, nextMonthStartTs(r.period_month)),
    ),
  )
  return { monthsSpan: span, amount, eventAt }
}

/**
 * هل تُخفي «آخر متابعة» الطالب؟ نعم فقط إن كانت أحدث من كل أحداث خطره
 * الحالية — حدث أجدد واحد (غياب أحدث أو فاتورة أجدد) يعيد إظهاره.
 */
export function hiddenByFollowup(
  eventAts: number[],
  followedAt: number | null | undefined,
): boolean {
  return followedAt != null && eventAts.every((at) => at <= followedAt)
}

/** مفاتيح ترتيب قائمة المعرّضين (انظر ترويسة الوحدة) */
export interface AtRiskSortKey {
  reasonsCount: number
  absenceStreak: number
  overdueAmount: number
  name: string
}

/** الترتيب: عدد الأسباب أكثر أولاً، ثم الغياب الأطول، ثم المتأخرات الأكبر، ثم الاسم */
export function compareAtRisk(a: AtRiskSortKey, b: AtRiskSortKey): number {
  return (
    b.reasonsCount - a.reasonsCount ||
    b.absenceStreak - a.absenceStreak ||
    b.overdueAmount - a.overdueAmount ||
    a.name.localeCompare(b.name, 'ar')
  )
}

const STUDENT_COLS = 'id, name, public_code, phone, guardian_name, guardian_phone'

interface SessionLite {
  id: string
  group_id: string
  session_date: string
  start_time: string
}

export async function fetchAtRisk(
  teacherId: string,
  today: string,
  isOwner: boolean,
): Promise<AtRiskStudent[]> {
  const supa = db()
  const currentMonth = monthStartStr(today)

  // الطلاب النشطون (غير الموقوفين) — نطاق الاشتقاق كله
  const { data: studentData, error: stErr } = await supa
    .from('students')
    .select(STUDENT_COLS)
    .eq('teacher_id', teacherId)
    .eq('paused', false)
  if (stErr) throw stErr
  const students = (studentData ?? []) as unknown as RosterStudent[]
  if (students.length === 0) return []
  const studentById = new Map(students.map((s) => [s.id, s]))

  // أسماء المجموعات + تسجيلات الطلاب فيها
  const { data: groupData, error: gErr } = await supa
    .from('groups')
    .select('id, name')
    .eq('teacher_id', teacherId)
  if (gErr) throw gErr
  const groupNameById = new Map(
    ((groupData ?? []) as { id: string; name: string }[]).map((g) => [g.id, g.name]),
  )
  const { data: enrData, error: eErr } = await supa
    .from('enrollments')
    .select('student_id, group_id')
    .eq('teacher_id', teacherId)
    .in('student_id', students.map((s) => s.id))
  if (eErr) throw eErr
  const groupsByStudent = new Map<string, string[]>()
  for (const row of (enrData ?? []) as { student_id: string; group_id: string }[]) {
    const list = groupsByStudent.get(row.student_id) ?? []
    list.push(row.group_id)
    groupsByStudent.set(row.student_id, list)
  }

  // (أ) الغياب المتتالي: حصص ≤ اليوم غير الملغاة بترتيبها الفعلي،
  // وعلامات الحضور المسجلة عليها
  const absenceReasonByStudent = new Map<string, Extract<AtRiskReason, { kind: 'absence' }>>()
  {
    const { data: sessData, error: sErr } = await supa
      .from('sessions')
      .select('id, group_id, session_date, start_time')
      .eq('teacher_id', teacherId)
      .lte('session_date', today)
      .neq('status', 'cancelled')
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true })
    if (sErr) throw sErr
    const sessions = (sessData ?? []) as unknown as SessionLite[]
    const sessionsByGroup = new Map<string, SessionLite[]>()
    for (const s of sessions) {
      const list = sessionsByGroup.get(s.group_id) ?? []
      list.push(s)
      sessionsByGroup.set(s.group_id, list)
    }
    if (sessions.length > 0) {
      const { data: attData, error: aErr } = await supa
        .from('attendance')
        .select('session_id, student_id, status')
        .eq('teacher_id', teacherId)
        .not('status', 'is', null)
        .in('session_id', sessions.map((s) => s.id))
      if (aErr) throw aErr
      const markBySessionStudent = new Map<string, string>()
      for (const row of (attData ?? []) as { session_id: string; student_id: string; status: string }[]) {
        markBySessionStudent.set(`${row.session_id}|${row.student_id}`, row.status)
      }
      // لكل (طالب، مجموعة): سلسلة الغياب من الاشتقاق النقي absenceStreakOf
      for (const st of students) {
        for (const groupId of groupsByStudent.get(st.id) ?? []) {
          const groupSessions = sessionsByGroup.get(groupId) ?? []
          const { streak, lastAbsenceAt } = absenceStreakOf(
            groupSessions.map((sess) => ({
              at: new Date(`${sess.session_date}T${sess.start_time.slice(0, 8)}`).getTime(),
              mark: markBySessionStudent.get(`${sess.id}|${st.id}`),
            })),
          )
          if (streak >= ABSENCE_STREAK_THRESHOLD) {
            const prev = absenceReasonByStudent.get(st.id)
            if (!prev || streak > prev.streak) {
              absenceReasonByStudent.set(st.id, {
                kind: 'absence',
                text: t('atrisk.reasonAbsence', { sessions: sessionsWord(streak) }),
                streak,
                groupName: groupNameById.get(groupId) ?? 'مجموعته',
                eventAt: lastAbsenceAt,
              })
            }
          }
        }
      }
    }
  }

  // (ب) المتأخرات الممتدة — مالك فقط (انظر الترويسة)
  const overdueReasonByStudent = new Map<string, Extract<AtRiskReason, { kind: 'overdue' }>>()
  if (isOwner) {
    const { data: balData, error: bErr } = await supa
      .from('invoice_balances')
      .select('invoice_id, student_id, period_month, balance')
      .eq('teacher_id', teacherId)
      .gt('balance', 0)
      .lt('period_month', currentMonth)
    if (bErr) throw bErr
    const balRows = (balData ?? []) as unknown as {
      invoice_id: string
      student_id: string
      period_month: string
      balance: number | string
    }[]
    if (balRows.length > 0) {
      // لحظات إنشاء الفواتير — جزء من حساب «متى أصبحت متأخرة»
      const { data: invData, error: iErr } = await supa
        .from('invoices')
        .select('id, created_at')
        .eq('teacher_id', teacherId)
        .in('id', balRows.map((r) => r.invoice_id))
      if (iErr) throw iErr
      const createdById = new Map(
        ((invData ?? []) as { id: string; created_at: string }[]).map((r) => [
          r.id,
          new Date(r.created_at).getTime(),
        ]),
      )
      const byStudent = new Map<string, typeof balRows>()
      for (const row of balRows) {
        const list = byStudent.get(row.student_id) ?? []
        list.push(row)
        byStudent.set(row.student_id, list)
      }
      for (const [studentId, rows] of byStudent) {
        if (!studentById.has(studentId)) continue // طالب موقوف — خارج النطاق
        const derived = overdueDerivationOf(rows, createdById, currentMonth)
        if (!derived) continue
        overdueReasonByStudent.set(studentId, {
          kind: 'overdue',
          text: t('atrisk.reasonOverdue', { span: monthsSpanWord(derived.monthsSpan), amount: formatMoney(derived.amount) }),
          monthsSpan: derived.monthsSpan,
          amount: derived.amount,
          eventAt: derived.eventAt,
        })
      }
    }
  }

  // دمج الأسباب + تطبيق إخفاء المتابعة
  const candidateIds = new Set<string>([
    ...absenceReasonByStudent.keys(),
    ...overdueReasonByStudent.keys(),
  ])
  if (candidateIds.size === 0) return []

  const { data: fuData, error: fErr } = await supa
    .from('at_risk_followups')
    .select('student_id, followed_at')
    .eq('teacher_id', teacherId)
    .in('student_id', [...candidateIds])
    .order('followed_at', { ascending: false })
  if (fErr) throw fErr
  const lastFollowByStudent = new Map<string, number>()
  for (const row of (fuData ?? []) as { student_id: string; followed_at: string }[]) {
    if (!lastFollowByStudent.has(row.student_id)) {
      lastFollowByStudent.set(row.student_id, new Date(row.followed_at).getTime())
    }
  }

  const visibleIds: string[] = []
  const reasonsByStudent = new Map<string, AtRiskReason[]>()
  for (const id of candidateIds) {
    const reasons: AtRiskReason[] = []
    const abs = absenceReasonByStudent.get(id)
    if (abs) reasons.push(abs)
    const ovd = overdueReasonByStudent.get(id)
    if (ovd) reasons.push(ovd)
    const followedAt = lastFollowByStudent.get(id)
    // مخفي فقط إن كانت المتابعة أحدث من كل أحداث الخطر الحالية
    if (hiddenByFollowup(reasons.map((r) => r.eventAt), followedAt)) continue
    visibleIds.push(id)
    reasonsByStudent.set(id, reasons)
  }
  if (visibleIds.length === 0) return []

  const contacts = await fetchGuardianContacts(teacherId, visibleIds)
  const result: AtRiskStudent[] = visibleIds.map((id) => {
    const reasons = reasonsByStudent.get(id)!
    return {
      student: studentById.get(id)!,
      reasons,
      absenceStreak: absenceReasonByStudent.get(id)?.streak ?? 0,
      overdueAmount: overdueReasonByStudent.get(id)?.amount ?? 0,
      contact: contacts.get(id),
    }
  })
  result.sort((a, b) =>
    compareAtRisk(
      {
        reasonsCount: a.reasons.length,
        absenceStreak: a.absenceStreak,
        overdueAmount: a.overdueAmount,
        name: a.student.name,
      },
      {
        reasonsCount: b.reasons.length,
        absenceStreak: b.absenceStreak,
        overdueAmount: b.overdueAmount,
        name: b.student.name,
      },
    ),
  )
  return result
}

/** تسجيل «تمت المتابعة» — صف جديد في at_risk_followups (migration ‏0018) */
export async function markAtRiskFollowedUp(
  teacherId: string,
  studentId: string,
  userId: string,
  reasonsSummary: string,
): Promise<void> {
  const { error } = await db()
    .from('at_risk_followups')
    .insert({
      teacher_id: teacherId,
      student_id: studentId,
      followed_by: userId,
      note: reasonsSummary || null,
    })
  if (error) throw error
}

/**
 * رابط متابعة واتساب لولي الأمر (wa.me يدوي كنمط التطبيق): نص مهذب
 * باسم السنتر (الهوية البيضاء) يناسب سبب/سببي الخطر الفعليين للطالب —
 * غياباً كان أم متأخرات أم كليهما. null عند غياب أي رقم صالح.
 */
export function atRiskWaUrl(
  item: AtRiskStudent,
  centreName: string | null,
): string | null {
  const { name: guardianName, phone } = resolveGuardian(item.student, item.contact)
  const base = waLink(phone)
  if (!base) return null
  const centre = centreName?.trim() ? centreName.trim() : 'السنتر'
  const lines = [`أهلاً ${guardianName}، معاكم ${centre}.`]
  for (const reason of item.reasons) {
    if (reason.kind === 'absence') {
      lines.push(
        `بنطمن على ${item.student.name}: غاب عن ${sessionsWord(reason.streak)} متتالية في مجموعة ${reason.groupName}، وحابين نتأكد إن مفيش مشكلة وإننا نقدر نساعد بأي شكل.`,
      )
    } else {
      lines.push(
        `بنذكّركم إن على ${item.student.name} اشتراكاً متأخراً (${monthsSpanWord(reason.monthsSpan)}) بمبلغ ${formatMoney(reason.amount)} — شاكرين تعاونكم في السداد في أقرب وقت ممكن.`,
      )
    }
  }
  lines.push('شكراً لمتابعتكم، ويسعدنا دايماً تواصلكم معانا.')
  return `${base}?text=${encodeURIComponent(lines.join('\n'))}`
}
