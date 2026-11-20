import { useQuery } from '@tanstack/react-query'
import { fetchAnalytics, type AnalyticsRange } from './api'

/** كل مفاتيح وحدة التحليلات تبدأ بـ 'analytics' */
export const ANALYTICS = 'analytics'

export function useAnalytics(
  teacherId: string | undefined,
  range: AnalyticsRange,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [ANALYTICS, teacherId, range],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchAnalytics(teacherId!, range),
  })
}
