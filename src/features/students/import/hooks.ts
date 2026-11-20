import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HOME } from '../../home/hooks'
import { SG } from '../hooks'
import { importStudentsFromFile, type FileImportItem } from './api'

/** استيراد ملف الطلاب — بعده يُبطل كاش الطلاب/المجموعات والرئيسية (نفس عقد الاستيراد النصي) */
export function useImportStudentsFile(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ items, groupId }: { items: FileImportItem[]; groupId: string | null }) =>
      importStudentsFromFile(teacherId, items, groupId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [SG] })
      void qc.invalidateQueries({ queryKey: [HOME] })
    },
  })
}
