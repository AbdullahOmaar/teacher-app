import { supabase } from '../../lib/supabase'
import {
  BRAND_BUCKET,
  BRAND_LOGO_MAX_BYTES,
  BRAND_LOGO_MIME_EXT,
  isValidAccent,
} from '../../lib/brand'
import type { TeacherSettingsRow } from '../../types/database'
import type { ThemeMode } from '../../hooks/useTheme'
import { PAYMENT_METHOD_LABELS } from '../invoices/api'
import { STATUS_LABELS } from '../attendance/api'
import { createStudent, upsertEnrollment } from '../students/api'
import { fetchGroups } from '../groups/api'

function db() {
  if (!supabase) throw new Error('Supabase غير مربوط — راجع إعدادات .env')
  return supabase
}

// ===========================================================================
// الخطوة 10 — التصدير والنسخ الاحتياطي والإعدادات (المواصفات §3.14/§3.15/
// §3.16 + §5.8). كل الأعمدة والجداول بأسماء المخطط 0001_init.sql حرفياً.
//
// عقود مشتركة مع خطوات سابقة لا تُكسر هنا:
// • teacher_settings.last_export_at يقرؤه تنبيه backup في وحدتي الرئيسية
//   والإشعارات (fetchAlerts): «لا تصدير أبداً أو مرّت ≥ 30 يوماً» — أي
//   تصدير CSV أو تنزيل نسخة JSON ناجح يحدّثه هنا (touchLastExportAt).
// • whatsapp_template يقرؤه مودال الإيصال (fetchWhatsappTemplate)،
//   وcenter_share_percent يقرؤه view ‏monthly_profit وشاشة الفلوس —
//   الحفظ هنا في teacher_settings فتصل إليهما القيم الجديدة مباشرة.
// • الثيم: خطاف useTheme القائم (localStorage ‏teacher-app-theme +
//   documentElement.dataset.theme) هو آلية التطبيق الفعلية، وعمود
//   teacher_settings.theme هو النسخة المحفوظة حسابياً — شاشة الإعدادات
//   تزامن الاثنين (تقرأ من القاعدة عند الفتح وتكتب في الاثنين عند الحفظ).
// ===========================================================================

const SETTINGS_COLS =
  'teacher_id, whatsapp_template, center_share_percent, reminder_minutes, theme, brand_name, brand_logo_path, brand_accent, last_export_at, created_at, updated_at'

export const THEME_MODES: { code: ThemeMode; label: string }[] = [
  { code: 'auto', label: 'تلقائي' },
  { code: 'light', label: 'فاتح' },
  { code: 'dark', label: 'داكن' },
]

export const REMINDER_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 0, label: 'بدون تذكير' },
  { minutes: 15, label: '15 دقيقة' },
  { minutes: 30, label: '30 دقيقة' },
  { minutes: 60, label: 'ساعة' },
]

const REMINDER_VALUES = [0, 15, 30, 60]

function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'auto' || v === 'light' || v === 'dark'
}

// ---------------------------------------------------------------------------
// إعدادات المدرس — teacher_settings (صف واحد لكل مدرس، RLS للمالك فقط)
// ---------------------------------------------------------------------------

export interface TeacherSettingsInput {
  whatsapp_template: string
  center_share_percent: number
  reminder_minutes: number
  theme: ThemeMode
  /** الهوية البيضاء (0008) — كلها اختيارية: null = هوية التطبيق الافتراضية */
  brand_name: string | null
  brand_logo_path: string | null
  brand_accent: string | null
}

/** حفظ الإعدادات القابلة للتحرير — upsert آمن التكرار على مفتاح teacher_id */
export async function updateTeacherSettings(
  teacherId: string,
  input: TeacherSettingsInput,
): Promise<TeacherSettingsRow> {
  const tpl = input.whatsapp_template.trim()
  if (!tpl) throw new Error('قالب رسالة الواتساب لا يمكن أن يكون فارغاً')
  if (
    !Number.isFinite(input.center_share_percent) ||
    input.center_share_percent < 0 ||
    input.center_share_percent > 100
  ) {
    throw new Error('نسبة السنتر لازم تكون بين 0 و 100')
  }
  if (!REMINDER_VALUES.includes(input.reminder_minutes)) {
    throw new Error('قيمة التذكير غير صالحة — اختر 0 أو 15 أو 30 أو 60 دقيقة')
  }
  if (!isThemeMode(input.theme)) throw new Error('قيمة المظهر غير صالحة')

  // الهوية البيضاء: الاسم يُقصّ (فارغ = null = افتراضي) وبحد أقصى 80 حرفاً
  // (نفس قيد المخطط)، واللهجة #RRGGBB فقط أو null — التحقق هنا حتى لا
  // تصل قيمة مكسورة لأي سطح عرض (كارت/إيصال/بوابة).
  const brandName = input.brand_name?.trim() ? input.brand_name.trim() : null
  if (brandName && brandName.length > 80) {
    throw new Error('اسم السنتر طويل أوي — 80 حرف كحد أقصى')
  }
  const brandAccent =
    input.brand_accent == null ? null : input.brand_accent.trim().toLowerCase()
  if (brandAccent !== null && !isValidAccent(brandAccent)) {
    throw new Error('لون اللهجة غير صالح — لازم يكون بصيغة #RRGGBB')
  }
  const brandLogoPath = input.brand_logo_path?.trim()
    ? input.brand_logo_path.trim()
    : null
  // مسار الشعار لا يُقبل إلا داخل مجلد المدرس نفسه (نفس قيد سياسات Storage)
  if (brandLogoPath && !brandLogoPath.startsWith(`${teacherId}/`)) {
    throw new Error('مسار الشعار غير صالح')
  }

  const { data, error } = await db()
    .from('teacher_settings')
    .upsert(
      {
        teacher_id: teacherId,
        whatsapp_template: tpl,
        center_share_percent: input.center_share_percent,
        reminder_minutes: input.reminder_minutes,
        theme: input.theme,
        brand_name: brandName,
        brand_logo_path: brandLogoPath,
        brand_accent: brandAccent,
      },
      { onConflict: 'teacher_id' },
    )
    .select(SETTINGS_COLS)
    .single()
  if (error) throw error
  const row = data as unknown as TeacherSettingsRow
  return { ...row, center_share_percent: Number(row.center_share_percent) || 0 }
}

