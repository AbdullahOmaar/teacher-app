import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DailyClosingInput } from '../../types/database'
import { MONEY } from './hooks'
import {
  fetchDailyClosing,
  fetchDailyClosings,
  fetchDaySummary,
  upsertDailyClosing,
} from './cashboxApi'

/** مفاتيح الإغلاق اليومي تحت مفتاح وحدة الفلوس: [MONEY, 'cashbox', ...] */
export const CASHBOX = 'cashbox'

export function useDaySummary(teacherId: string | undefined, date: string, enabled: boolean) {
  return useQuery({
    queryKey: [MONEY, CASHBOX, 'day', teacherId, date],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchDaySummary(teacherId!, date),
  })
}

export function useDailyClosing(teacherId: string | undefined, date: string, enabled: boolean) {
  return useQuery({
    queryKey: [MONEY, CASHBOX, 'closing', teacherId, date],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchDailyClosing(teacherId!, date),
  })
}

export function useDailyClosings(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [MONEY, CASHBOX, 'list', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchDailyClosings(teacherId!),
  })
}

/**
 * حفظ الإغلاق لا يغيّر أي رقم مالي قائم (لا دفعات ولا مصروفات)، فيكفي
 * إبطال كاش الإغلاق اليومي وحده — ملخصات الفلوس والرئيسية لا تتأثر.
 * إبطال دقيق بالمفتاح الفرعي [money, cashbox] مقصود (3A-377): إبطال
 * بادئة 'money' كلها كان سيعيد جلب الربح والمصروفات والقوالب بلا داعٍ.
 */
export function useUpsertDailyClosing(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ closedBy, input }: { closedBy: string; input: DailyClosingInput }) =>
      upsertDailyClosing(teacherId, closedBy, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [MONEY, CASHBOX] })
    },
  })
}
