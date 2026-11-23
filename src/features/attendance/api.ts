import { t } from '../../i18n'
import { friendlyDbError } from '../../lib/supabaseErrors'
import { db } from '../../lib/supabase'
import { waLink } from '../../lib/format'
import type { AttendanceRow, AttendanceStatus, StudentRow, Tables } from '../../types/database'
import { fetchSessionsInRange, monthStartStr, type SessionWithGroup } from '../home/api'
import { logActivity, logAttendanceTouch } from '../activity/api'
import { isNetworkFailure } from './offlineQueue'

export { fetchSessionsInRange }
export type { SessionWithGroup }

// ---------------------------------------------------------------------------
// حالات الحضور الأربع — enum ‏attendance_status في المخطط حرفياً (p/a/l/m)،
// والأسماء والألوان من المرجع §2.4. الحضور الفعلي = p/l/m في كل الحسابات.
// ---------------------------------------------------------------------------

export const ATTENDANCE_STATUSES: { code: AttendanceStatus; label: string }[] = [
  { code: 'p', label: t('attendance.statusPresent') },
  { code: 'a', label: t('attendance.statusAbsent') },
  { code: 'l', label: t('attendance.statusLate') },
  { code: 'm', label: t('attendance.statusMakeup') },
]

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  p: t('attendance.statusPresent'),
  a: t('attendance.statusAbsent'),
  l: t('attendance.statusLate'),
  m: t('attendance.statusMakeup'),
}

/**
 * ألوان الحالة بنسختي التوكنز (بحث §5 — معالجة خطوة 3 بدل STATUS_COLORS
 * الخام التي فشل تباينها كنصوص ≈2.2–3.9:1): حشوة/نقطة عبر متغيرات CSS
 * (--ok/--bad/--warn/--primary) وشارات ناعمة (خلفية -soft + نص -text ≥4.5:1).
 * أزرار المبدّل النشطة تستخدم كلاسات att-active-* في index.css.
 */
export const STATUS_FILL: Record<AttendanceStatus, string> = {
  p: 'var(--ok)',
  a: 'var(--bad)',
  l: 'var(--warn)',
  m: 'var(--primary)',
}

/** كلاسات الشارة الناعمة لكل حالة (خلفية + نص مصحح التباين + حد) */
export const STATUS_BADGE_CLASS: Record<AttendanceStatus, string> = {
  p: 'bg-ok-soft text-ok-text border border-ok/30',
  a: 'bg-bad-soft text-bad-text border border-bad/30',
  l: 'bg-warn-soft text-warn-text border border-warn/40',
  m: 'bg-soft text-primary border border-primary/30',
}

/** كلاس زر المبدّل عند تفعيل الحالة (حشوة مصححة التباين — index.css) */
export const STATUS_ACTIVE_CLASS: Record<AttendanceStatus, string> = {
  p: 'att-active-p',
  a: 'att-active-a',
  l: 'att-active-l',
  m: 'att-active-m',
}

/** الحضور الفعلي (المرجع §2.4): حاضر/متأخر/تعويضية */
export function isAttended(status: AttendanceStatus | null | undefined): boolean {
  return status === 'p' || status === 'l' || status === 'm'
}

/** قيمة حضور طالب في حصة — صف واحد في attendance يجمع الحالة + الواجب + التمييز */
export interface AttendanceValue {
  status: AttendanceStatus | null
  homework_done: boolean
  starred: boolean
}

export const EMPTY_VALUE: AttendanceValue = { status: null, homework_done: false, starred: false }

function isEmptyValue(v: AttendanceValue): boolean {
  return v.status == null && !v.homework_done && !v.starred
}

// ---------------------------------------------------------------------------
// الحصص والقائمة (roster)
// ---------------------------------------------------------------------------

const SESSION_COLS =
  'id, teacher_id, group_id, session_date, start_time, duration_minutes, kind, status, origin_session_id, note, created_at, updated_at'
const ATT_COLS =
  'teacher_id, session_id, student_id, status, homework_done, starred, left_at, created_at, updated_at'

type SessionJoinRow = Tables<'sessions'> & {
  groups: { name: string; room: string | null } | null
}

function withGroup(row: SessionJoinRow): SessionWithGroup {
  return {
    ...row,
    group_name: row.groups?.name ?? '—',
    group_room: row.groups?.room ?? null,
  }
}

