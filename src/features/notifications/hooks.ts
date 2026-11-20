import { useQuery } from '@tanstack/react-query'
import { HOME } from '../home/hooks'
import { todayStr } from '../home/api'
import { fetchAlerts } from './api'

/**
 * التنبيهات المشتقة — نفس مفتاح كاش بطاقة تنبيهات الرئيسية بالحرف
 * ([HOME, 'alerts', …]) ونفس دالة الاشتقاق (fetchAlerts)، فالشاشتان
 * تقرآن نتيجة واحدة: العدد وأول تنبيه لا يمكن أن يختلفا بينهما،
 * وأي إبطال لكاش الرئيسية (حضور/درجات/دفعات…) يحدّث الإشعارات معها.
 */
export function useAlerts(teacherId: string | undefined, isOwner: boolean) {
  const today = todayStr()
  return useQuery({
    queryKey: [HOME, 'alerts', teacherId, today, isOwner],
    enabled: Boolean(teacherId),
    queryFn: () => fetchAlerts(teacherId!, today, isOwner),
  })
}
