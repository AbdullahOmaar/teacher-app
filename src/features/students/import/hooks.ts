import { useMutation, useQueryClient } from '@tanstack/react-query'
import { INVALIDATION_SETS, invalidatePrefixes } from '../../../lib/invalidate'
import { importStudentsFromFile, type FileImportItem } from './api'

/** استيراد ملف الطلاب — بعده يُبطل كاش الطلاب/المجموعات والرئيسية (نفس عقد الاستيراد النصي)؛
 * الاستيراد ينشئ طلاباً وتسجيلات فتُستخدم مجموعة الطلاب الكاملة
 * (INVALIDATION_SETS.students) لا [SG, HOME] وحدهما. */
export function useImportStudentsFile(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ items, groupId }: { items: FileImportItem[]; groupId: string | null }) =>
      importStudentsFromFile(teacherId, items, groupId),
    onSuccess: () => {
      void invalidatePrefixes(qc, INVALIDATION_SETS.students)
    },
  })
}
