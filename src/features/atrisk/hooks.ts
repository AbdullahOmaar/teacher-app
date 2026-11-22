import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todayStr } from '../home/api'
import { INVALIDATION_SETS, invalidatePrefixes } from '../../lib/invalidate'
import { fetchAtRisk, markAtRiskFollowedUp } from './api'

/** كل مفاتيح وحدة «معرّضون للفقد» تبدأ بـ 'atrisk' */
export const ATRISK = 'atrisk'

/**
 * قائمة المعرّضين للفقد المشتقّة — المفتاح يشمل اليوم (الأحداث والشهور
 * تُقاس عليه) ودور العارض (سبب المتأخرات للمالك فقط)، فبطاقة الرئيسية
 * وصفحة القائمة تتشاركان نفس الكاش والنتيجة دائماً.
 */
export function useAtRisk(teacherId: string | undefined, isOwner: boolean) {
  const today = todayStr()
  return useQuery({
    queryKey: [ATRISK, 'list', teacherId, today, isOwner],
    enabled: Boolean(teacherId),
    queryFn: () => fetchAtRisk(teacherId!, today, isOwner),
  })
}

/** «تمت المتابعة»: إدراج صف المتابعة ثم إبطال القائمة فتُعاد الاشتقاقات */
export function useMarkAtRiskFollowedUp(teacherId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { studentId: string; userId: string; reasonsSummary: string }) =>
      markAtRiskFollowedUp(teacherId!, input.studentId, input.userId, input.reasonsSummary),
    onSuccess: () => {
      void invalidatePrefixes(queryClient, INVALIDATION_SETS.atrisk)
    },
  })
}
