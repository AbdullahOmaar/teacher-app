import { useMutation, useQuery } from '@tanstack/react-query'
import { INVALIDATION_SETS, useInvalidatePrefixes } from '../../lib/invalidate'
import type { FeedbackKind, FeedbackStatus } from '../../types/database'
import {
  fetchFeedbackList,
  fetchFeedbackUnreadCount,
  setFeedbackStatus,
  submitFeedback,
} from './api'

export const FEEDBACK = 'feedback'

/** قائمة ملاحظات الحساب — تُفعَّل للمالك فقط (القراءة RLS مالك فقط أصلاً) */
export function useFeedbackList(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [FEEDBACK, 'list', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchFeedbackList(teacherId!),
  })
}

/**
 * عدّاد غير المقروء — يُستخدم في شارة «المزيد» وفي الصفحة.
 * حتى تطبيق 0052 يفشل الاستعلام (الجدول غائب) فيبقى data بلا قيمة
 * ولا تظهر أي شارة — تدهور معلن ومقصود، لا رقم وهمي.
 */
export function useFeedbackUnreadCount(teacherId: string | undefined) {
  return useQuery({
    queryKey: [FEEDBACK, 'unread', teacherId],
    enabled: Boolean(teacherId),
    queryFn: () => fetchFeedbackUnreadCount(teacherId!),
  })
}

export function useSubmitFeedback(teacherId: string) {
  const invalidate = useInvalidatePrefixes(INVALIDATION_SETS.feedback)
  return useMutation({
    mutationFn: (input: { kind: FeedbackKind; body: string }) =>
      submitFeedback(teacherId, input.kind, input.body),
    onSuccess: () => invalidate(),
  })
}

export function useSetFeedbackStatus() {
  const invalidate = useInvalidatePrefixes(INVALIDATION_SETS.feedback)
  return useMutation({
    mutationFn: (input: { id: string; status: FeedbackStatus }) =>
      setFeedbackStatus(input.id, input.status),
    onSuccess: () => invalidate(),
  })
}