/** حصة واحدة بمعرّفها — لروابط «سجّل الحضور/تحضير» التي تمرّر ?session= */
export async function fetchSessionById(
  teacherId: string,
  sessionId: string,
): Promise<SessionWithGroup | null> {
  const { data, error } = await db()
    .from('sessions')
    .select(`${SESSION_COLS}, groups(name, room)`)
    .eq('teacher_id', teacherId)
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return withGroup(data)
}

export type RosterStudent = Pick<
  StudentRow,
  'id' | 'name' | 'public_code' | 'phone' | 'guardian_name' | 'guardian_phone'
>

/**
 * طلاب المجموعة المسجلون النشطون — قائمة الحضور (المرجع §3.2):
 * تسجيلات المجموعة حيث الطالب غير موقوف (studentsOf في المرجع يصفّي !paused).
 */
export async function fetchSessionRoster(
  teacherId: string,
  groupId: string,
): Promise<RosterStudent[]> {
  const { data, error } = await db()
    .from('enrollments')
    .select('student_id, students!inner(name, public_code, paused, phone, guardian_name, guardian_phone)')
    .eq('teacher_id', teacherId)
    .eq('group_id', groupId)
    .eq('students.paused', false)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => {
    const st = row.students
    return {
      id: row.student_id,
      name: st.name ?? '—',
      public_code: st.public_code ?? '',
      phone: st.phone ?? null,
      guardian_name: st.guardian_name ?? null,
      guardian_phone: st.guardian_phone ?? null,
    }
  })
}

// ---------------------------------------------------------------------------
// ولي الأمر ورسالة الغياب (المرجع §3.2 + §5.6)
// الرقم: صف guardians المرتبط بالطالب عبر guardian_students إن وُجد (الرقم
// المُتحقق منه في المخطط)، وإلا guardian_phone على الطالب، وإلا موبايل الطالب
// نفسه — وهو ترتيب المرجع §5.6 (guardianPhone إن وُجد وإلا phone).
// ---------------------------------------------------------------------------

export interface GuardianContact {
  name: string | null
  phone: string | null
}

export async function fetchGuardianContacts(
  teacherId: string,
  studentIds: string[],
): Promise<Map<string, GuardianContact>> {
  const map = new Map<string, GuardianContact>()
  if (studentIds.length === 0) return map
  const { data, error } = await db()
    .from('guardian_students')
    .select('student_id, guardians(display_name, phone)')
    .eq('teacher_id', teacherId)
    .in('student_id', studentIds)
  if (error) throw error
  for (const row of data ?? []) {
    const sid = row.student_id
    if (map.has(sid)) continue
    const g = row.guardians
    map.set(sid, { name: g?.display_name?.trim() ? g.display_name : null, phone: g?.phone ?? null })
  }
  return map
}

/** بيانات ولي الأمر الفعّالة لطالب: المرتبط (guardians) أولاً ثم حقول الطالب */
export function resolveGuardian(
  student: RosterStudent,
  contact: GuardianContact | undefined,
): { name: string; phone: string | null } {
  return {
    // غياب الاسم: «ولي أمر {اسم الطالب الأول}» (نفس اصطلاح الاستيراد) —
    // لا التسمية الحرفية «ولي الأمر» حتى لا تظهر «ولي الأمر: ولي الأمر»
    // في قوائم العرض (تدقيق أول استخدام — L2)
    name:
      contact?.name ??
      (student.guardian_name?.trim()
        ? student.guardian_name
        : t('attendance.guardianFallback', {
            firstName: student.name.trim().split(/\s+/)[0] ?? '',
          }).trim()),
    phone: contact?.phone ?? student.guardian_phone ?? student.phone,
  }
}

/**
 * رابط إبلاغ الغياب عبر واتساب (wa.me يدوي كما في المرجع §5.6):
 * «أهلاً {guardian}، نحيطكم علماً بتغيب الطالب {name} عن حصة {date}.»
 * و{date} هي تاريخ الحصة بصيغة المخطط YYYY-MM-DD كما في الكود المرجعي.
 */
export function absenceWaUrl(
  student: RosterStudent,
  contact: GuardianContact | undefined,
  sessionDate: string,
): string | null {
  const { name: guardianName, phone } = resolveGuardian(student, contact)
  const base = waLink(phone)
  if (!base) return null
  const msg = t('attendance.absenceWaMessage', {
    guardian: guardianName,
    name: student.name,
    date: sessionDate,
  })
  return `${base}?text=${encodeURIComponent(msg)}`
}

