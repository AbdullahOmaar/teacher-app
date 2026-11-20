import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { StudentRow } from '../../types/database'
import {
  createStudentPortalLink,
  fetchStudentPortalOverview,
  fetchStudentPortalTokens,
  revokeStudentPortalToken,
} from './api'

/** كل مفاتيح وحدة بوابة الطالب تبدأ بـ 'student-portal' */
export const STUDENT_PORTAL = 'student-portal'

export function useStudentPortalTokens(
  teacherId: string | undefined,
  studentId: string | undefined,
) {
  return useQuery({
    queryKey: [STUDENT_PORTAL, 'tokens', teacherId, studentId],
    enabled: Boolean(teacherId && studentId),
    queryFn: () => fetchStudentPortalTokens(teacherId!, studentId!),
  })
}

function useInvalidateStudentPortal() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: [STUDENT_PORTAL] })
  }
}

/**
 * توليد/إعادة توليد رابط بوابة طالب. النتيجة (الرابط بالرمز الخام)
 * تعيش في حالة المكوّن المستدعي فقط — لا تُحفظ في كاش الاستعلامات
 * ولا في أي تخزين، لأن القاعدة نفسها لا تحتفظ إلا بالهاش.
 */
export function useCreateStudentPortalLink(teacherId: string) {
  const invalidate = useInvalidateStudentPortal()
  return useMutation({
    mutationFn: (student: StudentRow) => createStudentPortalLink(teacherId, student),
    onSuccess: invalidate,
  })
}

export function useRevokeStudentPortalToken(teacherId: string) {
  const invalidate = useInvalidateStudentPortal()
  return useMutation({
    mutationFn: (tokenId: string) => revokeStudentPortalToken(teacherId, tokenId),
    onSuccess: invalidate,
  })
}

/**
 * قراءة بوابة الطالب العامة بالرمز: بلا إعادة محاولة (رمز خاطئ/منتهٍ
 * لن يتصلح بالمحاولة)، والرمز الخام لا يدخل مفتاح الكاش ولا يُحفظ.
 */
export function useStudentPortalOverview(rawToken: string | null) {
  return useQuery({
    queryKey: [STUDENT_PORTAL, 'overview'],
    enabled: Boolean(rawToken),
    queryFn: () => fetchStudentPortalOverview(rawToken!),
    retry: false,
    staleTime: 60_000,
  })
}
