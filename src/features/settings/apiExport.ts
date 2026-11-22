import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import { toCsv } from '../../lib/csv'
import { PAYMENT_METHOD_LABELS } from '../invoices/api'
import { STATUS_LABELS } from '../attendance/api'
import { fetchGroups } from '../groups/api'
import { fetchPaged, todayFileStamp } from './apiShared'

// ===========================================================================
// تصدير CSV وتنزيل الملفات (الدفعة #7 / 3A-360 — COD-2: فُصلت من
// settings/api.ts بنقل حرفي؛ السطح العام يبقى عبر api.ts).
// ===========================================================================

/** تنزيل نص كملف فعلي من المتصفح (CSV / JSON) */
export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // تأخير بسيط قبل إلغاء الرابط حتى يبدأ التنزيل فعلياً في كل المتصفحات
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ===========================================================================
// تصدير CSV — الجداول الخمسة في المواصفات §5.8 بأعمدتها حرفياً، + جدول
// الطلاب (مطلوب صراحة في تكليف الخطوة؛ المرجع §3.14 يذكر «تصدير CSV»
// لخمسة جداول وشاشة التصدير عنوانها «جداول Excel واستيراد طلاب»).
// الهروب قياسي (csvEsc في المرجع): اقتباس عند وجود فاصلة/اقتباس/سطر
// جديد ومضاعفة علامات الاقتباس، وفاصل الأسطر \r\n، وبادئة UTF-8 BOM
// عند التنزيل حتى يفتح Excel العربي النص سليماً. المبالغ أرقام خام
// (بلا لاحقة «ج») حتى يقدر Excel يحسب عليها.
// ===========================================================================

// csvEsc/toCsv وُحّدا في lib/csv (مع تحييد حقن الصيغ) ويُعاد تصديرهما من api.ts.
export type CsvKind = 'students' | 'invoices' | 'payments' | 'attendance' | 'scores' | 'expenses'

export const CSV_KINDS: { kind: CsvKind; label: string; hint: string }[] = [
  { kind: 'students', label: t('settings.settingsApiCsvStudentsLabel'), hint: t('settings.settingsApiCsvStudentsHint') },
  { kind: 'invoices', label: t('settings.settingsApiCsvInvoicesLabel'), hint: t('settings.settingsApiCsvInvoicesHint') },
  { kind: 'payments', label: t('settings.settingsApiCsvPaymentsLabel'), hint: t('settings.settingsApiCsvPaymentsHint') },
  { kind: 'attendance', label: t('settings.settingsApiCsvAttendanceLabel'), hint: t('settings.settingsApiCsvAttendanceHint') },
  { kind: 'scores', label: t('settings.settingsApiCsvScoresLabel'), hint: t('settings.settingsApiCsvScoresHint') },
  { kind: 'expenses', label: t('settings.settingsApiCsvExpensesLabel'), hint: t('settings.settingsApiCsvExpensesHint') },
]

export interface CsvResult {
  filename: string
  /** المحتوى مع BOM — جاهز للتنزيل المباشر */
  content: string
  rowCount: number
}

const STUDENT_COLS =
  'id, teacher_id, public_code, name, grade, school, paused, phone, guardian_name, guardian_phone, level_note, created_at, updated_at'
async function buildStudentsCsv(teacherId: string): Promise<{ headers: string[]; rows: unknown[][] }> {
  const supa = db()
  const students = await fetchPaged<Record<string, unknown>>((from, to) =>
    supa
      .from('students')
      .select(STUDENT_COLS)
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: true })
      .range(from, to),
  )
  const groups = await fetchGroups(teacherId)
  const groupName = new Map(groups.map((g) => [g.id, g.name]))
  const enrollments = await fetchPaged<{ student_id: string; group_id: string }>((from, to) =>
    supa
      .from('enrollments')
      .select('student_id, group_id')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: true })
      .range(from, to),
  )
  const groupsByStudent = new Map<string, string[]>()
  for (const e of enrollments) {
    const list = groupsByStudent.get(e.student_id) ?? []
    const name = groupName.get(e.group_id)
    if (name) list.push(name)
    groupsByStudent.set(e.student_id, list)
  }
  return {
    headers: [t('settings.settingsApiColCode'), t('settings.settingsApiColName'), t('settings.settingsApiColGrade'), t('settings.settingsApiColSchool'), t('settings.settingsApiColStudentPhone'), t('settings.settingsApiColGuardian'), t('settings.settingsApiColGuardianPhone'), t('settings.settingsApiColGroups'), t('settings.settingsApiColStatus'), t('settings.settingsApiColLevelNote')],
    rows: students.map((s) => [
      s.public_code,
      s.name,
      s.grade,
      s.school,
      s.phone,
      s.guardian_name,
      s.guardian_phone,
      (groupsByStudent.get(s.id as string) ?? []).join(t('settings.joinSeparator')),
      s.paused ? t('settings.settingsApiStudentPaused') : t('settings.settingsApiStudentActive'),
      s.level_note,
    ]),
  }
}