// ---------------------------------------------------------------------------
// قراءة وكتابة الحضور — upsert على المفتاح الأساسي (session_id, student_id).
// قيد المخطط: لا صف بلا أي قيمة (status null + لا واجب + لا تمييز)، فالقيمة
// الفارغة تماماً تُحذف صفّها بدل إدراجها.
// ---------------------------------------------------------------------------

export async function fetchSessionAttendance(
  teacherId: string,
  sessionId: string,
): Promise<AttendanceRow[]> {
  const { data, error } = await db()
    .from('attendance')
    .select(ATT_COLS)
    .eq('teacher_id', teacherId)
    .eq('session_id', sessionId)
  if (error) throw error
  return data ?? []
}

/**
 * رمي خطأ حفظٍ تستهلكه مزامنة الأوفلاين (saveAttendance/saveAttendanceBatch):
 * أخطاء النقل تمرّ كما هي بلا تحويل — مصنّف isNetworkFailure في
 * offlineQueue يعتمد على شكل الخطأ الأصلي من supabase-js (كائن عادي
 * بلا code ورسالته رسالة المتصفح)، وتجريده برسالة friendlyDbError
 * العامة يجعل المزامنة تعلّم عناصر فشلٍ شبكي «فاشلة نهائياً» فلا
 * تُعاد محاولتها أبداً (حاجب-1 في المراجعة اللاحقة للنشر — 3A-377).
 * أخطاء القاعدة وحدها تُترجم للرسالة الودّية. أي دالة حفظ تُستهلك
 * من المزامنة مستقبلاً يجب أن تمرّ أخطاؤها من هنا.
 */
function throwSaveError(error: unknown): never {
  if (isNetworkFailure(error)) throw error
  throw friendlyDbError(error, t('common.saveError'), t('common.saveBlockedByMissingLink'))
}

export async function saveAttendance(
  teacherId: string,
  sessionId: string,
  studentId: string,
  value: AttendanceValue,
): Promise<void> {
  if (isEmptyValue(value)) {
    const { error } = await db()
      .from('attendance')
      .delete()
      .eq('teacher_id', teacherId)
      .eq('session_id', sessionId)
      .eq('student_id', studentId)
    if (error) throwSaveError(error)
    // سجل النشاط: لمسة حضور فردية — تُجمَّع مع لمسات نفس الحصة (انظر
    // logAttendanceTouch) فلا يغرق السجل بصف لكل طالب.
    logAttendanceTouch(teacherId, sessionId, studentId)
    return
  }
  const { error } = await db()
    .from('attendance')
    .upsert(
      {
        teacher_id: teacherId,
        session_id: sessionId,
        student_id: studentId,
        status: value.status,
        homework_done: value.homework_done,
        starred: value.starred,
      },
      { onConflict: 'session_id,student_id' },
    )
  if (error) throwSaveError(error)
  logAttendanceTouch(teacherId, sessionId, studentId)
}

type AttendanceUpsertRow = {
  teacher_id: string
  session_id: string
  student_id: string
  status: AttendanceStatus | null
  homework_done: boolean
  starred: boolean
}

function buildUpsertRows(
  teacherId: string,
  sessionId: string,
  entries: { studentId: string; value: AttendanceValue }[],
): AttendanceUpsertRow[] {
  return entries
    .filter((e) => !isEmptyValue(e.value))
    .map((e) => ({
      teacher_id: teacherId,
      session_id: sessionId,
      student_id: e.studentId,
      status: e.value.status,
      homework_done: e.value.homework_done,
      starred: e.value.starred,
    }))
}

/** حدث نشاط تجميعي واحد لحفظ حصة (لا صف لكل طالب) — فاشل-safe */
function logBatchSaved(
  teacherId: string,
  sessionId: string,
  rows: AttendanceUpsertRow[],
  totalCount: number,
): void {
  void logActivity(teacherId, {
    event_type: 'attendance_saved',
    entity_type: 'session',
    entity_id: sessionId,
    details: {
      student_count: totalCount,
      present_count: rows.filter((r) => r.status === 'p' || r.status === 'l' || r.status === 'm')
        .length,
      absent_count: rows.filter((r) => r.status === 'a').length,
    },
  })
}