// ---------------------------------------------------------------------------
// شعار الهوية — bucket ‏brand-logos (migration ‏0008): المسار دائماً
// «<teacher_id>/logo.<ext>»، والرفع/الاستبدال/الحذف للمالك فقط بسياسات
// Storage (لا سياسة لمساعد ولا كتابة لـ anon). الرفع يحدّث
// brand_logo_path في نفس الخطوة؛ واستبدال بامتداد مختلف يحذف الملف
// القديم حتى لا تتراكم يتامى في مجلد المدرس.
// ---------------------------------------------------------------------------

/** رفع/استبدال شعار السنتر — يعيد مسار الشعار الجديد */
export async function uploadBrandLogo(teacherId: string, file: File): Promise<string> {
  const ext = BRAND_LOGO_MIME_EXT[file.type]
  if (!ext) throw new Error('اختار صورة شعار بصيغة JPG أو PNG أو WebP.')
  if (file.size > BRAND_LOGO_MAX_BYTES) {
    throw new Error('الشعار كبير أوي (أكتر من 2 ميجا) — اختار صورة أصغر.')
  }
  const supa = db()
  const { data: current } = await supa
    .from('teacher_settings')
    .select('brand_logo_path')
    .eq('teacher_id', teacherId)
    .maybeSingle()
  const oldPath =
    (current as unknown as { brand_logo_path?: string | null } | null)?.brand_logo_path ?? null

  const path = `${teacherId}/logo.${ext}`
  const { error: upErr } = await supa.storage
    .from(BRAND_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true })
  if (upErr) throw new Error('ماقدرناش نرفع الشعار — اتأكد من النت وحاول تاني.')

  const { error } = await supa
    .from('teacher_settings')
    .upsert(
      { teacher_id: teacherId, brand_logo_path: path },
      { onConflict: 'teacher_id' },
    )
  if (error) throw error

  if (oldPath && oldPath !== path) {
    // تنظيف الملف القديم best-effort — فشله لا يلغي نجاح الاستبدال
    await supa.storage.from(BRAND_BUCKET).remove([oldPath]).then(
      () => {},
      () => {},
    )
  }
  return path
}

/** حذف شعار السنتر نهائياً (الملف + المسار) — السقوط للشعار الافتراضي */
export async function removeBrandLogo(teacherId: string): Promise<void> {
  const supa = db()
  const { data: current } = await supa
    .from('teacher_settings')
    .select('brand_logo_path')
    .eq('teacher_id', teacherId)
    .maybeSingle()
  const path =
    (current as unknown as { brand_logo_path?: string | null } | null)?.brand_logo_path ?? null
  const { error } = await supa
    .from('teacher_settings')
    .upsert(
      { teacher_id: teacherId, brand_logo_path: null },
      { onConflict: 'teacher_id' },
    )
  if (error) throw error
  if (path) {
    await supa.storage.from(BRAND_BUCKET).remove([path]).then(
      () => {},
      () => {},
    )
  }
}

/**
 * تحديث last_export_at لدلوقتي — عقد تنبيه النسخ الاحتياطي (§5.7):
 * يُستدعى بعد نجاح أي تصدير CSV أو تنزيل نسخة JSON فقط، لا عند الفشل.
 * upsert حتى يعمل إن لم يوجد صف إعدادات بعد (بقية الأعمدة لها defaults).
 */
export async function touchLastExportAt(teacherId: string): Promise<void> {
  const { error } = await db()
    .from('teacher_settings')
    .upsert(
      { teacher_id: teacherId, last_export_at: new Date().toISOString() },
      { onConflict: 'teacher_id' },
    )
  if (error) throw error
}

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

function todayFileStamp(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// ---------------------------------------------------------------------------
// قراءة مُصفّحة — PostgREST يحدّ النتيجة بـ 1000 صف افتراضياً، والتصدير
// والنسخة لازم يكونا كاملين مهما كبرت البيانات.
// ---------------------------------------------------------------------------

interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
}

async function fetchPaged<T>(
  run: (from: number, to: number) => Promise<PageResult<T>>,
): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await run(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
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

export function csvEsc(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEsc).join(',')).join('\r\n')
}

export type CsvKind = 'students' | 'invoices' | 'payments' | 'attendance' | 'scores' | 'expenses'

