import { supabase } from '../../lib/supabase'
import { formatMoney, shortTime, waLink } from '../../lib/format'
import {
  addDaysStr,
  fetchActiveCountsByGroup,
  fetchAttendanceForSessions,
  fetchSessionsInRange,
} from '../home/api'
import {
  fetchGuardianContacts,
  resolveGuardian,
  type GuardianContact,
  type RosterStudent,
} from '../attendance/api'
import { fmtScore, pctOf, scoreWaUrl } from '../grades/api'
import { MONTH_NAMES } from '../schedule/api'

function db() {
  if (!supabase) throw new Error('Supabase غير مربوط — راجع إعدادات .env')
  return supabase
}

// ---------------------------------------------------------------------------
// مصدر الاشتقاق الواحد للتنبيهات — الخطوة 8 (المواصفات §3.13 + §5.7،
// وخطة Phase 1 خطوة 8: «قوائم مشتقة (متأخرات، غياب متكرر، فواتير مستحقة)
// + إرسال واتساب عبر روابط wa.me»).
//
// الدالة دي هي getAlerts نفسها بعد توسيعها في مكانها ونقلها هنا:
// شاشة الإشعارات وبطاقة تنبيهات الرئيسية (useHomeAlerts بنفس مفتاح الكاش)
// تقرآن منها، فعدد التنبيهات وأول تنبيه متطابقان بين الشاشتين بالبناء.
// نصوص الأنواع الخمسة الأصلية ووجهاتها (to) منقولة حرفياً من تنفيذ
// الرئيسية السابق (§5.7) — لا تغيير في العقد.
//
// الأنواع والعتبات:
// • att     — حصة اليوم المجدولة فيها طلاب نشطون بلا حالة حضور مسجلة (§5.7)
// • absence — غياب متكرر (خطة Phase 1 خطوة 8؛ المواصفات لا تعرّفه داخل
//             getAlerts): طالب نشط غاب (status='a') ‏≥ 3 مرات في حصص
//             آخر 30 يوماً — عتبة موثّقة هنا لأن المرجع لا يحدد رقماً.
// • prepaid — باقي باقة الطالب ≤ 1 حصة (§5.7: prepaid − حضر فعلياً p/l/m)
// • fin     — طالب نشط رصيده في student_balances ‏> 0، تنبيه لكل طالب
//             (§5.7) — مالك فقط. تفاصيل «الفواتير المستحقة» (خطة خطوة 8)
//             مرفقة في invoices: فواتير الطالب غير المسددة من
//             invoice_balances، كل واحدة برابط تفاصيلها.
// • grade   — تقييم فيه درجات < 50%، تنبيه مجمّع لكل تقييم (§5.7)،
//             وتفاصيل الطلاب المنخفضين مرفقة في lowStudents برسالة
//             الدرجة الجاهزة (§5.6) لكل طالب.
// • backup  — لا تصدير أبداً أو مرّت ≥ 30 يوماً على teacher_settings.
//             last_export_at (§5.7) — مالك فقط (RLS الإعدادات للمالك).
//
// المالية (fin + backup) للمالك فقط كما في المرجع: لا تُشتق أصلاً عند
// isOwner=false، وRLS تحجب جداولها عن المساعد في قاعدة البيانات نفسها.
//
// رسائل واتساب: الدرجة بنص §5.6 الحرفي عبر scoreWaUrl من وحدة الدرجات،
// ورقم ولي الأمر بنفس ترتيب وحدة الحضور (resolveGuardian: المرتبط في
// guardians أولاً ثم guardian_phone ثم موبايل الطالب). رسالتا تذكير
// الدفع ونفاد الباقة/الغياب المتكرر لا نصّ حرفياً لهما في المرجع
// (§3.13 يذكر «تذكيراً مهذباً جاهزاً» دون اقتباسه)، فصيغتا هنا بنفس
// أسلوب رسائل §5.6 وموثّقتان كامتداد للخطوة.
// ---------------------------------------------------------------------------

export type AlertKind = 'att' | 'absence' | 'prepaid' | 'fin' | 'proof' | 'grade' | 'backup'

