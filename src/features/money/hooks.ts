import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ExpenseInput,
  RecurringExpenseInput,
  RecurringExpenseRow,
} from '../../types/database'
import { HOME } from '../home/hooks'
import {
  applyRecurringExpenses,
  createExpense,
  createRecurringExpense,
  deleteExpense,
  deleteRecurringExpense,
  fetchCenterSharePercent,
  fetchMonthExpenses,
  fetchMonthlyProfit,
  fetchRecurringExpenses,
  updateExpense,
  updateRecurringExpense,
} from './api'

/** كل مفاتيح وحدة الفلوس تبدأ بـ 'money' */
export const MONEY = 'money'

export function useMonthlyProfit(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [MONEY, 'profit', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchMonthlyProfit(teacherId!),
  })
}

export function useCenterSharePercent(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [MONEY, 'center-share', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchCenterSharePercent(teacherId!),
  })
}

export function useMonthExpenses(
  teacherId: string | undefined,
  monthStart: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [MONEY, 'expenses', teacherId, monthStart],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchMonthExpenses(teacherId!, monthStart),
  })
}

export function useRecurringExpenses(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [MONEY, 'recurring', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchRecurringExpenses(teacherId!),
  })
}

/**
 * أي تغيير مالي هنا يبطل كاش الفلوس والرئيسية معاً: الرئيسية تعرض محصّل
 * الشهر وهدف التحصيل، وأي مصروف جديد يغيّر ملخص الفترة وصافي الربح الذي
 * تفتحه بطاقة «محصّل الشهر» في الرئيسية (عقد الإبطال المطلوب لهذه الخطوة).
 */
function useInvalidateMoney() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: [MONEY] })
    void qc.invalidateQueries({ queryKey: [HOME] })
  }
}

export function useCreateExpense(teacherId: string) {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (input: ExpenseInput) => createExpense(teacherId, input),
    onSuccess: invalidate,
  })
}

export function useUpdateExpense(teacherId: string) {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: ({ expenseId, input }: { expenseId: string; input: ExpenseInput }) =>
      updateExpense(teacherId, expenseId, input),
    onSuccess: invalidate,
  })
}

export function useDeleteExpense(teacherId: string) {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (expenseId: string) => deleteExpense(teacherId, expenseId),
    onSuccess: invalidate,
  })
}

export function useCreateRecurring(teacherId: string) {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (input: RecurringExpenseInput) => createRecurringExpense(teacherId, input),
    onSuccess: invalidate,
  })
}

export function useUpdateRecurring(teacherId: string) {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: ({ recurringId, input }: { recurringId: string; input: RecurringExpenseInput }) =>
      updateRecurringExpense(teacherId, recurringId, input),
    onSuccess: invalidate,
  })
}

export function useDeleteRecurring(teacherId: string) {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (recurringId: string) => deleteRecurringExpense(teacherId, recurringId),
    onSuccess: invalidate,
  })
}

export function useApplyRecurring(teacherId: string) {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: ({
      monthStart,
      templates,
    }: {
      monthStart: string
      templates: RecurringExpenseRow[]
    }) => applyRecurringExpenses(teacherId, monthStart, templates),
    onSuccess: invalidate,
  })
}