export const CSV_KINDS: { kind: CsvKind; label: string; hint: string }[] = [
  { kind: 'students', label: 'الطلاب', hint: 'كل الطلاب وبيانات التواصل والمجموعات' },
  { kind: 'invoices', label: 'الفواتير', hint: 'الشهر، الطالب، المجموعة، الإجمالي والمدفوع والمتبقي' },
  { kind: 'payments', label: 'الدفعات', hint: 'التاريخ، رقم الإيصال، الطالب، المبلغ والطريقة' },
  { kind: 'attendance', label: 'الحضور', hint: 'كل حالات الحضور المسجلة بأسمائها العربية' },
  { kind: 'scores', label: 'الدرجات', hint: 'الامتحان، الطالب، الدرجة والنهائية والنسبة' },
  { kind: 'expenses', label: 'المصروفات', hint: 'التاريخ، النوع، المبلغ والملاحظة' },
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
      .range(from, to) as unknown as Promise<PageResult<Record<string, unknown>>>,
  )
  const groups = await fetchGroups(teacherId)
  const groupName = new Map(groups.map((g) => [g.id, g.name]))
  const enrollments = await fetchPaged<{ student_id: string; group_id: string }>((from, to) =>
    supa
      .from('enrollments')
      .select('student_id, group_id')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: true })
      .range(from, to) as unknown as Promise<PageResult<{ student_id: string; group_id: string }>>,
  )
  const groupsByStudent = new Map<string, string[]>()
  for (const e of enrollments) {
    const list = groupsByStudent.get(e.student_id) ?? []
    const name = groupName.get(e.group_id)
    if (name) list.push(name)
    groupsByStudent.set(e.student_id, list)
  }
  return {
    headers: ['الكود', 'الاسم', 'الصف', 'المدرسة', 'موبايل الطالب', 'ولي الأمر', 'موبايل ولي الأمر', 'المجموعات', 'الحالة', 'ملاحظة المستوى'],
    rows: students.map((s) => [
      s.public_code,
      s.name,
      s.grade,
      s.school,
      s.phone,
      s.guardian_name,
      s.guardian_phone,
      (groupsByStudent.get(s.id as string) ?? []).join('، '),
      s.paused ? 'موقوف' : 'نشط',
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
      .range(from, to) as unknown as Promise<PageResult<Record<string, unknown>>>,
  )
  const balances = await fetchPaged<Record<string, unknown>>((from, to) =>
    supa
      .from('invoice_balances')
      .select('invoice_id, total, paid, balance')
      .eq('teacher_id', teacherId)
      .range(from, to) as unknown as Promise<PageResult<Record<string, unknown>>>,
  )
  const balById = new Map(balances.map((b) => [b.invoice_id as string, b]))
  return {
    // أعمدة المرجع §5.8 حرفياً: الشهر، الكود، الطالب، المجموعة، الإجمالي، المدفوع، المتبقي
    headers: ['الشهر', 'الكود', 'الطالب', 'المجموعة', 'الإجمالي', 'المدفوع', 'المتبقي'],
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
      .range(from, to) as unknown as Promise<PageResult<Record<string, unknown>>>,
  )
  return {
    // أعمدة المرجع §5.8 حرفياً: التاريخ، رقم الإيصال، الطالب، الشهر، المبلغ، الطريقة
    headers: ['التاريخ', 'رقم الإيصال', 'الطالب', 'الشهر', 'المبلغ', 'الطريقة'],
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
      .range(from, to) as unknown as Promise<PageResult<Record<string, unknown>>>,
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
    headers: ['التاريخ', 'المجموعة', 'الطالب', 'الحالة'],
    rows: flat.map((f) => [f.date, f.group, f.student, f.label]),
  }
}

async function buildScoresCsv(teacherId: string): Promise<{ headers: string[]; rows: unknown[][] }> {
  const rows = await fetchPaged<Record<string, unknown>>((from, to) =>
    db()
      .from('scores')
      .select('score, assessments!inner(title, assess_date, max_score, groups(name)), students(name)')
      .eq('teacher_id', teacherId)
      .range(from, to) as unknown as Promise<PageResult<Record<string, unknown>>>,
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
    headers: ['التاريخ', 'الامتحان', 'المجموعة', 'الطالب', 'الدرجة', 'النهائية', 'النسبة%'],
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
      .range(from, to) as unknown as Promise<PageResult<Record<string, unknown>>>,
  )
  return {
    // أعمدة المرجع §5.8 حرفياً: التاريخ، النوع، المبلغ، ملاحظة
    headers: ['التاريخ', 'النوع', 'المبلغ', 'ملاحظة'],
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

// ===========================================================================
// استيراد طلاب سريع (نص) — المرجع §3.14 + §5.8: كل سطر
// «الاسم, الموبايل, اسم المجموعة»؛ المجموعة تُطابَق باحتواء الاسم
// (includes في أي اتجاه) وإلا تُستخدم أول مجموعة؛ الطالب الجديد ولي
// أمره الافتراضي «ولي أمر {أول اسم}» وبقية الحقول فارغة، وكوده يولّده
// trigger المخطط (لا أكواد تسلسلية كما حذّر المرجع §7).
// ===========================================================================

export interface QuickImportResult {
  created: number
  enrolled: number
  skippedLines: number
  errors: string[]
}

export async function quickImportStudents(
  teacherId: string,
  text: string,
): Promise<QuickImportResult> {
  const result: QuickImportResult = { created: 0, enrolled: 0, skippedLines: 0, errors: [] }
  const groups = await fetchGroups(teacherId)
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(',').map((p) => p.trim())
    const name = parts[0] ?? ''
    if (!name) {
      result.skippedLines += 1
      continue
    }
    const phone = parts[1] ? parts[1] : null
    const groupText = parts[2] ?? ''
    try {
      const student = await createStudent(teacherId, {
        name,
        grade: null,
        school: null,
        phone,
        guardian_name: `ولي أمر ${name.split(/\s+/)[0]}`,
        guardian_phone: null,
        level_note: null,
        paused: false,
      })
      result.created += 1
      const match =
        (groupText
          ? groups.find((g) => g.name.includes(groupText) || groupText.includes(g.name))
          : undefined) ?? groups[0]
      if (match) {
        await upsertEnrollment(teacherId, {
          student_id: student.id,
          group_id: match.id,
          price_override: null,
          prepaid_sessions: null,
        })
        result.enrolled += 1
      }
    } catch (err) {
      result.errors.push(
        `«${name}»: ${err instanceof Error ? err.message : 'تعذّرت الإضافة'}`,
      )
    }
  }
  return result
}

// ===========================================================================
// النسخة الاحتياطية JSON — نطاقها: كل جداول بيانات المدرس التشغيلية في
// المخطط (22 جدولاً أدناه بترتيب اعتماد الاستيراد) + صف إعداداته.
// (أُضيف activity_log في Phase 3 خطوة 2 كقسم اختياري أخير — نفس قاعدة
// توافق الإصدار 1: ملف قديم بلا القسم يُستورد بنجاح، والتطبيق القديم
// يتجاهل القسم الجديد.)
// الجدولان الأخيران أُضيفا في Phase 2 (الخطوة 14) بعد اكتشاف الخطوة 13
// أن نطاق النسخة لم يشملهما:
// • daily_closings (migration ‏0004 — إغلاقات الخزنة اليومية): بيانات
//   صرفة، تُصدَّر وتُستورد كاملة بنفس نمط باقي الجداول.
// • payment_proofs (migration ‏0005 — إثباتات الدفع): تُصدَّر صفوف
//   البيانات فقط. صور الإثباتات نفسها تعيش في Supabase Storage
//   (bucket ‏payment-proofs) وليست جزءاً من ملف JSON هذا إطلاقاً —
//   الصفوف المستعادة تحمل storage_path يشير لملف قد لا يوجد بعد
//   الاستيراد على حساب/بيئة جديدة، فتبقى بيانات الإثبات (المبلغ،
//   الطريقة، الحالة، المراجعة) سليمة لكن عرض صورتها قد يتعذّر هناك.
// مُستثنى بوعي وموثّق:
// • teachers (هوية الحساب نفسها — الملف الشخصي يُدار من الإعدادات،
//   والاستيراد يفرض حساب المستورِد الحالي ولا يكتب فوق حساب آخر أبداً)
// • teacher_members (عضويات مرتبطة بحسابات Auth لأشخاص آخرين)
// • guardian_access_tokens (رموز وصول أمنية — القاعدة تخزن هاشاتها فقط
//   أصلاً، والروابط تُعاد توليدها من شاشة بوابة ولي الأمر عند الحاجة)
// • الـ views الأربع (invoice_balances / student_balances /
//   student_attendance_stats / monthly_profit) محسوبة دائماً لا تُخزَّن.
// الشكل مُصدَّر (version) حتى يرفض التطبيق أي ملف أحدث منه بوضوح.
// إصدار الصيغة بقى 1 رغم التوسيع: الجدولان الجديدان قسمان اختياريان
// بنفس قاعدة الأقسام القائمة (قسم ناقص = فارغ في parseBackupJson)،
// فملف قديم (19 جدولاً) يُستورد بنجاح بعد التوسيع، والتطبيق القديم
// يتجاهل القسمين الجديدين في ملف جديد — توافق في الاتجاهين بلا كسر.
// ===========================================================================

export const BACKUP_FORMAT = 'teacher-app-backup'
export const BACKUP_VERSION = 1

export interface BackupTableSpec {
  key: string
  table: string
  label: string
  /** أعمدة الجدول في المخطط حرفياً — قائمة بيضاء للتصدير والاستيراد معاً */
  columns: string[]
  /** حقول الهوية داخل نطاق المدرس (لكشف الموجود وتخطّيه عند الاستيراد) */
  pk: string[]
}

/** الترتيب = ترتيب الاستيراد الآمن حسب اعتماد المفاتيح الخارجية */
export const BACKUP_TABLES: BackupTableSpec[] = [
  { key: 'groups', table: 'groups', label: 'المجموعات', pk: ['id'], columns: ['id', 'teacher_id', 'name', 'billing_type', 'price', 'days', 'start_time', 'duration_minutes', 'room', 'capacity', 'assistant_name', 'links', 'archived_at', 'created_at', 'updated_at'] },
  { key: 'students', table: 'students', label: 'الطلاب', pk: ['id'], columns: ['id', 'teacher_id', 'public_code', 'name', 'grade', 'school', 'paused', 'phone', 'guardian_name', 'guardian_phone', 'level_note', 'created_at', 'updated_at'] },
  { key: 'guardians', table: 'guardians', label: 'أولياء الأمور', pk: ['id'], columns: ['id', 'teacher_id', 'user_id', 'display_name', 'phone', 'created_at', 'updated_at'] },
  { key: 'group_waitlist', table: 'group_waitlist', label: 'قوائم الانتظار', pk: ['id'], columns: ['id', 'teacher_id', 'group_id', 'name', 'phone', 'note', 'created_at'] },
  { key: 'student_notes', table: 'student_notes', label: 'ملاحظات الطلاب', pk: ['id'], columns: ['id', 'teacher_id', 'student_id', 'note_date', 'text', 'created_at'] },
  { key: 'enrollments', table: 'enrollments', label: 'تسجيلات الطلاب', pk: ['id'], columns: ['id', 'teacher_id', 'student_id', 'group_id', 'price_override', 'prepaid_sessions', 'created_at'] },
  { key: 'holidays', table: 'holidays', label: 'الإجازات', pk: ['id'], columns: ['id', 'teacher_id', 'holiday_date', 'name', 'created_at'] },
  { key: 'recurring_expenses', table: 'recurring_expenses', label: 'المصروفات الثابتة', pk: ['id'], columns: ['id', 'teacher_id', 'category', 'amount', 'note', 'created_at', 'updated_at'] },
  { key: 'expenses', table: 'expenses', label: 'المصروفات', pk: ['id'], columns: ['id', 'teacher_id', 'expense_date', 'category', 'amount', 'note', 'created_at'] },
  { key: 'sessions', table: 'sessions', label: 'الحصص', pk: ['id'], columns: ['id', 'teacher_id', 'group_id', 'session_date', 'start_time', 'duration_minutes', 'kind', 'status', 'origin_session_id', 'note', 'created_at', 'updated_at'] },
  { key: 'invoices', table: 'invoices', label: 'الفواتير', pk: ['id'], columns: ['id', 'teacher_id', 'student_id', 'group_id', 'period_month', 'created_at'] },
  { key: 'assessments', table: 'assessments', label: 'الامتحانات والواجبات', pk: ['id'], columns: ['id', 'teacher_id', 'group_id', 'title', 'type', 'assess_date', 'max_score', 'pass_score', 'created_at', 'updated_at'] },
  { key: 'invoice_lines', table: 'invoice_lines', label: 'بنود الفواتير', pk: ['id'], columns: ['id', 'teacher_id', 'invoice_id', 'line_type', 'description', 'amount', 'reason', 'created_at'] },
  { key: 'payments', table: 'payments', label: 'الدفعات', pk: ['id'], columns: ['id', 'teacher_id', 'invoice_id', 'amount', 'method', 'paid_on', 'receipt_no', 'reverses_payment_id', 'voided', 'created_at'] },
  { key: 'attendance', table: 'attendance', label: 'الحضور', pk: ['session_id', 'student_id'], columns: ['teacher_id', 'session_id', 'student_id', 'status', 'homework_done', 'starred', 'created_at', 'updated_at'] },
  { key: 'assessment_questions', table: 'assessment_questions', label: 'أسئلة الامتحانات', pk: ['id'], columns: ['id', 'teacher_id', 'assessment_id', 'position', 'type', 'text', 'options', 'correct_answer', 'points', 'created_at'] },
  { key: 'scores', table: 'scores', label: 'الدرجات', pk: ['assessment_id', 'student_id'], columns: ['teacher_id', 'assessment_id', 'student_id', 'score', 'created_at', 'updated_at'] },
  { key: 'guardian_students', table: 'guardian_students', label: 'ربط أولياء الأمور بالطلاب', pk: ['guardian_id', 'student_id'], columns: ['teacher_id', 'guardian_id', 'student_id', 'relationship', 'created_at'] },
  { key: 'receipt_counters', table: 'receipt_counters', label: 'عدّادات الإيصالات', pk: ['counter_year'], columns: ['teacher_id', 'counter_year', 'last_number'] },
  // Phase 2 (الخطوة 14): الجدولان في آخر الترتيب عمداً — daily_closings
  // بلا أي مفتاح خارجي داخل نطاق النسخة (closed_by يُعاد ربطه بالمستورِد
  // في toInsertRow)، وpayment_proofs يعتمد على guardians/students/
  // invoices/payments وكلها قبله في الترتيب، فالآخر هو الموضع الآمن.
  { key: 'daily_closings', table: 'daily_closings', label: 'إغلاقات الخزنة اليومية', pk: ['id'], columns: ['id', 'teacher_id', 'closing_date', 'expected_cash', 'expected_electronic', 'expenses_total', 'counted_cash', 'counted_electronic', 'note', 'closed_by', 'created_at', 'updated_at'] },
  // صفوف بيانات فقط — الصور في Storage وليست في ملف JSON (انظر الترويسة)
  { key: 'payment_proofs', table: 'payment_proofs', label: 'إثباتات الدفع (صفوف فقط)', pk: ['id'], columns: ['id', 'teacher_id', 'guardian_id', 'student_id', 'invoice_id', 'amount', 'method', 'storage_path', 'status', 'rejection_reason', 'reviewed_by', 'reviewed_at', 'payment_id', 'uploaded_at', 'created_at', 'updated_at'] },
  // Phase 3 (الخطوة 2): سجل النشاط (migration ‏0009) آخر الترتيب — يعتمد
  // على teachers فقط داخل نطاق النسخة، وactor_id (auth.users) يُعاد ربطه
  // بالمستورِد في toInsertRow كي لا يفشل قيده في بيئة جديدة، وتبقى لقطتا
  // actor_role/actor_name شاهدتين على الفاعل الأصلي كما هما.
  { key: 'activity_log', table: 'activity_log', label: 'سجل النشاط', pk: ['id'], columns: ['id', 'teacher_id', 'actor_id', 'actor_role', 'actor_name', 'event_type', 'entity_type', 'entity_id', 'entity_label', 'details', 'created_at'] },
]

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exported_at: string
  /** معرّف حساب المصدر — معلوماتي فقط؛ الاستيراد يتجاهله ويفرض الحالي */
  teacher_id: string
  data: {
    teacher_settings: Record<string, unknown> | null
    [table: string]: unknown
  }
}

/** تجميع النسخة الكاملة لنطاق المدرس الحالي من قاعدة البيانات */
export async function fetchBackup(teacherId: string): Promise<BackupFile> {
  const supa = db()
  const data: BackupFile['data'] = { teacher_settings: null }

  const { data: settings, error: sErr } = await supa
    .from('teacher_settings')
    .select(SETTINGS_COLS)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (sErr) throw sErr
  data.teacher_settings = (settings as unknown as Record<string, unknown> | null) ?? null

  for (const spec of BACKUP_TABLES) {
    const cols = spec.columns.join(', ')
    const orderCol = spec.columns.includes('created_at') ? 'created_at' : spec.pk[0]
    data[spec.key] = await fetchPaged<Record<string, unknown>>((from, to) =>
      supa
        .from(spec.table)
        .select(cols)
        .eq('teacher_id', teacherId)
        .order(orderCol, { ascending: true })
        .range(from, to) as unknown as Promise<PageResult<Record<string, unknown>>>,
    )
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    teacher_id: teacherId,
    data,
  }
}

export interface BackupDownload {
  filename: string
  content: string
  /** إجمالي صفوف الجداول (بلا صف الإعدادات) */
  rowCount: number
  tableCount: number
}

export async function buildBackupDownload(teacherId: string): Promise<BackupDownload> {
  const backup = await fetchBackup(teacherId)
  let rowCount = 0
  for (const spec of BACKUP_TABLES) {
    const rows = backup.data[spec.key]
    if (Array.isArray(rows)) rowCount += rows.length
  }
  return {
    filename: `teacher-backup-${todayFileStamp()}.json`,
    content: JSON.stringify(backup, null, 2),
    rowCount,
    tableCount: BACKUP_TABLES.length,
  }
}

// ---------------------------------------------------------------------------
// التحقق من بنية النسخة قبل أي كتابة (قراءة جافة — لا لمس لقاعدة البيانات)
// ---------------------------------------------------------------------------

export interface BackupValidation {
  ok: boolean
  errors: string[]
  backup?: BackupFile
  /** عدد صفوف كل جدول معروف في الملف — لعرض ملخص ما قبل الاستيراد */
  counts?: Record<string, number>
  hasSettings?: boolean
}

export function parseBackupJson(text: string): BackupValidation {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['الملف مش JSON صالح — اتأكد إنك اخترت ملف نسخة سليم.'] }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: ['بنية الملف غير صحيحة — لازم يكون كائن JSON.'] }
  }
  const root = obj as Record<string, unknown>

  // نسخ التطبيق المرجعي القديم ({state, extras} في localStorage) شكلها
  // مختلف جذرياً عن المخطط العلائقي — تُرفض برسالة واضحة بدل تخمين تحويل.
  if ('state' in root || 'extras' in root) {
    return {
      ok: false,
      errors: [
        'دي نسخة بصيغة التطبيق القديم (state/extras) — شكلها مختلف عن قاعدة البيانات الحالية ولا يمكن استيرادها هنا. صدّر نسخة جديدة من هذا التطبيق.',
      ],
    }
  }
  if (root.format !== BACKUP_FORMAT) {
    return { ok: false, errors: ['الملف ده مش نسخة احتياطية من تطبيق المدرس (format غير معروف).'] }
  }
  const version = root.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, errors: ['إصدار النسخة مفقود أو غير صالح.'] }
  }
  if (version > BACKUP_VERSION) {
    return {
      ok: false,
      errors: [
        `إصدار النسخة (${version}) أحدث من اللي التطبيق ده يفهمه (${BACKUP_VERSION}) — حدّث التطبيق الأول.`,
      ],
    }
  }
  const data = root.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['قسم data مفقود أو غير صالح في النسخة.'] }
  }
  const dataObj = data as Record<string, unknown>
  const errors: string[] = []
  const counts: Record<string, number> = {}
  for (const spec of BACKUP_TABLES) {
    const v = dataObj[spec.key]
    if (v == null) {
      counts[spec.key] = 0
      continue
    }
    if (!Array.isArray(v)) {
      errors.push(`قسم «${spec.label}» لازم يكون قائمة صفوف.`)
      continue
    }
    if (v.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) {
      errors.push(`قسم «${spec.label}» فيه صفوف غير صالحة.`)
      continue
    }
    counts[spec.key] = v.length
  }
  const rawSettings = dataObj.teacher_settings
  let hasSettings = false
  if (rawSettings != null) {
    if (typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
      errors.push('قسم «إعدادات المدرس» غير صالح.')
    } else {
      hasSettings = true
    }
  }
  if (errors.length > 0) return { ok: false, errors }

  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0)
  if (totalRows === 0 && !hasSettings) {
    return { ok: false, errors: ['النسخة فاضية — مفيش أي بيانات لاستيرادها.'] }
  }
  return { ok: true, errors: [], backup: root as unknown as BackupFile, counts, hasSettings }
}

