import { supabase } from '../../lib/supabase'
import { friendlyDbError } from '../../lib/supabaseErrors'
import { logActivity } from '../activity/api'
import type {
  EnrollmentInput,
  EnrollmentRow,
  GroupRow,
  StudentBalanceRow,
  StudentInput,
  StudentRow,
} from '../../types/database'

function db() {
  if (!supabase) throw new Error('Supabase غير مربوط — راجع إعدادات .env')
  return supabase
}

const STUDENT_COLS =
  'id, teacher_id, public_code, name, grade, school, paused, phone, guardian_name, guardian_phone, level_note, created_at, updated_at'
const ENROLLMENT_COLS = 'id, teacher_id, student_id, group_id, price_override, prepaid_sessions, created_at'

export async function fetchStudents(teacherId: string): Promise<StudentRow[]> {
  const { data, error } = await db()
    .from('students')
    .select(STUDENT_COLS)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as StudentRow[]
}

export async function fetchStudent(teacherId: string, studentId: string): Promise<StudentRow | null> {
  const { data, error } = await db()
    .from('students')
    .select(STUDENT_COLS)
    .eq('teacher_id', teacherId)
    .eq('id', studentId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as StudentRow | null) ?? null
}

export async function fetchEnrollments(teacherId: string): Promise<EnrollmentRow[]> {
  const { data, error } = await db()
    .from('enrollments')
    .select(ENROLLMENT_COLS)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as EnrollmentRow[]
}

export async function fetchStudentEnrollments(
  teacherId: string,
  studentId: string,
): Promise<EnrollmentRow[]> {
  const { data, error } = await db()
    .from('enrollments')
    .select(ENROLLMENT_COLS)
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as EnrollmentRow[]
}

/** أرصدة الطلاب من view ‏student_balances (محسوبة، غير مخزنة) */
export async function fetchStudentBalances(teacherId: string): Promise<Map<string, number>> {
  const { data, error } = await db()
    .from('student_balances')
    .select('teacher_id, student_id, balance')
    .eq('teacher_id', teacherId)
  if (error) throw error
  const map = new Map<string, number>()
  for (const row of (data ?? []) as unknown as StudentBalanceRow[]) {
    map.set(row.student_id, Number(row.balance) || 0)
  }
  return map
}

export async function createStudent(teacherId: string, input: StudentInput): Promise<StudentRow> {
  // public_code لا يُرسل: الـ trigger يولّد كوداً عشوائياً من 8 أحرف
  const { data, error } = await db()
    .from('students')
    .insert({ teacher_id: teacherId, ...input })
    .select(STUDENT_COLS)
    .single()
  if (error) throw error
  return data as unknown as StudentRow
}

export async function updateStudent(
  teacherId: string,
  studentId: string,
  input: StudentInput,
): Promise<StudentRow> {
  const { data, error } = await db()
    .from('students')
    .update(input)
    .eq('teacher_id', teacherId)
    .eq('id', studentId)
    .select(STUDENT_COLS)
    .single()
  if (error) throw error
  return data as unknown as StudentRow
}

export async function setStudentPaused(
  teacherId: string,
  studentId: string,
  paused: boolean,
): Promise<void> {
  // اسم الطالب قبل التغيير (لقطة السجل) — فشله لا يمنع العملية نفسها
  const before = await fetchStudent(teacherId, studentId).catch(() => null)
  const { error } = await db()
    .from('students')
    .update({ paused })
    .eq('teacher_id', teacherId)
    .eq('id', studentId)
  if (error) throw error
  // سجل النشاط: الإيقاف هو «أرشفة» الطالب في هذا النظام (انظر قسم الحذف/
  // الأرشفة الآمنة أسفل) وإلغاؤه إلغاء أرشفة.
  void logActivity(teacherId, {
    event_type: paused ? 'student_archived' : 'student_unarchived',
    entity_type: 'student',
    entity_id: studentId,
    entity_label: before?.name ?? null,
    details: before?.public_code ? { student_code: before.public_code } : {},
  })
}

/** تسجيل طالب في مجموعة (أو تحديث سعره الخاص) — unique (student_id, group_id) */
export async function upsertEnrollment(
  teacherId: string,
  input: EnrollmentInput,
): Promise<EnrollmentRow> {
  const { data, error } = await db()
    .from('enrollments')
    .upsert(
      { teacher_id: teacherId, ...input },
      { onConflict: 'student_id,group_id' },
    )
    .select(ENROLLMENT_COLS)
    .single()
  if (error) throw error
  return data as unknown as EnrollmentRow
}

export async function deleteEnrollment(teacherId: string, enrollmentId: string): Promise<void> {
  const { error } = await db()
    .from('enrollments')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('id', enrollmentId)
  if (error) throw error
}

