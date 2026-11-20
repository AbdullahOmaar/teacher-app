import { useQuery } from '@tanstack/react-query'
import {
  fetchActivityActors,
  fetchActivityLog,
  type ActivityFilters,
} from './api'

/** كل مفاتيح وحدة سجل النشاط تبدأ بـ 'activity' */
export const ACTIVITY = 'activity'

export function useActivityLog(
  teacherId: string | undefined,
  filters: ActivityFilters,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [ACTIVITY, 'log', teacherId, filters],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchActivityLog(teacherId!, filters),
  })
}

export function useActivityActors(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [ACTIVITY, 'actors', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchActivityActors(teacherId!),
  })
}