// ---------------------------------------------------------------------------
// الاستيراد الآمن — سلوك التعارض الموثّق (المواصفات تصف استعادة النسخة
// القديمة كاستبدال كامل بعد تأكيد؛ في النسخة السحابية متعددة الحسابات
// الاستبدال الكامل خطر على بيانات حية، فالمنفّذ هنا هو الأسلوب الأأمن
// كما وجّه التكليف عند صمت المواصفات):
// • الدمج بالإضافة فقط: لا حذف ولا تحديث لأي صف قائم أبداً.
// • كل صف يُفرض عليه teacher_id = حساب المدرس الحالي — لا كتابة فوق
//   حساب آخر مهما كان محتوى الملف، ومعرّف مصدر النسخة يُتجاهل.
// • الصف الموجود بنفس الهوية (المفتاح الأساسي داخل نطاق المدرس)
//   يُتخطى ويُحصى في التقرير — فاستيراد نفس النسخة مرتين آمن تماماً.
// • الصف الذي يفشل (تعارض فريد آخر أو مرجع مفقود) يُتخطى وحده ولا
//   يُوقف بقية الاستيراد، ويظهر في التقرير بعدّاده ورسالة عيّنة.
// • guardians.user_id يُصفَّر دائماً: ربط حساب ولي الأمر لا ينتقل بين
//   الحسابات (يبقى الربط بالطالب عبر guardian_students والهاتف).
// • مرجعا auth.users في جدولي Phase 2 (daily_closings.closed_by و
//   payment_proofs.reviewed_by) يُعاد ربطهما بحساب المستورِد الحالي:
//   حساب المُغلِق/المُراجِع الأصلي قد لا يوجد في بيئة الاستيراد فيفشل
//   قيد المفتاح الخارجي، وفي هذا التطبيق المالك هو من يغلق ويراجع
//   دائماً (سياسات RLS للمالك فقط) فإعادة الربط أمينة دلالياً.
// • payment_proofs تُستعاد صفوفها كما هي (بما فيها storage_path) لكن
//   ملفات الصور ليست في النسخة أصلاً — انظر قيد الترويسة أعلاه.
// • إعدادات المدرس هي الاستثناء الوحيد للتحديث: تُدمج في صف إعدادات
//   الحساب الحالي (قالب واتساب/نسبة سنتر/تذكير/ثيم بعد التحقق منها)،
//   وlast_export_at لا يُمسّ من الملف أبداً.
// • الهوية البيضاء (Phase 3 خطوة 1، migration ‏0008): لا جدول جديد —
//   أعمدة brand_* على teacher_settings نفسه، فتُصدَّر تلقائياً ضمن صف
//   الإعدادات عبر SETTINGS_COLS وتُدمج عند الاستيراد (الاسم واللهجة)،
//   ومسار الشعار لا ينتقل بين الحسابات (الملف في Storage حساب المصدر).
// • المرجعان الذاتيان (sessions.origin_session_id و
//   payments.reverses_payment_id) يُصلَحان في مرور ثانٍ بعد إدراج الكل.
// ---------------------------------------------------------------------------

