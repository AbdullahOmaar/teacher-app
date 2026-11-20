import { supabase } from '../../lib/supabase'
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
  const { error } = await db()
    .from('students')
    .update({ paused })
    .eq('teacher_id', teacherId)
    .eq('id', studentId)
  if (error) throw error
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
