import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AssessmentInput, AssessmentRow, QuestionInput } from '../../types/database'
import { HOME } from '../home/hooks'
import { SG } from '../students/hooks'
import { ANALYTICS } from '../analytics/hooks'
import { invalidatePrefixes } from '../../lib/invalidate'
import {
  addQuestion,
  createAssessment,
  deleteAssessment,
  deleteQuestion,
  fetchAssessment,
  fetchAssessmentScores,
  fetchAssessments,
  fetchQuestions,
  fetchStudentScores,
  saveScores,
  syncAssessmentMax,
  updateAssessment,
  type ScoreEntry,
} from './api'

/** كل مفاتيح وحدة الدرجات تبدأ بـ 'grades' */
export const GRADES = 'grades'

export function useAssessments(teacherId: string | undefined) {
  return useQuery({
    queryKey: [GRADES, 'list', teacherId],
    enabled: Boolean(teacherId),
    queryFn: () => fetchAssessments(teacherId!),
  })
}

export function useAssessment(teacherId: string | undefined, assessmentId: string | undefined) {
  return useQuery({
    queryKey: [GRADES, 'detail', teacherId, assessmentId],
    enabled: Boolean(teacherId && assessmentId),
    queryFn: () => fetchAssessment(teacherId!, assessmentId!),
  })
}

export function useAssessmentScores(
  teacherId: string | undefined,
  assessmentId: string | undefined,
) {
  return useQuery({
    queryKey: [GRADES, 'scores', teacherId, assessmentId],
    enabled: Boolean(teacherId && assessmentId),
    queryFn: () => fetchAssessmentScores(teacherId!, assessmentId!),
  })
}

export function useQuestions(teacherId: string | undefined, assessmentId: string | undefined) {
  return useQuery({
    queryKey: [GRADES, 'questions', teacherId, assessmentId],
    enabled: Boolean(teacherId && assessmentId),
    queryFn: () => fetchQuestions(teacherId!, assessmentId!),
  })
}

export function useStudentScores(teacherId: string | undefined, studentId: string | undefined) {
  return useQuery({
    queryKey: [GRADES, 'student-scores', teacherId, studentId],
    enabled: Boolean(teacherId && studentId),
    queryFn: () => fetchStudentScores(teacherId!, studentId!),
  })
}

/**
 * أي حفظ في الدرجات يبطل كاش الدرجات والرئيسية وملف الطالب معاً:
 * الرئيسية تحسب تنبيهات grade من scores/assessments (عقدها القائم)،
 * وتبويب درجات الطالب في ملفه يقرأ من scores فعلياً.
 */
function useInvalidateGrades() {
  const qc = useQueryClient()
  // الدرجات تغذي التحليلات أيضاً (متوسطات/توزيعات) — PAT-1
  return () => invalidatePrefixes(qc, [GRADES, HOME, SG, ANALYTICS])
}

export function useCreateAssessment(teacherId: string) {
  const invalidate = useInvalidateGrades()
  return useMutation({
    mutationFn: (input: AssessmentInput) => createAssessment(teacherId, input),
    onSuccess: invalidate,
  })
}

export function useUpdateAssessment(teacherId: string) {
  const invalidate = useInvalidateGrades()
  return useMutation({
    mutationFn: ({ assessmentId, input }: { assessmentId: string; input: AssessmentInput }) =>
      updateAssessment(teacherId, assessmentId, input),
    onSuccess: invalidate,
  })
}

export function useDeleteAssessment(teacherId: string) {
  const invalidate = useInvalidateGrades()
  return useMutation({
    mutationFn: (assessmentId: string) => deleteAssessment(teacherId, assessmentId),
    onSuccess: invalidate,
  })
}

export function useSaveScores(teacherId: string) {
  const invalidate = useInvalidateGrades()
  return useMutation({
    mutationFn: ({
      assessmentId,
      entries,
    }: {
      assessmentId: string
      entries: ScoreEntry[]
    }) => saveScores(teacherId, assessmentId, entries),
    onSuccess: invalidate,
  })
}

export function useAddQuestion(teacherId: string) {
  const invalidate = useInvalidateGrades()
  return useMutation({
    mutationFn: ({
      assessmentId,
      input,
      position,
    }: {
      assessmentId: string
      input: QuestionInput
      position: number
    }) => addQuestion(teacherId, assessmentId, input, position),
    onSuccess: invalidate,
  })
}

export function useDeleteQuestion(teacherId: string) {
  const invalidate = useInvalidateGrades()
  return useMutation({
    mutationFn: (questionId: string) => deleteQuestion(teacherId, questionId),
    onSuccess: invalidate,
  })
}

export function useSyncAssessmentMax(teacherId: string) {
  const invalidate = useInvalidateGrades()
  return useMutation({
    mutationFn: ({
      assessment,
      questionsTotal,
    }: {
      assessment: AssessmentRow
      questionsTotal: number
    }) => syncAssessmentMax(teacherId, assessment, questionsTotal),
    onSuccess: invalidate,
  })
}
