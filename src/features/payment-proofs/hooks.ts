import { useMutation, useQuery } from '@tanstack/react-query'
import type { PaymentProofRow } from '../../types/database'
import { INVALIDATION_SETS, useInvalidatePrefixes } from '../../lib/invalidate'
import {
  approveProof,
  fetchPendingProofs,
  fetchProofImageUrl,
  rejectProof,
  type ApproveProofInput,
} from './api'

/** كل مفاتيح وحدة إثباتات الدفع تبدأ بـ 'payment-proofs' */
export const PP = 'payment-proofs'

export function usePendingProofs(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [PP, 'pending', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchPendingProofs(teacherId!),
  })
}

/** رابط الصورة الموقّع — يُجلب عند فتح شيت المراجعة فقط */
export function useProofImageUrl(storagePath: string | null) {
  return useQuery({
    queryKey: [PP, 'image', storagePath],
    enabled: Boolean(storagePath),
    queryFn: () => fetchProofImageUrl(storagePath!),
    staleTime: 5 * 60_000, // الرابط صالح 10 دقائق من الخادم
  })
}

/**
 * الاعتماد/الرفض عمليتان ماليتان: تبطلان كاش الإثباتات والفواتير
 * والرئيسية (محصّل الشهر + تنبيه إثباتات الانتظار في fetchAlerts)
 * والطلاب (شارات الأرصدة) — نفس عقد إبطالات وحدة الفواتير، زائد
 * المعرّضين: اعتماد إثبات ينشئ دفعة فتتغير المتأخرات التي تُشتق
 * منها قائمة المعرّضين (3A-377). المجموعة في INVALIDATION_SETS.paymentProofs.
 */
function useInvalidateProofs() {
  return useInvalidatePrefixes(INVALIDATION_SETS.paymentProofs)
}

export function useApproveProof(teacherId: string, reviewerId: string) {
  const invalidate = useInvalidateProofs()
  return useMutation({
    mutationFn: ({ proof, input }: { proof: PaymentProofRow; input: ApproveProofInput }) =>
      approveProof(teacherId, reviewerId, proof, input),
    onSuccess: invalidate,
  })
}

export function useRejectProof(teacherId: string, reviewerId: string) {
  const invalidate = useInvalidateProofs()
  return useMutation({
    mutationFn: ({ proofId, reason }: { proofId: string; reason: string | null }) =>
      rejectProof(teacherId, reviewerId, proofId, reason),
    onSuccess: invalidate,
  })
}
