import { useQuery } from '@tanstack/react-query'
import { fetchGroups } from '../groups/api'
import { ensureSessionsGenerated, generationWindowMonths } from '../schedule/api'
import {
  addDaysStr,
  fetchActiveCountsByGroup,
  fetchActiveStudentsCount,
  fetchAnyAttendanceCount,
  fetchAttendanceForSessions,
  fetchCollectedInRange,
  fetchInvoiceBalances,
  fetchMonthPayments,
  fetchMonthlyAttendance,
  fetchNewStudentsCount,
  fetchSessionsInRange,
  monthEndStr,
  monthStartStr,
  prevMonthSameDaysWindow,
  todayStr,
  type MonthlyAttendance,
} from './api'
import { fetchAlerts } from '../notifications/api'

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

/** أي حضور مُعلَّم تاريخياً — خطوة بطاقة «ابدأ هنا» الثالثة (M3) */
export function useAnyAttendanceCount(teacherId: string | undefined) {
  return useQuery({
    queryKey: [HOME, 'any-attendance', teacherId],
    enabled: Boolean(teacherId),
    queryFn: () => fetchAnyAttendanceCount(teacherId!),
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

export interface HomeDeltas {
  /** محصّل نافذة نفس الأيام من الشهر السابق — null للمساعد (لا مالية) */
  collectedPrev: number | null
  /** حضور نافذة المقارنة (نفس أيام الشهر السابق) */
  attPrev: MonthlyAttendance
  /** انضمامات هذا الشهر حتى اليوم */
  joinsCur: number
  /** انضمامات نافذة المقارنة */
  joinsPrev: number
}

/**
 * بيانات مقارنة الدلتا (W5 — R-13): نافذة «نفس عدد الأيام» من الشهر
 * السابق لثلاثة مؤشرات — التحصيل (مالك فقط)، الحضور، وانضمامات الطلاب.
 * استعلام ثانوي: لا يدخل في حالة تحميل/خطأ البطاقات الأساسية.
 */
export function useHomeDeltas(teacherId: string | undefined, isOwner: boolean) {
  const today = todayStr()
  const monthStart = monthStartStr(today)
  const win = prevMonthSameDaysWindow(today)
  return useQuery({
    queryKey: [HOME, 'deltas', teacherId, monthStart],
    enabled: Boolean(teacherId),
    queryFn: async (): Promise<HomeDeltas> => {
      const [attPrev, joinsCur, joinsPrev, collectedPrev] = await Promise.all([
        fetchMonthlyAttendance(teacherId!, win.start, win.end),
        fetchNewStudentsCount(teacherId!, monthStart, today),
        fetchNewStudentsCount(teacherId!, win.start, win.end),
        isOwner
          ? fetchCollectedInRange(teacherId!, win.start, win.end)
          : Promise.resolve(null),
      ])
      return { collectedPrev, attPrev, joinsCur, joinsPrev }
    },
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

/**
 * حصص اليوم وغداً — تغذي Hero الحصة القادمة وقائمة حصص اليوم.
 * قبل القراءة نضمن توليد حصص نافذة الجدول (ماضٍ/حالي/قادم — وحدة الجدول)
 * من جداول المجموعات؛ فشل التوليد لا يمنع القراءة ولا يكسر عقد الحصص هنا.
 */
export function useUpcomingSessions(teacherId: string | undefined) {
  const today = todayStr()
  const tomorrow = addDaysStr(today, 1)
  return useQuery({
    queryKey: [HOME, 'sessions-range', teacherId, today],
    enabled: Boolean(teacherId),
    queryFn: async () => {
      try {
        const groups = await fetchGroups(teacherId!)
        await ensureSessionsGenerated(teacherId!, groups, generationWindowMonths(today))
      } catch (err) {
        // التوليد خطوة مساعدة — نعرض ما هو موجود في الجدول على أي حال،
        // لكن الفشل يُسجَّل ولا يُبتلع صامتاً (PAT-2)
        console.warn('[home] session generation failed, showing existing sessions', err)
      }
      return fetchSessionsInRange(teacherId!, today, tomorrow)
    },
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

/**
 * التنبيهات المختصرة (getAlerts) — بطاقة الإشعارات في الرئيسية.
 * مصدر الاشتقاق واحد مع شاشة الإشعارات (الخطوة 8): fetchAlerts في
 * features/notifications/api بنفس مفتاح الكاش هنا، فعدد التنبيهات
 * وأول تنبيه في البطاقة يطابقان شاشة الإشعارات دائماً.
 */
export function useHomeAlerts(teacherId: string | undefined, isOwner: boolean) {
  const today = todayStr()
  return useQuery({
    queryKey: [HOME, 'alerts', teacherId, today, isOwner],
    enabled: Boolean(teacherId),
    queryFn: () => fetchAlerts(teacherId!, today, isOwner),
  })
}
