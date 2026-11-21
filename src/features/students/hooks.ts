import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ANALYTICS } from '../analytics/hooks'
import { ATRISK } from '../atrisk/hooks'
import { ATT } from '../attendance/hooks'
import { GRADES } from '../grades/hooks'
import { HOME } from '../home/hooks'
import { invalidatePrefixes } from '../../lib/invalidate'
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

function useInvalidateModule() {
  const qc = useQueryClient()
  // الطلاب/التسجيلات تغذي عدّاد الرئيسية النشط أيضاً (PAT-1)
  return () => invalidatePrefixes(qc, [SG, HOME])
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
 * فنُبطل كل الوحدات المتأثرة صراحة بدل إبطال شامل أعمى (PAT-1).
 */
export function useDeleteStudent(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (studentId: string) => deleteStudent(teacherId, studentId),
    onSuccess: () => {
      invalidatePrefixes(qc, [SG, HOME, ATT, GRADES, ATRISK, ANALYTICS])
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
