import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/useAuth'
import { fetchSeenFeatureIds, markFeatureSeen } from './api'
import { unseenFeatures, type NewFeatureDef } from './registry'

export const NEW_FEATURES_KEY = 'new-features'

/**
 * حالة نظام «جديد» لحساب المدرس الحالي.
 * رهنان مقصودان قبل أي عرض:
 * • حتى تُعرَف حالة «شوهدت» (نجاح الاستعلام) لا تُعرض أي شارة —
 *   فشل الاستعلام (قبل تطبيق 0073) = لا شارات إطلاقاً، لا وميض
 *   «كل شيء جديد» وهمي.
 * • الختم تفاؤلي محلياً: الشارة والبطاقة تختفيان فور الضغط، وكتابة
 *   الخادم في الخلفية؛ فشلها يعيد الحالة عند أول إعادة جلب.
 */
export function useNewFeatures(teacherId: string | undefined) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const seenQ = useQuery({
    queryKey: [NEW_FEATURES_KEY, 'seen', teacherId],
    enabled: Boolean(teacherId),
    queryFn: () => fetchSeenFeatureIds(teacherId!),
    retry: false,
    staleTime: 60_000,
  })

  const seen = useMemo<ReadonlySet<string> | null>(
    () => (seenQ.data ? new Set(seenQ.data) : null),
    [seenQ.data],
  )
  const unseen = useMemo<readonly NewFeatureDef[]>(
    () => (seen ? unseenFeatures(seen) : []),
    [seen],
  )

  const markSeenMut = useMutation({
    mutationFn: (featureId: string) =>
      markFeatureSeen(teacherId!, featureId, user?.id ?? null),
    onMutate: (featureId) => {
      // اختفاء فوري: تحديث كاش «شوهدت» قبل ردّ الخادم
      qc.setQueryData<string[]>([NEW_FEATURES_KEY, 'seen', teacherId], (old) =>
        old && !old.includes(featureId) ? [...old, featureId] : old,
      )
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: [NEW_FEATURES_KEY, 'seen', teacherId] })
    },
  })

  return {
    /** الخصائص غير المشاهَدة (فارغة حتى تُعرف الحالة) */
    unseen,
    isUnseen: (featureId: string) => unseen.some((f) => f.id === featureId),
    /** ختم خاصية «شوهدت» — تختفي شارتها وبطاقتها نهائياً لهذا المدرس */
    markSeen: (featureId: string) => {
      if (teacherId) markSeenMut.mutate(featureId)
    },
  }
}
