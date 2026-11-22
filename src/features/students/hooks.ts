import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { INVALIDATION_SETS, invalidatePrefixes, useInvalidatePrefixes } from '../../lib/invalidate'
import type { EnrollmentInput, StudentInput } from '../../types/database'
import {
  createStudent,
  deleteEnrollment,
  deleteStudent,
  fetchEnrollments,
  fetchStudent,
  fetchStudentBalances,
  fetchStudentEnrollments,
  fetchStudentFootprint,
  fetchStudents,
  setStudentPaused,
  updateStudent,
  upsertEnrollment,
} from './api'

/** كل مفاتيح وحدة الطلاب/المجموعات تبدأ بـ 'sg' لتسهيل الإبطال الشامل */
export const SG = 'sg'

export function useStudents(teacherId: string | undefined) {
  return useQuery({
    queryKey: [SG, 'students', teacherId],
    enabled: Boolean(teacherId),
    queryFn: () => fetchStudents(teacherId!),
  })
}

export function useStudent(teacherId: string | undefined, studentId: string | undefined) {
  return useQuery({
    queryKey: [SG, 'student', teacherId, studentId],
    enabled: Boolean(teacherId && studentId),
    queryFn: () => fetchStudent(teacherId!, studentId!),
  })
}

export function useEnrollments(teacherId: string | undefined) {
  return useQuery({
    queryKey: [SG, 'enrollments', teacherId],
    enabled: Boolean(teacherId),
    queryFn: () => fetchEnrollments(teacherId!),
  })
}

export function useStudentEnrollments(teacherId: string | undefined, studentId: string | undefined) {
  return useQuery({
    queryKey: [SG, 'student-enrollments', teacherId, studentId],
    enabled: Boolean(teacherId && studentId),
    queryFn: () => fetchStudentEnrollments(teacherId!, studentId!),
  })
}

export function useStudentBalances(teacherId: string | undefined) {
  return useQuery({
    queryKey: [SG, 'balances', teacherId],
    enabled: Boolean(teacherId),
    queryFn: () => fetchStudentBalances(teacherId!),
  })
}

/**
 * إبطال وحدة الطلاب/التسجيلات — المجموعة الكاملة في INVALIDATION_SETS.students:
 * التسجيلات تغذي قوائم حضور المجموعات (roster)، والطلاب يغذون عدّادات
 * التحليلات، والتسجيل/الإيقاف يغيّر مجموعة مرشحي المعرّضين — فكانت
 * [SG, HOME] وحدها ناقصة (3A-377).
 */
function useInvalidateModule() {
  return useInvalidatePrefixes(INVALIDATION_SETS.students)
}

export function useCreateStudent(teacherId: string) {
  const invalidate = useInvalidateModule()
  return useMutation({
    mutationFn: (input: StudentInput) => createStudent(teacherId, input),
    onSuccess: invalidate,
  })
}

export function useUpdateStudent(teacherId: string) {
  const invalidate = useInvalidateModule()
  return useMutation({
    mutationFn: ({ studentId, input }: { studentId: string; input: StudentInput }) =>
      updateStudent(teacherId, studentId, input),
    onSuccess: invalidate,
  })
}

export function useSetStudentPaused(teacherId: string) {
  const invalidate = useInvalidateModule()
  return useMutation({
    mutationFn: ({ studentId, paused }: { studentId: string; paused: boolean }) =>
      setStudentPaused(teacherId, studentId, paused),
    onSuccess: invalidate,
  })
}

export function useUpsertEnrollment(teacherId: string) {
  const invalidate = useInvalidateModule()
  return useMutation({
    mutationFn: (input: EnrollmentInput) => upsertEnrollment(teacherId, input),
    onSuccess: invalidate,
  })
}

/** بصمة الطالب (فواتير/دفعات/روابط) — تُحسم بها أهلية الحذف النهائي */
export function useStudentFootprint(
  teacherId: string | undefined,
  studentId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [SG, 'student-footprint', teacherId, studentId],
    enabled: Boolean(teacherId && studentId && enabled),
    queryFn: () => fetchStudentFootprint(teacherId!, studentId!),
  })
}

/**
 * حذف نهائي لطالب بلا أثر مالي. الحذف يطال وحدات أخرى (حضور/درجات cascade)
 * فنُبطل كل الوحدات المتأثرة صراحة بدل إبطال شامل أعمى (PAT-1) —
 * المجموعة في INVALIDATION_SETS.studentsDelete.
 */
export function useDeleteStudent(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (studentId: string) => deleteStudent(teacherId, studentId),
    onSuccess: () => {
      void invalidatePrefixes(qc, INVALIDATION_SETS.studentsDelete)
    },
  })
}

export function useDeleteEnrollment(teacherId: string) {
  const invalidate = useInvalidateModule()
  return useMutation({
    mutationFn: (enrollmentId: string) => deleteEnrollment(teacherId, enrollmentId),
    onSuccess: invalidate,
  })
}