/**
 * حفظ دفعة مزامنة كاملة لحصة (أداء 3A-296): كل تغييرات الحصة المعلّقة في
 * طلبين على الأكثر — upsert جماعي للقيم غير الفارغة + حذف جماعي لصفوف
 * القيم الفارغة تماماً (نفس عقد saveAttendance الفردي: لا صف بلا قيمة).
 * Idempotent: إعادة إرسال نفس الدفعة تعطي نفس النتيجة، فهي آمنة كوحدة
 * مزامنة لقائمة الأوفلاين. لا تمس left_at (upsert يحدّث أعمدته فقط).
 */
export async function saveAttendanceBatch(
  teacherId: string,
  sessionId: string,
  entries: { studentId: string; value: AttendanceValue }[],
): Promise<void> {
  if (entries.length === 0) return
  const rows = buildUpsertRows(teacherId, sessionId, entries)
  if (rows.length > 0) {
    const { error } = await db()
      .from('attendance')
      .upsert(rows, { onConflict: 'session_id,student_id' })
    if (error) throwSaveError(error)
  }
  const deletionIds = entries.filter((e) => isEmptyValue(e.value)).map((e) => e.studentId)
  if (deletionIds.length > 0) {
    const { error } = await db()
      .from('attendance')
      .delete()
      .eq('teacher_id', teacherId)
      .eq('session_id', sessionId)
      .in('student_id', deletionIds)
    if (error) throwSaveError(error)
  }
  logBatchSaved(teacherId, sessionId, rows, entries.length)
}

// ---------------------------------------------------------------------------
// تنبيهات وصل/غادر لولي الأمر (Phase 3 خطوة 6 — migration ‏0012)
//
// التوليد نفسه في القاعدة (trigger على attendance + قيد فريد)، فلا كود
// توليد هنا إطلاقاً: حفظ الحضور بأي مسار (فردي/جماعي/QR/مزامنة أوفلاين)
// يولّد تنبيه البوابة تلقائياً وبشكل idempotent وfail-safe. ما هنا:
// 1) الانصراف الصريح: left_at على صف الحضور نفسه — تحديث مستقل لا يمرّ
//    بـ AttendanceValue حتى لا تمسّه قائمة الأوفلاين ولا حفظ الحالات.
//    أونلاين فقط بوعي (الزر معطّل أوفلاين في الواجهة).
// 2) رسائل واتساب الوصول/المغادرة الموحّدة لقائمة الإرسال اليدوية —
//    روابط wa.me فردية يضغطها المدرس/المساعد بنفسه، بلا أي إرسال
//    تلقائي وبلا Push خارجي (قيد المرحلة الموثّق في 0012).
// ---------------------------------------------------------------------------

/** تسجيل انصراف طالب الآن (يولّد تنبيه «غادر» في بوابة ولي أمره) */
export async function markStudentLeft(
  teacherId: string,
  sessionId: string,
  studentId: string,
): Promise<void> {
  const { error } = await db()
    .from('attendance')
    .update({ left_at: new Date().toISOString() })
    .eq('teacher_id', teacherId)
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .is('left_at', null)
  if (error) throw friendlyDbError(error, t('common.saveError'), t('common.saveBlockedByMissingLink'))
}

/** التراجع عن انصراف مسجل (تنبيه المغادرة المولّد يبقى — انظر 0012) */
export async function clearStudentLeft(
  teacherId: string,
  sessionId: string,
  studentId: string,
): Promise<void> {
  const { error } = await db()
    .from('attendance')
    .update({ left_at: null })
    .eq('teacher_id', teacherId)
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
  if (error) throw friendlyDbError(error, t('common.saveError'), t('common.saveBlockedByMissingLink'))
}

export interface ArrivalWaContext {
  sessionDate: string
  groupName: string
  /** اسم السنتر من الهوية البيضاء (0008) — null يسقط لصياغة بلا اسم سنتر */
  centreName: string | null
}

/** نص رسالة الوصول الموحّد — يُستخدم في رابط wa.me وفي «نسخ الكل» معاً */
export function arrivalMessage(
  student: RosterStudent,
  contact: GuardianContact | undefined,
  ctx: ArrivalWaContext,
): string {
  const { name: guardianName } = resolveGuardian(student, contact)
  const place = ctx.centreName ? t('attendance.arrivalPlace', { centre: ctx.centreName }) : ''
  return t('attendance.arrivalWaMessage', {
    guardian: guardianName,
    name: student.name,
    place,
    group: ctx.groupName,
    date: ctx.sessionDate,
  })
}