/** خريطة سريعة: group_id → صف المجموعة */
export function indexGroups(groups: GroupRow[]): Map<string, GroupRow> {
  return new Map(groups.map((g) => [g.id, g]))
}

// ---------------------------------------------------------------------------
// حذف / أرشفة آمنة (Phase 2 — خطوة 10)
//
// قواعد الطالب:
// - الأرشفة = حالة «موقوف» القائمة أصلاً (students.paused): المرجع يعرّفها
//   «موقوف/مؤرشف»، وهي تُخفي الطالب من كل القوائم التشغيلية (فوترة/حضور/
//   تسجيل) وتُبقي كل سجلاته المالية والتاريخية سليمة، وتظهر فقط في فلتر
//   «موقوف / أرشيف». لا حالة أرشفة ثانية — حتى لا تتداخل حالتان.
// - الحذف النهائي ممنوع إطلاقاً عند وجود أي أثر مالي (فواتير أو دفعات)،
//   والقاعدة نفسها تحرسه: invoices.student_id بقيد on delete restrict
//   و payments.invoice_id بقيد restrict — أي محاولة حذف رغم الفحص تُرفض
//   بقيد 23503 وتُترجم لرسالة عربية واضحة (لا خطأ خام).
// - بلا أثر مالي: الحذف النهائي يحذف معه تلقائياً (on delete cascade في
//   0001) التسجيلات والحضور والدرجات وملاحظات الطالب وروابط أولياء الأمور
//   ورموز بوابتهم وإثباتات الدفع المرتبطة به.
// ---------------------------------------------------------------------------

export interface StudentFootprint {
  invoiceCount: number
  paymentCount: number
  enrollmentCount: number
  attendanceCount: number
  scoreCount: number
  /** الحذف النهائي مسموح فقط بلا أي فاتورة أو دفعة */
  canDelete: boolean
}

async function countRows(
  table: string,
  teacherId: string,
  column: string,
  value: string,
): Promise<number> {
  const { count, error } = await db()
    .from(table)
    // '*' لأن جداول مثل attendance/scores مفاتيحها مركّبة بلا عمود id
    .select('*', { count: 'exact', head: true })
    .eq('teacher_id', teacherId)
    .eq(column, value)
  if (error) throw error
  return count ?? 0
}

/** بصمة الطالب: ما يرتبط به فعلياً — أساس قرار «حذف نهائي أم أرشفة فقط» */
export async function fetchStudentFootprint(
  teacherId: string,
  studentId: string,
): Promise<StudentFootprint> {
  // الدفعات لا تحمل student_id مباشرة: تُعدّ عبر فواتير الطالب (join داخلي)
  const paymentsQ = db()
    .from('payments')
    .select('id, invoices!inner(student_id)', { count: 'exact', head: true })
    .eq('teacher_id', teacherId)
    .eq('invoices.student_id', studentId)
  const [invoiceCount, paymentsRes, enrollmentCount, attendanceCount, scoreCount] =
    await Promise.all([
      countRows('invoices', teacherId, 'student_id', studentId),
      paymentsQ,
      countRows('enrollments', teacherId, 'student_id', studentId),
      countRows('attendance', teacherId, 'student_id', studentId),
      countRows('scores', teacherId, 'student_id', studentId),
    ])
  if (paymentsRes.error) throw paymentsRes.error
  const paymentCount = paymentsRes.count ?? 0
  return {
    invoiceCount,
    paymentCount,
    enrollmentCount,
    attendanceCount,
    scoreCount,
    canDelete: invoiceCount === 0 && paymentCount === 0,
  }
}

/**
 * حذف نهائي لطالب بلا أثر مالي. الروابط غير المالية تُحذف cascade من
 * القاعدة؛ ووجود فاتورة يمنع الحذف بقيد restrict فيظهر سبب واضح.
 * لا تُحذف أي فاتورة أو دفعة من هذا المسار إطلاقاً.
 */
export async function deleteStudent(teacherId: string, studentId: string): Promise<void> {
  // لقطة الاسم/الكود قبل الحذف — بعد الحذف لا يبقى من الطالب إلا سجل النشاط
  const before = await fetchStudent(teacherId, studentId).catch(() => null)
  const { error } = await db()
    .from('students')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('id', studentId)
  if (error) throw friendlyDbError(error, 'حصلت مشكلة أثناء حذف الطالب')
  void logActivity(teacherId, {
    event_type: 'student_deleted',
    entity_type: 'student',
    entity_id: studentId,
    entity_label: before?.name ?? null,
    details: before?.public_code ? { student_code: before.public_code } : {},
  })
}
