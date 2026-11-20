import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HOME } from '../home/hooks'
import { SCHED } from '../schedule/hooks'
import {
  fetchGuardianContacts,
  fetchMonthHasInvoices,
  fetchSessionAttendance,
  fetchSessionById,
  fetchSessionRoster,
  fetchSessionsInRange,
  fetchStudentAttendance,
  fetchStudentAttendanceStats,
  saveAttendance,
  saveManyAttendance,
  type AttendanceValue,
} from './api'

/** كل مفاتيح وحدة الحضور تبدأ بـ 'attendance' */
export const ATT = 'attendance'

export function useSessionById(teacherId: string | undefined, sessionId: string | undefined) {
  return useQuery({
    queryKey: [ATT, 'session', teacherId, sessionId],
    enabled: Boolean(teacherId && sessionId),
    queryFn: () => fetchSessionById(teacherId!, sessionId!),
  })
}

/** حصص يوم واحد — لقائمة اختيار الحصة في شاشة الحضور */
export function useDaySessions(teacherId: string | undefined, date: string, enabled: boolean) {
  return useQuery({
    queryKey: [ATT, 'day-sessions', teacherId, date],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchSessionsInRange(teacherId!, date, date),
  })
}

export function useSessionRoster(teacherId: string | undefined, groupId: string | undefined) {
  return useQuery({
    queryKey: [ATT, 'roster', teacherId, groupId],
    enabled: Boolean(teacherId && groupId),
    queryFn: () => fetchSessionRoster(teacherId!, groupId!),
  })
}

export function useGuardianContacts(teacherId: string | undefined, studentIds: string[]) {
  const key = [...studentIds].sort().join(',')
  return useQuery({
    queryKey: [ATT, 'guardian-contacts', teacherId, key],
    enabled: Boolean(teacherId) && studentIds.length > 0,
    queryFn: () => fetchGuardianContacts(teacherId!, studentIds),
  })
}

export function useSessionAttendance(teacherId: string | undefined, sessionId: string | undefined) {
  return useQuery({
    queryKey: [ATT, 'session-attendance', teacherId, sessionId],
    enabled: Boolean(teacherId && sessionId),
    queryFn: () => fetchSessionAttendance(teacherId!, sessionId!),
  })
}

export function useMonthHasInvoices(
  teacherId: string | undefined,
  groupId: string | undefined,
  sessionDate: string | undefined,
) {
  return useQuery({
    queryKey: [ATT, 'month-invoices', teacherId, groupId, sessionDate],
    enabled: Boolean(teacherId && groupId && sessionDate),
    queryFn: () => fetchMonthHasInvoices(teacherId!, groupId!, sessionDate!),
  })
}

export function useStudentAttendance(teacherId: string | undefined, studentId: string | undefined) {
  return useQuery({
    queryKey: [ATT, 'student', teacherId, studentId],
    enabled: Boolean(teacherId && studentId),
    queryFn: () => fetchStudentAttendance(teacherId!, studentId!),
  })
}

export function useStudentAttendanceStats(
  teacherId: string | undefined,
  studentId: string | undefined,
) {
  return useQuery({
    queryKey: [ATT, 'student-stats', teacherId, studentId],
    enabled: Boolean(teacherId && studentId),
    queryFn: () => fetchStudentAttendanceStats(teacherId!, studentId!),
  })
}

/**
 * أي حفظ حضور يبطل كاش الحضور والرئيسية والجدول معاً:
 * الرئيسية تحسب منه تقدّم تحضير حصص اليوم ونسبة حضور الشهر والتنبيهات،
 * والجدول يشارك نفس جداول الحصص.
 */
function useInvalidateAttendance() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: [ATT] })
    void qc.invalidateQueries({ queryKey: [HOME] })
    void qc.invalidateQueries({ queryKey: [SCHED] })
  }
}

export function useSaveAttendance(teacherId: string) {
  const invalidate = useInvalidateAttendance()
  return useMutation({
    mutationFn: ({
      sessionId,
      studentId,
      value,
    }: {
      sessionId: string
      studentId: string
      value: AttendanceValue
    }) => saveAttendance(teacherId, sessionId, studentId, value),
    onSuccess: invalidate,
  })
}

export function useSaveManyAttendance(teacherId: string) {
  const invalidate = useInvalidateAttendance()
  return useMutation({
    mutationFn: ({
      sessionId,
      entries,
    }: {
      sessionId: string
      entries: { studentId: string; value: AttendanceValue }[]
    }) => saveManyAttendance(teacherId, sessionId, entries),
    onSuccess: invalidate,
  })
}
