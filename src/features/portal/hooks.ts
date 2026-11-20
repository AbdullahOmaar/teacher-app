import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { StudentRow } from '../../types/database'
import {
  createPortalLink,
  fetchPortalOverview,
  fetchStudentTokens,
  fetchTeacherTokens,
  revokePortalToken,
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
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: [PORTAL] })
  }
}

/**
 * توليد/إعادة توليد رابط بوابة لطالب. النتيجة (الرابط بالرمز الخام)
 * يعيش في حالة المكوّن المستدعي فقط — لا يُحفظ في كاش الاستعلامات
 * ولا في أي تخزين، لأن القاعدة نفسها لا تحتفظ إلا بالهاش.
 */
export function useCreatePortalLink(teacherId: string) {
  const invalidate = useInvalidatePortal()
  return useMutation({
    mutationFn: (student: StudentRow) => createPortalLink(teacherId, student),
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
