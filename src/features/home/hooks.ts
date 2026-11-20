import { useQuery } from '@tanstack/react-query'
import {
  addDaysStr,
  fetchActiveCountsByGroup,
  fetchActiveStudentsCount,
  fetchAttendanceForSessions,
  fetchHomeAlerts,
  fetchInvoiceBalances,
  fetchMonthPayments,
  fetchMonthlyAttendance,
  fetchSessionsInRange,
  monthEndStr,
  monthStartStr,
  todayStr,
} from './api'

/** كل مفاتيح وحدة الرئيسية تبدأ بـ 'home' */
export const HOME = 'home'

export function useActiveStudentsCount(teacherId: string | undefined) {
  return useQuery({
    queryKey: [HOME, 'active-students', teacherId],
    enabled: Boolean(teacherId),
    queryFn: () => fetchActiveStudentsCount(teacherId!),
  })
}

/** نسبة حضور الشهر الحالي — المفتاح يشمل أول الشهر فتتجدد تلقائياً مع تغيّره */
export function useMonthlyAttendance(teacherId: string | undefined) {
  const today = todayStr()
  const monthStart = monthStartStr(today)
  const monthEnd = monthEndStr(today)
  return useQuery({
    queryKey: [HOME, 'month-attendance', teacherId, monthStart],
    enabled: Boolean(teacherId),
    queryFn: () => fetchMonthlyAttendance(teacherId!, monthStart, monthEnd),
  })
}

/** محصّل الشهر واليوم من payments — تُفعّل للمالك فقط (المالية محجوبة عن المساعد) */
export function useMonthPayments(teacherId: string | undefined, enabled: boolean) {
  const today = todayStr()
  const monthStart = monthStartStr(today)
  const monthEnd = monthEndStr(today)
  return useQuery({
    queryKey: [HOME, 'month-payments', teacherId, monthStart],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchMonthPayments(teacherId!, monthStart, monthEnd, today),
  })
}

/** أرصدة الفواتير من view ‏invoice_balances — للمالك فقط */
export function useInvoiceBalances(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [HOME, 'invoice-balances', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchInvoiceBalances(teacherId!),
  })
}

/** حصص اليوم وغداً — تغذي Hero الحصة القادمة وقائمة حصص اليوم */
export function useUpcomingSessions(teacherId: string | undefined) {
  const today = todayStr()
  const tomorrow = addDaysStr(today, 1)
  return useQuery({
    queryKey: [HOME, 'sessions-range', teacherId, today],
    enabled: Boolean(teacherId),
    queryFn: () => fetchSessionsInRange(teacherId!, today, tomorrow),
  })
}

export function useAttendanceForSessions(
  teacherId: string | undefined,
  sessionIds: string[],
) {
  const key = [...sessionIds].sort().join(',')
  return useQuery({
    queryKey: [HOME, 'session-attendance', teacherId, key],
    enabled: Boolean(teacherId) && sessionIds.length > 0,
    queryFn: () => fetchAttendanceForSessions(teacherId!, sessionIds),
  })
}

export function useActiveCountsByGroup(teacherId: string | undefined, groupIds: string[]) {
  const key = [...groupIds].sort().join(',')
  return useQuery({
    queryKey: [HOME, 'group-counts', teacherId, key],
    enabled: Boolean(teacherId) && groupIds.length > 0,
    queryFn: () => fetchActiveCountsByGroup(teacherId!, groupIds),
  })
}

/** التنبيهات المختصرة (getAlerts) — بطاقة الإشعارات في الرئيسية */
export function useHomeAlerts(teacherId: string | undefined, isOwner: boolean) {
  const today = todayStr()
  return useQuery({
    queryKey: [HOME, 'alerts', teacherId, today, isOwner],
    enabled: Boolean(teacherId),
    queryFn: () => fetchHomeAlerts(teacherId!, today, isOwner),
  })
}
