import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ExtraSessionInput, GroupRow, HolidayRow, SessionRow } from '../../types/database'
import { HOME } from '../home/hooks'
import {
  addHolidayDates,
  createExtraSession,
  deleteHoliday,
  ensureSessionsGenerated,
  fetchHolidays,
  fetchSessionsInRange,
  moveSession,
  setSessionStatus,
} from './api'

/** كل مفاتيح وحدة الجدول تبدأ بـ 'schedule' */
export const SCHED = 'schedule'

/**
 * ضمان التوليد: يستدعي دالة المخطط لكل (مجموعة × شهر) مطلوب.
 * المفتاح يشمل معرفات المجموعات والشهور — مجموعة جديدة أو شهر جديد
 * يعيد التشغيل، وداخل api طبقة ذاكرة تمنع تكرار RPC لنفس الثلاثية.
 */
export function useGeneration(
  teacherId: string | undefined,
  groups: GroupRow[] | undefined,
  monthStarts: string[],
) {
  const groupsKey = groups ? groups.map((g) => g.id).sort().join(',') : ''
  const monthsKey = [...monthStarts].sort().join(',')
  return useQuery({
    queryKey: [SCHED, 'gen', teacherId, groupsKey, monthsKey],
    enabled: Boolean(teacherId && groups),
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      await ensureSessionsGenerated(teacherId!, groups!, monthStarts)
      return true
    },
  })
}

/** حصص مدى زمني حقيقية من sessions — تُفعَّل بعد اكتمال توليد شهور المدى */
export function useScheduleSessions(
  teacherId: string | undefined,
  from: string,
  to: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [SCHED, 'sessions', teacherId, from, to],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchSessionsInRange(teacherId!, from, to),
  })
}

export function useHolidays(teacherId: string | undefined) {
  return useQuery({
    queryKey: [SCHED, 'holidays', teacherId],
    enabled: Boolean(teacherId),
    queryFn: () => fetchHolidays(teacherId!),
  })
}

/** أي تعديل في الجدول يبطل كاش الجدول والرئيسية معاً (تقرأ نفس الجدول) */
function useInvalidateSchedule() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: [SCHED] })
    void qc.invalidateQueries({ queryKey: [HOME] })
  }
}

export function useAddHolidays(teacherId: string) {
  const invalidate = useInvalidateSchedule()
  return useMutation({
    mutationFn: ({ dates, name }: { dates: string[]; name: string | null }) =>
      addHolidayDates(teacherId, dates, name),
    onSuccess: invalidate,
  })
}

export function useDeleteHoliday(teacherId: string) {
  const invalidate = useInvalidateSchedule()
  return useMutation({
    mutationFn: (holiday: HolidayRow) => deleteHoliday(teacherId, holiday),
    onSuccess: invalidate,
  })
}

export function useCreateExtraSession(teacherId: string) {
  const invalidate = useInvalidateSchedule()
  return useMutation({
    mutationFn: (input: ExtraSessionInput) => createExtraSession(teacherId, input),
    onSuccess: invalidate,
  })
}

export function useMoveSession(teacherId: string) {
  const invalidate = useInvalidateSchedule()
  return useMutation({
    mutationFn: ({ session, date, time }: { session: SessionRow; date: string; time: string }) =>
      moveSession(teacherId, session, date, time),
    onSuccess: invalidate,
  })
}

export function useSetSessionStatus(teacherId: string) {
  const invalidate = useInvalidateSchedule()
  return useMutation({
    mutationFn: ({ sessionId, status }: { sessionId: string; status: 'scheduled' | 'cancelled' }) =>
      setSessionStatus(teacherId, sessionId, status),
    onSuccess: invalidate,
  })
}
