import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchEnrolmentLink,
  generateEnrolmentLink,
  setEnrolmentEnabled,
} from './api'

const ENROL = 'enrol'

/** حالة رابط حجز السنتر (جهة المدرس) */
export function useEnrolmentLink(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [ENROL, 'link', teacherId],
    enabled: Boolean(teacherId && enabled),
    queryFn: () => fetchEnrolmentLink(teacherId!),
  })
}

/** توليد/تجديد رابط الحجز — يعيد الرابط الكامل بالرمز الخام لعرضه مرة واحدة */
export function useGenerateEnrolmentLink(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => generateEnrolmentLink(teacherId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ENROL, 'link', teacherId] })
    },
  })
}

/** تفعيل/تعطيل صفحة الحجز */
export function useSetEnrolmentEnabled(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => setEnrolmentEnabled(teacherId, enabled),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ENROL, 'link', teacherId] })
    },
  })
}
