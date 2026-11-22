import { useMutation, useQuery } from '@tanstack/react-query'
import type { OnlineExamInput } from '../../types/database'
import { INVALIDATION_SETS, useInvalidatePrefixes } from '../../lib/invalidate'
import {
  createExamLink,
  createOnlineExam,
  deleteOnlineExam,
  fetchExamAttempts,
  fetchExamInfo,
  fetchExamTokens,
  fetchOnlineExam,
  revokeExamToken,
  startExamAttempt,
  submitExamAttempt,
  updateOnlineExam,
  type ExamStartResult,
} from './api'

/** كل مفاتيح وحدة الامتحانات الإلكترونية تبدأ بـ 'exams' */
export const EXAMS = 'exams'

export function useOnlineExam(teacherId: string | undefined, assessmentId: string | undefined) {
  return useQuery({
    queryKey: [EXAMS, 'by-assessment', teacherId, assessmentId],
    enabled: Boolean(teacherId && assessmentId),
    queryFn: () => fetchOnlineExam(teacherId!, assessmentId!),
  })
}

export function useExamTokens(teacherId: string | undefined, examId: string | undefined) {
  return useQuery({
    queryKey: [EXAMS, 'tokens', teacherId, examId],
    enabled: Boolean(teacherId && examId),
    queryFn: () => fetchExamTokens(teacherId!, examId!),
  })
}

export function useExamAttempts(teacherId: string | undefined, examId: string | undefined) {
  return useQuery({
    queryKey: [EXAMS, 'attempts', teacherId, examId],
    enabled: Boolean(teacherId && examId),
    queryFn: () => fetchExamAttempts(teacherId!, examId!),
  })
}

/**
 * أي تغيير في الامتحان/نتائجه يبطل كاش الامتحانات والدرجات معاً:
 * الترحيل التلقائي يكتب في scores فتبويب درجات الطالب وقوائم الدرجات
 * لازم يعيدوا القراءة بعد أي تسليم/تعديل يمسّهم — وتنبيهات الرئيسية
 * تقرأ scores أيضاً (fetchAlerts) فتدخل 'home' في المجموعة (3A-377).
 * المجموعة الكاملة في INVALIDATION_SETS.exams (lib/invalidate.ts).
 */
function useInvalidateExams() {
  return useInvalidatePrefixes(INVALIDATION_SETS.exams)
}

export function useCreateOnlineExam(teacherId: string) {
  const invalidate = useInvalidateExams()
  return useMutation({
    mutationFn: ({ assessmentId, groupId }: { assessmentId: string; groupId: string }) =>
      createOnlineExam(teacherId, assessmentId, groupId),
    onSuccess: invalidate,
  })
}

export function useUpdateOnlineExam(teacherId: string) {
  const invalidate = useInvalidateExams()
  return useMutation({
    mutationFn: ({ examId, input }: { examId: string; input: OnlineExamInput }) =>
      updateOnlineExam(teacherId, examId, input),
    onSuccess: invalidate,
  })
}

export function useDeleteOnlineExam(teacherId: string) {
  const invalidate = useInvalidateExams()
  return useMutation({
    mutationFn: (examId: string) => deleteOnlineExam(teacherId, examId),
    onSuccess: invalidate,
  })
}

/**
 * توليد/إعادة توليد رابط الامتحان. الرابط بالرمز الخام يعيش في حالة
 * المكوّن المستدعي فقط — لا يُحفظ في كاش ولا تخزين (القاعدة هاش فقط).
 */
export function useCreateExamLink(teacherId: string) {
  const invalidate = useInvalidateExams()
  return useMutation({
    mutationFn: ({ examId, endsAt }: { examId: string; endsAt: string | null }) =>
      createExamLink(teacherId, examId, endsAt),
    onSuccess: invalidate,
  })
}

export function useRevokeExamToken(teacherId: string) {
  const invalidate = useInvalidateExams()
  return useMutation({
    mutationFn: (tokenId: string) => revokeExamToken(teacherId, tokenId),
    onSuccess: invalidate,
  })
}

// ---------------------------------------------------------------------------
// جهة الطالب العامة — بلا إعادة محاولة تلقائية (خطأ التوكن/الكود لن
// يتصلح بالتكرار)، والرمز الخام لا يدخل مفاتيح الكاش أبداً.
// ---------------------------------------------------------------------------

export function useExamInfo(rawToken: string | null) {
  return useQuery({
    queryKey: [EXAMS, 'public-info'],
    enabled: Boolean(rawToken),
    queryFn: () => fetchExamInfo(rawToken!),
    retry: false,
    staleTime: 30_000,
  })
}

export function useStartExamAttempt(rawToken: string | null) {
  return useMutation({
    mutationFn: (studentCode: string) => startExamAttempt(rawToken!, studentCode),
  })
}

export function useSubmitExamAttempt(rawToken: string | null) {
  return useMutation({
    mutationFn: ({
      attemptId,
      answers,
    }: {
      attemptId: string
      answers: Record<string, string>
    }) => submitExamAttempt(rawToken!, attemptId, answers),
  })
}

export type { ExamStartResult }