export interface AlertInvoiceRef {
  invoice_id: string
  period_month: string
  group_name: string
  total: number
  paid: number
  balance: number
}

export interface AlertLowStudent {
  student_id: string
  student_name: string
  score: number
  max_score: number
  pct: number
  /** رابط إرسال الدرجة لولي الأمر (§5.6) — null عند غياب أي رقم صالح */
  waUrl: string | null
}

export interface AppAlert {
  kind: AlertKind
  /** نص التنبيه — مطابق لنص getAlerts في المرجع/الرئيسية */
  text: string
  /** الوجهة عند الضغط — مطابقة لعقد الرئيسية */
  to: string
  /** سطر تفصيلي إضافي لشاشة الإشعارات فقط (لا يدخل في نص الرئيسية) */
  detail?: string
  studentId?: string
  studentName?: string
  groupName?: string
  /** رابط واتساب خاص بالتنبيه نفسه (fin/prepaid/absence) — null إن لا رقم */
  waUrl?: string | null
  /** فواتير الطالب غير المسددة — لتنبيهات fin فقط */
  invoices?: AlertInvoiceRef[]
  /** الطلاب تحت 50% بتفاصيلهم — لتنبيهات grade فقط */
  lowStudents?: AlertLowStudent[]
}

export const ALERT_KINDS: AlertKind[] = ['att', 'absence', 'prepaid', 'fin', 'proof', 'grade', 'backup']

export const SECTION_META: Record<AlertKind, { title: string }> = {
  att: { title: 'حضور اليوم لسه متسجلش' },
  absence: { title: 'غياب متكرر' },
  prepaid: { title: 'باقات على وشك النفاد' },
  fin: { title: 'متأخرات الدفع' },
  proof: { title: 'إثباتات دفع بانتظار المراجعة' },
  grade: { title: 'درجات منخفضة' },
  backup: { title: 'النسخ الاحتياطي' },
}

/** عتبة الغياب المتكرر: غيابات (a) خلال نافذة الأيام دي — انظر الترويسة */
export const ABSENCE_WINDOW_DAYS = 30
export const ABSENCE_THRESHOLD = 3

/** نص «تذكير عام» (§3.13: نص تذكير مهذب جاهز للنسخ — المرجع لا يقتبسه حرفياً) */
export const GENERIC_REMINDER_TEXT =
  'أهلاً وسهلاً، نذكّركم بوجود اشتراك مستحق لم يُسدّد بعد. برجاء السداد في أقرب وقت ممكن، وشكراً لتعاونكم.'

/** '2026-11-01' → 'نوفمبر 2026' — نفس periodLabel في وحدة الفواتير */
function periodLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split('-').map(Number)
  return `${MONTH_NAMES[(m ?? 1) - 1] ?? ''} ${y ?? ''}`.trim()
}

type ContactStudent = Pick<
  RosterStudent,
  'id' | 'name' | 'public_code' | 'phone' | 'guardian_name' | 'guardian_phone'
>

const STUDENT_CONTACT_COLS = 'id, name, public_code, paused, phone, guardian_name, guardian_phone'

async function fetchContactStudents(
  teacherId: string,
  studentIds: string[],
): Promise<Map<string, ContactStudent & { paused: boolean }>> {
  const map = new Map<string, ContactStudent & { paused: boolean }>()
  if (studentIds.length === 0) return map
  const { data, error } = await db()
    .from('students')
    .select(STUDENT_CONTACT_COLS)
    .eq('teacher_id', teacherId)
    .in('id', studentIds)
  if (error) throw error
  for (const row of (data ?? []) as unknown as (ContactStudent & { paused: boolean })[]) {
    map.set(row.id, row)
  }
  return map
}

/** رابط واتساب برسالة مبنية من اسم ولي الأمر الفعّال ورقمه (ترتيب الحضور) */
function waUrlFor(
  student: ContactStudent,
  contact: GuardianContact | undefined,
  buildMessage: (guardianName: string) => string,
): string | null {
  const { name: guardianName, phone } = resolveGuardian(student, contact)
  const base = waLink(phone)
  if (!base) return null
  return `${base}?text=${encodeURIComponent(buildMessage(guardianName))}`
}