export interface TableImportResult {
  key: string
  label: string
  imported: number
  skipped: number
  failed: number
}

export interface ImportReport {
  tables: TableImportResult[]
  totalImported: number
  totalSkipped: number
  totalFailed: number
  settingsUpdated: boolean
  /** عيّنات رسائل أخطاء الصفوف الفاشلة (بحد أقصى 5) */
  errorSamples: string[]
}

function pkKeyOf(spec: BackupTableSpec, row: Record<string, unknown>): string {
  return spec.pk.map((f) => String(row[f] ?? '')).join('|')
}

/** تحويل صف من الملف لصف إدراج: أعمدة القائمة البيضاء فقط + فرض الحساب الحالي */
function toInsertRow(
  spec: BackupTableSpec,
  row: Record<string, unknown>,
  teacherId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of spec.columns) {
    if (col in row) out[col] = row[col]
  }
  out.teacher_id = teacherId
  if (spec.table === 'guardians') out.user_id = null
  // مرجعا auth.users (انظر توثيق الاستيراد أعلاه): يُعاد ربطهما بالمستورِد
  if (spec.table === 'daily_closings') out.closed_by = teacherId
  if (spec.table === 'payment_proofs' && out.reviewed_by != null) {
    out.reviewed_by = teacherId
  }
  // سجل النشاط (0009): actor_id مرجع auth.users، وسياسة إدراجه تشترط
  // actor_id = auth.uid() — فكل صفوف السجل المستوردة تُعاد نسبتها شكلياً
  // للمستورِد (actor_id = حسابه وactor_role = 'owner') حتى يمر الإدراج
  // ولا يفشل القيد في بيئة جديدة، بما فيها صفوف كان فاعلها مساعداً أو
  // حُذف حسابه (actor_id خالٍ أصلاً)؛ اللقطة النصية actor_name تبقى كما
  // هي شاهدة على الفاعل الأصلي، فلا تضيع معلومة «مين عملها فعلاً».
  if (spec.table === 'activity_log') {
    out.actor_id = teacherId
    out.actor_role = 'owner'
  }
  return out
}