async function buildInvoicesCsv(teacherId: string): Promise<{ headers: string[]; rows: unknown[][] }> {
  const supa = db()
  const invoices = await fetchPaged<Record<string, unknown>>((from, to) =>
    supa
      .from('invoices')
      .select('id, period_month, students(name, public_code), groups(name)')
      .eq('teacher_id', teacherId)
      .order('period_month', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to),
  )
  const balances = await fetchPaged<Record<string, unknown>>((from, to) =>
    supa
      .from('invoice_balances')
      .select('invoice_id, total, paid, balance')
      .eq('teacher_id', teacherId)
      .range(from, to),
  )
  const balById = new Map(balances.map((b) => [b.invoice_id as string, b]))
  return {
    // أعمدة المرجع §5.8 حرفياً: الشهر، الكود، الطالب، المجموعة، الإجمالي، المدفوع، المتبقي
    headers: [t('settings.settingsApiColMonth'), t('settings.settingsApiColCode'), t('settings.settingsApiColStudent'), t('settings.settingsApiColGroup'), t('settings.settingsApiColTotal'), t('settings.settingsApiColPaid'), t('settings.settingsApiColBalance')],
    rows: invoices.map((inv) => {
      const st = (inv.students ?? {}) as { name?: string; public_code?: string }
      const g = (inv.groups ?? {}) as { name?: string }
      const b = balById.get(inv.id as string)
      return [
        String(inv.period_month ?? '').slice(0, 7),
        st.public_code ?? '',
        st.name ?? '—',
        g.name ?? '—',
        Number(b?.total) || 0,
        Number(b?.paid) || 0,
        Number(b?.balance) || 0,
      ]
    }),
  }
}

async function buildPaymentsCsv(teacherId: string): Promise<{ headers: string[]; rows: unknown[][] }> {
  const payments = await fetchPaged<Record<string, unknown>>((from, to) =>
    db()
      .from('payments')
      .select('paid_on, receipt_no, amount, method, invoices(period_month, students(name))')
      .eq('teacher_id', teacherId)
      .order('paid_on', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to),
  )
  return {
    // أعمدة المرجع §5.8 حرفياً: التاريخ، رقم الإيصال، الطالب، الشهر، المبلغ، الطريقة
    headers: [t('settings.settingsApiColDate'), t('settings.settingsApiColReceiptNo'), t('settings.settingsApiColStudent'), t('settings.settingsApiColMonth'), t('settings.settingsApiColAmount'), t('settings.settingsApiColMethod')],
    rows: payments.map((p) => {
      const inv = (p.invoices ?? {}) as {
        period_month?: string
        students?: { name?: string } | null
      }
      const method = p.method as keyof typeof PAYMENT_METHOD_LABELS
      return [
        p.paid_on,
        p.receipt_no,
        inv.students?.name ?? '—',
        String(inv.period_month ?? '').slice(0, 7),
        Number(p.amount) || 0,
        PAYMENT_METHOD_LABELS[method] ?? String(p.method ?? ''),
      ]
    }),
  }
}

