import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { EnrollmentInput, StudentInput } from '../../types/database'
import {
  createStudent,
  deleteEnrollment,
  fetchEnrollments,
  fetchStudent,
  fetchStudentBalances,
  fetchStudentEnrollments,
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
  return () => {
    void qc.invalidateQueries({ queryKey: [SG] })
  }
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

export function useDeleteEnrollment(teacherId: string) {
  const invalidate = useInvalidateModule()
  return useMutation({
    mutationFn: (enrollmentId: string) => deleteEnrollment(teacherId, enrollmentId),
    onSuccess: invalidate,
  })
}