export async function importBackup(
  teacherId: string,
  backup: BackupFile,
): Promise<ImportReport> {
  const supa = db()
  const report: ImportReport = {
    tables: [],
    totalImported: 0,
    totalSkipped: 0,
    totalFailed: 0,
    settingsUpdated: false,
    errorSamples: [],
  }
  const noteError = (label: string, err: unknown) => {
    if (report.errorSamples.length >= 5) return
    const msg = err instanceof Error ? err.message : 'خطأ غير معروف'
    report.errorSamples.push(`${label}: ${msg}`)
  }

  // إعدادات المدرس أولاً (دمج محقّق في صف الحساب الحالي)
  const rawSettings = backup.data.teacher_settings
  if (rawSettings && typeof rawSettings === 'object') {
    try {
      const s = rawSettings as Record<string, unknown>
      const { data: current } = await supa
        .from('teacher_settings')
        .select(SETTINGS_COLS)
        .eq('teacher_id', teacherId)
        .maybeSingle()
      const cur = (current as unknown as TeacherSettingsRow | null) ?? null
      const centerRaw = Number(s.center_share_percent)
      const reminderRaw = Number(s.reminder_minutes)
      await updateTeacherSettings(teacherId, {
        whatsapp_template:
          typeof s.whatsapp_template === 'string' && s.whatsapp_template.trim()
            ? s.whatsapp_template
            : (cur?.whatsapp_template ?? ''),
        center_share_percent:
          Number.isFinite(centerRaw) && centerRaw >= 0 && centerRaw <= 100
            ? centerRaw
            : Number(cur?.center_share_percent) || 0,
        reminder_minutes: REMINDER_VALUES.includes(reminderRaw)
          ? reminderRaw
          : (cur?.reminder_minutes ?? 0),
        theme: isThemeMode(s.theme) ? s.theme : isThemeMode(cur?.theme) ? cur.theme : 'auto',
        // الهوية البيضاء (0008): الاسم واللهجة ينتقلان مع النسخة، أما
        // brand_logo_path فلا — ملف الشعار يعيش في مجلد حساب المصدر في
        // Storage وليس داخل ملف JSON (نفس قيد صور إثباتات الدفع)، فنبقي
        // مسار الحساب الحالي كما هو بدل مسار مدلّي لحساب آخر.
        brand_name:
          typeof s.brand_name === 'string' && s.brand_name.trim()
            ? s.brand_name
            : (cur?.brand_name ?? null),
        brand_logo_path: cur?.brand_logo_path ?? null,
        brand_accent: isValidAccent(s.brand_accent)
          ? s.brand_accent
          : (cur?.brand_accent ?? null),
      })
      report.settingsUpdated = true
    } catch (err) {
      noteError('إعدادات المدرس', err)
    }
  }

  // المرجعان الذاتيان المؤجلان للمرور الثاني
  const deferred: {
    table: string
    label: string
    match: Record<string, unknown>
    field: string
    value: string
  }[] = []

  for (const spec of BACKUP_TABLES) {
    const rows = backup.data[spec.key]
    const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
    const res: TableImportResult = {
      key: spec.key,
      label: spec.label,
      imported: 0,
      skipped: 0,
      failed: 0,
    }
    report.tables.push(res)
    if (list.length === 0) continue

    // هويات الصفوف الموجودة حالياً في نطاق هذا المدرس
    const existingRows = await fetchPaged<Record<string, unknown>>((from, to) =>
      supa
        .from(spec.table)
        .select(spec.pk.join(', '))
        .eq('teacher_id', teacherId)
        .range(from, to) as unknown as Promise<PageResult<Record<string, unknown>>>,
    )
    const existing = new Set(existingRows.map((r) => pkKeyOf(spec, r)))

    for (const row of list) {
      const key = pkKeyOf(spec, row)
      if (existing.has(key)) {
        res.skipped += 1
        continue
      }
      const payload = toInsertRow(spec, row, teacherId)
      // مرجع ذاتي قد يشير لصف لم يُدرج بعد داخل نفس النسخة: نُدخل بدونه
      // مؤقتاً ونصلحه في المرور الثاني بدل فشل قيد المفتاح الخارجي.
      if (spec.table === 'sessions') {
        const origin = payload.origin_session_id
        if (typeof origin === 'string' && origin) {
          deferred.push({
            table: 'sessions',
            label: spec.label,
            match: { id: payload.id },
            field: 'origin_session_id',
            value: origin,
          })
          payload.origin_session_id = null
        }
      }
      if (spec.table === 'payments') {
        const rev = payload.reverses_payment_id
        if (typeof rev === 'string' && rev) {
          deferred.push({
            table: 'payments',
            label: spec.label,
            match: { id: payload.id },
            field: 'reverses_payment_id',
            value: rev,
          })
          payload.reverses_payment_id = null
        }
      }
      const { error } = await supa.from(spec.table).insert(payload)
      if (error) {
        res.failed += 1
        noteError(spec.label, error)
        continue
      }
      existing.add(key)
      res.imported += 1
    }
    report.totalImported += res.imported
    report.totalSkipped += res.skipped
    report.totalFailed += res.failed
  }

  // المرور الثاني: إصلاح المراجع الذاتية المؤجلة إن وُجد طرفاها الآن
  for (const d of deferred) {
    const targetTable = d.table
    const { data: target } = await supa
      .from(targetTable)
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('id', d.value)
      .maybeSingle()
    if (!target) continue
    const matchCol = Object.keys(d.match)[0]
    const { data: current } = await supa
      .from(d.table)
      .select(d.field)
      .eq('teacher_id', teacherId)
      .eq(matchCol, d.match[matchCol] as string)
      .maybeSingle()
    const curVal = (current as unknown as Record<string, unknown> | null)?.[d.field]
    if (curVal != null) continue
    const { error } = await supa
      .from(d.table)
      .update({ [d.field]: d.value })
      .eq('teacher_id', teacherId)
      .eq(matchCol, d.match[matchCol] as string)
    if (error) noteError(d.label, error)
  }

  return report
}
