import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PaymentMethod, StudentRow } from '../../types/database'
import { INVALIDATION_SETS, useInvalidatePrefixes } from '../../lib/invalidate'
import {
  createPortalLink,
  fetchPortalNotifications,
  fetchPortalOverview,
  fetchPortalProofs,
  fetchStudentTokens,
  fetchTeacherTokens,
  markPortalNotificationsRead,
  revokePortalToken,
  submitPaymentProof,
} from './api'

/** كل مفاتيح وحدة البوابة تبدأ بـ 'portal' */
export const PORTAL = 'portal'

export function useStudentPortalTokens(teacherId: string | undefined, studentId: string | undefined) {
  return useQuery({
    queryKey: [PORTAL, 'student-tokens', teacherId, studentId],
    enabled: Boolean(teacherId && studentId),
    queryFn: () => fetchStudentTokens(teacherId!, studentId!),
  })
}

export function useTeacherPortalTokens(teacherId: string | undefined) {
  return useQuery({
    queryKey: [PORTAL, 'teacher-tokens', teacherId],
    enabled: Boolean(teacherId),
    queryFn: () => fetchTeacherTokens(teacherId!),
  })
}

function useInvalidatePortal() {
  return useInvalidatePrefixes(INVALIDATION_SETS.portal)
}

/**
 * توليد/إعادة توليد رابط بوابة لطالب. النتيجة (الرابط بالرمز الخام)
 * يعيش في حالة المكوّن المستدعي فقط — لا يُحفظ في كاش الاستعلامات
 * ولا في أي تخزين، لأن القاعدة نفسها لا تحتفظ إلا بالهاش.
 */
export function useCreatePortalLink(teacherId: string) {
  const invalidate = useInvalidatePortal()
  return useMutation({
    mutationFn: (input: { student: StudentRow; ttlDays: number }) =>
      createPortalLink(teacherId, input.student, input.ttlDays),
    onSuccess: invalidate,
  })
}

export function useRevokePortalToken(teacherId: string) {
  const invalidate = useInvalidatePortal()
  return useMutation({
    mutationFn: (tokenId: string) => revokePortalToken(teacherId, tokenId),
    onSuccess: invalidate,
  })
}

/**
 * قراءة البوابة العامة بالرمز: بلا إعادة محاولة (رمز خاطئ/منتهٍ لن
 * يتصلح بالمحاولة)، والمفتاح يحمل معرّف الطالب فقط — الرمز الخام
 * لا يدخل مفتاح الكاش ولا يُحفظ في أي مكان.
 */
export function usePortalOverview(studentId: string | null, rawToken: string | null) {
  return useQuery({
    queryKey: [PORTAL, 'overview', studentId],
    enabled: Boolean(studentId && rawToken),
    queryFn: () => fetchPortalOverview(rawToken!, studentId!),
    retry: false,
    staleTime: 60_000,
  })
}

/** إثباتات ولي الأمر لهذا الطالب — بنفس قواعد قراءة البوابة (بلا إعادة محاولة، والرمز لا يدخل المفتاح) */
export function usePortalProofs(studentId: string | null, rawToken: string | null) {
  return useQuery({
    queryKey: [PORTAL, 'proofs', studentId],
    enabled: Boolean(studentId && rawToken),
    queryFn: () => fetchPortalProofs(rawToken!, studentId!),
    retry: false,
    staleTime: 30_000,
  })
}

/** تنبيهات وصل/غادر طالب الرابط — بنفس قواعد قراءة البوابة (بلا إعادة محاولة، والرمز لا يدخل المفتاح) */
export function usePortalNotifications(studentId: string | null, rawToken: string | null) {
  return useQuery({
    queryKey: [PORTAL, 'notifications', studentId],
    enabled: Boolean(studentId && rawToken),
    queryFn: () => fetchPortalNotifications(rawToken!, studentId!),
    retry: false,
    staleTime: 30_000,
  })
}

/** تعليم تنبيهات البوابة كمقروءة — يبطل قائمة التنبيهات بعد النجاح.
 * إبطال دقيق بمفتاح واحد مقصود (3A-377): إبطال بادئة 'portal' كلها
 * كان سيعيد جلب النظرة العامة والإثباتات بلا داعٍ في صفحة عامة. */
export function useMarkPortalNotificationsRead(studentId: string | null, rawToken: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids?: string[]) => markPortalNotificationsRead(rawToken!, studentId!, ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [PORTAL, 'notifications', studentId] })
    },
  })
}

/** إرسال إثبات دفع من البوابة — يبطل قائمة إثباتات البوابة بعد النجاح.
 * إبطال دقيق بمفتاح واحد مقصود (3A-377) — نفس سبب السطر أعلاه. */
export function useSubmitPortalProof(studentId: string | null, rawToken: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { amount: number; method: PaymentMethod; file: File }) =>
      submitPaymentProof(rawToken!, studentId!, input, input.file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [PORTAL, 'proofs', studentId] })
    },
  })
}