/** نص رسالة المغادرة الموحّد — يُستخدم في رابط wa.me وفي «نسخ الكل» معاً */
export function departureMessage(
  student: RosterStudent,
  contact: GuardianContact | undefined,
  ctx: ArrivalWaContext,
): string {
  const { name: guardianName } = resolveGuardian(student, contact)
  const place = ctx.centreName ? t('attendance.departurePlace', { centre: ctx.centreName }) : ''
  return t('attendance.departureWaMessage', {
    guardian: guardianName,
    name: student.name,
    place,
    group: ctx.groupName,
    date: ctx.sessionDate,
  })
}

export function arrivalWaUrl(
  student: RosterStudent,
  contact: GuardianContact | undefined,
  ctx: ArrivalWaContext,
): string | null {
  const { phone } = resolveGuardian(student, contact)
  const base = waLink(phone)
  if (!base) return null
  return `${base}?text=${encodeURIComponent(arrivalMessage(student, contact, ctx))}`
}

export function departureWaUrl(
  student: RosterStudent,
  contact: GuardianContact | undefined,
  ctx: ArrivalWaContext,
): string | null {
  const { phone } = resolveGuardian(student, contact)
  const base = waLink(phone)
  if (!base) return null
  return `${base}?text=${encodeURIComponent(departureMessage(student, contact, ctx))}`
}

/** هل صدرت فواتير شهر هذه الحصة لمجموعتها؟ (تنبيه المرجع §3.2) */
export async function fetchMonthHasInvoices(
  teacherId: string,
  groupId: string,
  sessionDate: string,
): Promise<boolean> {
  const { count, error } = await db()
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', teacherId)
    .eq('group_id', groupId)
    .eq('period_month', monthStartStr(sessionDate))
  if (error) throw error
  return (count ?? 0) > 0
}

// ---------------------------------------------------------------------------
// سجل حضور طالب واحد — لتبويب الحضور في ملف الطالب (المرجع §3.4)
// ---------------------------------------------------------------------------

export interface StudentAttendanceRecord {
  session_id: string
  session_date: string
  start_time: string
  group_id: string
  group_name: string
  status: AttendanceStatus | null
  homework_done: boolean
  starred: boolean
}

export async function fetchStudentAttendance(
  teacherId: string,
  studentId: string,
): Promise<StudentAttendanceRecord[]> {
  const { data, error } = await db()
    .from('attendance')
    .select('session_id, status, homework_done, starred, sessions!inner(session_date, start_time, group_id, groups(name))')
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
  if (error) throw error
  const rows = (data ?? []).map((row) => {
    const se = row.sessions
    return {
      session_id: row.session_id,
      session_date: se.session_date ?? '',
      start_time: se.start_time ?? '',
      group_id: se.group_id ?? '',
      group_name: se.groups?.name ?? '—',
      status: row.status ?? null,
      homework_done: Boolean(row.homework_done),
      starred: Boolean(row.starred),
    }
  })
  // الأحدث أولاً — ترتيب محلي لأن الترتيب على جدول مرتبط غير مضمون الشكل هنا
  rows.sort((a, b) =>
    a.session_date === b.session_date
      ? b.start_time.localeCompare(a.start_time)
      : b.session_date.localeCompare(a.session_date),
  )
  return rows
}

export interface StudentAttendanceStats {
  /** حصص سُجّلت لها حالة (status غير null) */
  marked: number
  /** منها الحضور الفعلي p/l/m */
  attended: number
  /** النسبة % من view ‏student_attendance_stats — null عند غياب أي تسجيل */
  rate: number | null
}

/** نسبة الالتزام من view ‏student_attendance_stats في المخطط (محسوبة، لا مخزنة) */
export async function fetchStudentAttendanceStats(
  teacherId: string,
  studentId: string,
): Promise<StudentAttendanceStats> {
  const { data, error } = await db()
    .from('student_attendance_stats')
    .select('marked_sessions, attended_sessions, attendance_rate')
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { marked: 0, attended: 0, rate: null }
  const row = data
  return {
    marked: Number(row.marked_sessions) || 0,
    attended: Number(row.attended_sessions) || 0,
    rate: row.attendance_rate == null ? null : Number(row.attendance_rate),
  }
}
