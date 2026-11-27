import { useMutation, useQuery } from '@tanstack/react-query'
import { INVALIDATION_SETS, useInvalidatePrefixes } from '../../lib/invalidate'
import {
  fetchMyAnnouncements,
  fetchMyTickets,
  fetchTicketThread,
  replyToTicket,
  submitSupportTicket,
} from './api'

export const SUPPORT = 'support'

/**
 * إعلانات المنصة لحساب المدرس — حتى تطبيق 0065 ترجع الدالة null
 * فتعرض الصفحة «قريباً» المصممة بدل أي خطأ خام.
 */
export function useMyAnnouncements(enabled: boolean) {
  return useQuery({
    queryKey: [SUPPORT, 'announcements'],
    enabled,
    queryFn: fetchMyAnnouncements,
  })
}

/** قائمة تذاكر الحساب — null حتى تطبيق 0065 (صفحة «قريباً») */
export function useMyTickets(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [SUPPORT, 'tickets', teacherId],
    enabled: enabled && Boolean(teacherId),
    queryFn: () => fetchMyTickets(teacherId!),
  })
}

/** خيط تذكرة واحدة برسائلها */
export function useTicketThread(ticketId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [SUPPORT, 'thread', ticketId],
    enabled: enabled && Boolean(ticketId),
    queryFn: () => fetchTicketThread(ticketId!),
  })
}

export function useSubmitSupportTicket(teacherId: string) {
  const invalidate = useInvalidatePrefixes(INVALIDATION_SETS.support)
  return useMutation({
    mutationFn: (input: { subject: string; body: string }) =>
      submitSupportTicket(teacherId, input.subject, input.body),
    onSuccess: invalidate,
  })
}

export function useReplyToTicket() {
  const invalidate = useInvalidatePrefixes(INVALIDATION_SETS.support)
  return useMutation({
    mutationFn: (input: { ticketId: string; body: string }) =>
      replyToTicket(input.ticketId, input.body),
    onSuccess: invalidate,
  })
}
