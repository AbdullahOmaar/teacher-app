import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PaymentProofRow } from '../../types/database'
import { HOME } from '../home/hooks'
import { INV } from '../invoices/hooks'
import { SG } from '../students/hooks'
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
 * والطلاب (شارات الأرصدة) — نفس عقد إبطالات وحدة الفواتير.
 */
function useInvalidateProofs() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: [PP] })
    void qc.invalidateQueries({ queryKey: [INV] })
    void qc.invalidateQueries({ queryKey: [HOME] })
    void qc.invalidateQueries({ queryKey: [SG] })
  }
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