export async function fetchAlerts(
  teacherId: string,
  today: string,
  isOwner: boolean,
): Promise<AppAlert[]> {
  const alerts: AppAlert[] = []
  const supa = db()

  // أسماء المجموعات — لتفاصيل الفواتير المستحقة ودرجات التقييمات
  const groupNameById = new Map<string, string>()
  {
    const { data, error } = await supa
      .from('groups')
      .select('id, name')
      .eq('teacher_id', teacherId)
    if (error) throw error
    for (const g of (data ?? []) as { id: string; name: string }[]) {
      groupNameById.set(g.id, g.name)
    }
  }

  // att: حصص اليوم المجدولة فيها طلاب بلا حالة حضور مسجلة (§5.7)
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
          groupName: s.group_name,
          detail: `حصة اليوم · الساعة ${shortTime(s.start_time)} · ${s.duration_minutes} دقيقة`,
        })
      }
    }
  }

  // absence: غياب متكرر — ≥ ABSENCE_THRESHOLD غيابات (a) في آخر
  // ABSENCE_WINDOW_DAYS يوماً لطالب نشط (خطة Phase 1 خطوة 8)
  {
    const from = addDaysStr(today, -(ABSENCE_WINDOW_DAYS - 1))
    const { data, error } = await supa
      .from('attendance')
      .select('student_id, sessions!inner(session_date)')
      .eq('teacher_id', teacherId)
      .eq('status', 'a')
      .gte('sessions.session_date', from)
      .lte('sessions.session_date', today)
    if (error) throw error
    const counts = new Map<string, number>()
    for (const row of (data ?? []) as unknown as { student_id: string }[]) {
      counts.set(row.student_id, (counts.get(row.student_id) ?? 0) + 1)
    }
    const repeatIds = [...counts.entries()]
      .filter(([, n]) => n >= ABSENCE_THRESHOLD)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
    if (repeatIds.length > 0) {
      const students = await fetchContactStudents(teacherId, repeatIds)
      const contacts = await fetchGuardianContacts(teacherId, repeatIds)
      for (const id of repeatIds) {
        const st = students.get(id)
        if (!st || st.paused) continue
        const n = counts.get(id) ?? 0
        alerts.push({
          kind: 'absence',
          text: `${st.name} غاب ${n} مرات خلال آخر ${ABSENCE_WINDOW_DAYS} يوم`,
          to: `/students/${id}`,
          studentId: id,
          studentName: st.name,
          detail: 'غياب متكرر — يستحق متابعة مع ولي الأمر',
          waUrl: waUrlFor(st, contacts.get(id), (g) =>
            `أهلاً ${g}، نلاحظ تكرار غياب الطالب ${st.name} — تغيّب ${n} مرات خلال آخر ${ABSENCE_WINDOW_DAYS} يوم. نرجو المتابعة معنا، وشكراً لكم.`,
          ),
        })
      }
    }
  }

  // prepaid: باقي باقة طالب ≤ 1 (عدّاد الباقة في المرجع §5.7)
  {
    const { data: enr, error } = await supa
      .from('enrollments')
      .select(
        'student_id, group_id, prepaid_sessions, groups(name), students!inner(name, public_code, paused, phone, guardian_name, guardian_phone)',
      )
      .eq('teacher_id', teacherId)
      .not('prepaid_sessions', 'is', null)
      .eq('students.paused', false)
    if (error) throw error
    const rows = (enr ?? []) as unknown as {
      student_id: string
      group_id: string
      prepaid_sessions: number
      groups: { name?: string } | null
      students: {
        name?: string
        public_code?: string
        phone?: string | null
        guardian_name?: string | null
        guardian_phone?: string | null
      } | null
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
      const contacts = await fetchGuardianContacts(
        teacherId,
        rows.map((r) => r.student_id),
      )
      for (const r of rows) {
        const left = Math.max(0, r.prepaid_sessions - (used.get(`${r.student_id}|${r.group_id}`) ?? 0))
        if (left <= 1) {
          const groupName = r.groups?.name ?? 'مجموعة'
          const st: ContactStudent = {
            id: r.student_id,
            name: r.students?.name ?? '—',
            public_code: r.students?.public_code ?? '',
            phone: r.students?.phone ?? null,
            guardian_name: r.students?.guardian_name ?? null,
            guardian_phone: r.students?.guardian_phone ?? null,
          }
          alerts.push({
            kind: 'prepaid',
            text: `(${groupName}): متبقي ${left} حصة فقط من الباقة`,
            to: `/students/${r.student_id}`,
            studentId: r.student_id,
            studentName: st.name,
            groupName,
            detail: `الطالب: ${st.name}`,
            waUrl: waUrlFor(st, contacts.get(r.student_id), (g) =>
              `أهلاً ${g}، نذكّركم إن باقة الطالب ${st.name} في مجموعة ${groupName} متبقي فيها ${left} حصة فقط.`,
            ),
          })
        }
      }
    }
  }

  // fin (مالك فقط): طالب نشط رصيده > 0 — تنبيه لكل طالب (§5.7)،
  // مع فواتيره المستحقة من invoice_balances وتذكير دفع واتساب
  if (isOwner) {
    const { data: bals, error } = await supa
      .from('student_balances')
      .select('student_id, balance')
      .eq('teacher_id', teacherId)
      .gt('balance', 0)
    if (error) throw error
    const balRows = (bals ?? []) as unknown as { student_id: string; balance: number | string }[]
    if (balRows.length > 0) {
      const studentIds = balRows.map((b) => b.student_id)
      const students = await fetchContactStudents(teacherId, studentIds)
      const contacts = await fetchGuardianContacts(teacherId, studentIds)

      const { data: invData, error: invErr } = await supa
        .from('invoice_balances')
        .select('invoice_id, student_id, group_id, period_month, total, paid, balance')
        .eq('teacher_id', teacherId)
        .gt('balance', 0)
      if (invErr) throw invErr
      const invoicesByStudent = new Map<string, AlertInvoiceRef[]>()
      for (const row of (invData ?? []) as unknown as {
        invoice_id: string
        student_id: string
        group_id: string
        period_month: string
        total: number | string
        paid: number | string
        balance: number | string
      }[]) {
        const list = invoicesByStudent.get(row.student_id) ?? []
        list.push({
          invoice_id: row.invoice_id,
          period_month: row.period_month,
          group_name: groupNameById.get(row.group_id) ?? '—',
          total: Number(row.total) || 0,
          paid: Number(row.paid) || 0,
          balance: Number(row.balance) || 0,
        })
        invoicesByStudent.set(row.student_id, list)
      }
      for (const list of invoicesByStudent.values()) {
        list.sort((a, b) => a.period_month.localeCompare(b.period_month))
      }

      for (const b of balRows) {
        const st = students.get(b.student_id)
        if (!st || st.paused) continue
        const balance = Number(b.balance) || 0
        const invoices = invoicesByStudent.get(b.student_id) ?? []
        alerts.push({
          kind: 'fin',
          text: `${st.name} عليه ${formatMoney(balance)}`,
          to: `/students/${b.student_id}`,
          studentId: b.student_id,
          studentName: st.name,
          detail:
            invoices.length > 0
              ? `${invoices.length} فاتورة غير مسددة · أقدمها ${periodLabel(invoices[0].period_month)}`
              : undefined,
          invoices,
          waUrl: waUrlFor(st, contacts.get(b.student_id), (g) =>
            `أهلاً ${g}، نذكّركم بوجود مبلغ مستحق على الطالب ${st.name} قدره ${formatMoney(balance)}. برجاء السداد في أقرب وقت ممكن، وشكراً لكم.`,
          ),
        })
      }
    }
  }

  // grade: تقييم فيه درجات أقل من 50% — مجمّع لكل تقييم (§5.7)،
  // مع تفاصيل كل طالب منخفض ودرجته ورابط إرسالها (§5.6)
  {
    const { data, error } = await supa
      .from('scores')
      .select('student_id, score, assessments!inner(id, title, max_score, group_id)')
      .eq('teacher_id', teacherId)
    if (error) throw error
    const byAssessment = new Map<
      string,
      { title: string; groupId: string; max: number; lows: { student_id: string; score: number }[] }
    >()
    for (const row of (data ?? []) as unknown as {
      student_id: string
      score: number | string
      assessments: { id: string; title: string; max_score: number | string; group_id: string }
    }[]) {
      const max = Number(row.assessments.max_score) || 0
      if (max <= 0) continue
      if ((Number(row.score) / max) * 100 < 50) {
        const cur = byAssessment.get(row.assessments.id) ?? {
          title: row.assessments.title,
          groupId: row.assessments.group_id,
          max,
          lows: [],
        }
        cur.lows.push({ student_id: row.student_id, score: Number(row.score) || 0 })
        byAssessment.set(row.assessments.id, cur)
      }
    }
    if (byAssessment.size > 0) {
      const lowIds = [...new Set([...byAssessment.values()].flatMap((v) => v.lows.map((l) => l.student_id)))]
      const students = await fetchContactStudents(teacherId, lowIds)
      const contacts = await fetchGuardianContacts(teacherId, lowIds)
      for (const [id, v] of byAssessment) {
        const lowStudents: AlertLowStudent[] = v.lows.map((l) => {
          const st = students.get(l.student_id)
          const roster: RosterStudent = st ?? {
            id: l.student_id,
            name: '—',
            public_code: '',
            phone: null,
            guardian_name: null,
            guardian_phone: null,
          }
          return {
            student_id: l.student_id,
            student_name: st?.name ?? '—',
            score: l.score,
            max_score: v.max,
            pct: pctOf(l.score, v.max) ?? 0,
            waUrl: scoreWaUrl(roster, contacts.get(l.student_id), { title: v.title, max_score: v.max }, l.score),
          }
        })
        alerts.push({
          kind: 'grade',
          text: `${v.lows.length} طالب تحت 50% في ${v.title}`,
          to: `/assessments/${id}`,
          groupName: groupNameById.get(v.groupId),
          detail: v.lows
            .map((l) => {
              const st = students.get(l.student_id)
              return `${st?.name ?? '—'}: ${fmtScore(l.score)} من ${fmtScore(v.max)}`
            })
            .join(' · '),
          lowStudents,
        })
      }
    }
  }

  // proof (مالك فقط — Phase 2 خطوة 7): إثباتات دفع رفعها أولياء الأمور
  // من البوابة ومكتملة الرفع، لسه بلا مراجعة. تنبيه مجمّع واحد بعدّادها
  // (لا تنبيه لكل إثبات) ووجهته قسم المراجعة في شاشة الفواتير، فيغذّي
  // شارة التنبيهات من نفس المصدر الواحد بلا عدّاد موازٍ.
  if (isOwner) {
    const { count, error } = await supa
      .from('payment_proofs')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', teacherId)
      .eq('status', 'pending')
      .not('uploaded_at', 'is', null)
    if (error) throw error
    if ((count ?? 0) > 0) {
      alerts.push({
        kind: 'proof',
        text: `عندك ${count} إثبات دفع مستني المراجعة`,
        to: '/invoices',
        detail: 'راجع اللقطات واعتمدها فتتحول لدفعات مسجلة — من قسم «إثباتات دفع قيد المراجعة» في شاشة الفواتير',
      })
    }
  }

  // backup (مالك فقط): لا تصدير أبداً أو مرّت ≥ 30 يوماً على آخر تصدير (§5.7)
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

/** قائمة المتأخرات كنص قابل للنسخ (§3.13 ‏copy-overdue) — من تنبيهات fin نفسها */
export function overdueListText(alerts: AppAlert[]): string {
  return alerts
    .filter((a) => a.kind === 'fin')
    .map((a) => a.text)
    .join('\n')
}