async function buildAttendanceCsv(teacherId: string): Promise<{ headers: string[]; rows: unknown[][] }> {
  const rows = await fetchPaged<Record<string, unknown>>((from, to) =>
    db()
      .from('attendance')
      .select('status, sessions!inner(session_date, groups(name)), students(name)')
      .eq('teacher_id', teacherId)
      .not('status', 'is', null)
      .range(from, to),
  )
  const flat = rows.map((r) => {
    const se = (r.sessions ?? {}) as { session_date?: string; groups?: { name?: string } | null }
    const st = (r.students ?? {}) as { name?: string }
    const status = r.status as keyof typeof STATUS_LABELS | null
    return {
      date: se.session_date ?? '',
      group: se.groups?.name ?? '—',
      student: st.name ?? '—',
      label: status ? (STATUS_LABELS[status] ?? status) : '',
    }
  })
  flat.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.group.localeCompare(b.group) || a.student.localeCompare(b.student),
  )
  return {
    // أعمدة المرجع §5.8 حرفياً: التاريخ، المجموعة، الطالب، الحالة (بالاسم العربي)
    headers: [t('settings.settingsApiColDate'), t('settings.settingsApiColGroup'), t('settings.settingsApiColStudent'), t('settings.settingsApiColStatus')],
    rows: flat.map((f) => [f.date, f.group, f.student, f.label]),
  }
}

async function buildScoresCsv(teacherId: string): Promise<{ headers: string[]; rows: unknown[][] }> {
  const rows = await fetchPaged<Record<string, unknown>>((from, to) =>
    db()
      .from('scores')
      .select('score, assessments!inner(title, assess_date, max_score, groups(name)), students(name)')
      .eq('teacher_id', teacherId)
      .range(from, to),
  )
  const flat = rows.map((r) => {
    const a = (r.assessments ?? {}) as {
      title?: string
      assess_date?: string
      max_score?: number | string
      groups?: { name?: string } | null
    }
    const st = (r.students ?? {}) as { name?: string }
    const score = Number(r.score) || 0
    const max = Number(a.max_score) || 0
    return {
      date: a.assess_date ?? '',
      title: a.title ?? '—',
      group: a.groups?.name ?? '—',
      student: st.name ?? '—',
      score,
      max,
      pct: max > 0 ? Math.round((score / max) * 100) : '',
    }
  })
  flat.sort((a, b) => b.date.localeCompare(a.date) || a.student.localeCompare(b.student))
  return {
    // أعمدة المرجع §5.8 حرفياً: التاريخ، الامتحان، المجموعة، الطالب، الدرجة، النهائية، النسبة%
    headers: [t('settings.settingsApiColDate'), t('settings.settingsApiColExam'), t('settings.settingsApiColGroup'), t('settings.settingsApiColStudent'), t('settings.settingsApiColScore'), t('settings.settingsApiColMaxScore'), t('settings.settingsApiColPct')],
    rows: flat.map((f) => [f.date, f.title, f.group, f.student, f.score, f.max, f.pct]),
  }
}

async function buildExpensesCsv(teacherId: string): Promise<{ headers: string[]; rows: unknown[][] }> {
  const expenses = await fetchPaged<Record<string, unknown>>((from, to) =>
    db()
      .from('expenses')
      .select('expense_date, category, amount, note')
      .eq('teacher_id', teacherId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to),
  )
  return {
    // أعمدة المرجع §5.8 حرفياً: التاريخ، النوع، المبلغ، ملاحظة
    headers: [t('settings.settingsApiColDate'), t('settings.settingsApiColCategory'), t('settings.settingsApiColAmount'), t('settings.settingsApiColNote')],
    rows: expenses.map((e) => [e.expense_date, e.category, Number(e.amount) || 0, e.note]),
  }
}

const CSV_BUILDERS: Record<CsvKind, (teacherId: string) => Promise<{ headers: string[]; rows: unknown[][] }>> = {
  students: buildStudentsCsv,
  invoices: buildInvoicesCsv,
  payments: buildPaymentsCsv,
  attendance: buildAttendanceCsv,
  scores: buildScoresCsv,
  expenses: buildExpensesCsv,
}

/** بناء ملف CSV جاهز للتنزيل (مع BOM) لنوع جدول واحد */
export async function buildCsvFile(teacherId: string, kind: CsvKind): Promise<CsvResult> {
  const { headers, rows } = await CSV_BUILDERS[kind](teacherId)
  return {
    filename: `${kind}-${todayFileStamp()}.csv`,
    content: '\uFEFF' + toCsv(headers, rows),
    rowCount: rows.length,
  }
}
