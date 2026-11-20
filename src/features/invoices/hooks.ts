import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AttendanceStatus, PaymentMethod, PaymentRow } from '../../types/database'
import { HOME } from '../home/hooks'
import { SG } from '../students/hooks'
import { ATT } from '../attendance/hooks'
import {
  applyAttendanceAdjustment,
  createPayment,
  fetchInvoice,
  fetchInvoiceLines,
  fetchInvoiceMonthAttendance,
  fetchInvoicePayments,
  fetchInvoices,
  fetchStudentInvoices,
  fetchStudentPayments,
  fetchTeacherDisplayName,
  fetchWhatsappTemplate,
  generateInvoices,
  voidPayment,
  type InvoiceListItem,
  type InvoiceMonthSession,
  type IssueOptions,
} from './api'

/** كل مفاتيح وحدة الفواتير تبدأ بـ 'invoices' */
export const INV = 'invoices'

export function useInvoices(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [INV, 'list', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchInvoices(teacherId!),
  })
}

export function useInvoice(
  teacherId: string | undefined,
  invoiceId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [INV, 'detail', teacherId, invoiceId],
    enabled: Boolean(teacherId && invoiceId) && enabled,
    queryFn: () => fetchInvoice(teacherId!, invoiceId!),
  })
}

export function useInvoiceLines(
  teacherId: string | undefined,
  invoiceId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [INV, 'lines', teacherId, invoiceId],
    enabled: Boolean(teacherId && invoiceId) && enabled,
    queryFn: () => fetchInvoiceLines(teacherId!, invoiceId!),
  })
}

export function useInvoicePayments(
  teacherId: string | undefined,
  invoiceId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [INV, 'payments', teacherId, invoiceId],
    enabled: Boolean(teacherId && invoiceId) && enabled,
    queryFn: () => fetchInvoicePayments(teacherId!, invoiceId!),
  })
}

export function useStudentInvoices(
  teacherId: string | undefined,
  studentId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [INV, 'student-invoices', teacherId, studentId],
    enabled: Boolean(teacherId && studentId) && enabled,
    queryFn: () => fetchStudentInvoices(teacherId!, studentId!),
  })
}

export function useStudentPayments(
  teacherId: string | undefined,
  studentId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [INV, 'student-payments', teacherId, studentId],
    enabled: Boolean(teacherId && studentId) && enabled,
    queryFn: () => fetchStudentPayments(teacherId!, studentId!),
  })
}

export function useInvoiceMonthAttendance(
  teacherId: string | undefined,
  invoice: InvoiceListItem | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [INV, 'month-attendance', teacherId, invoice?.invoice_id],
    enabled: Boolean(teacherId && invoice) && enabled,
    queryFn: () => fetchInvoiceMonthAttendance(teacherId!, invoice!),
  })
}

export function useTeacherDisplayName(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [INV, 'teacher-name', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchTeacherDisplayName(teacherId!),
  })
}

export function useWhatsappTemplate(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [INV, 'wa-template', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchWhatsappTemplate(teacherId!),
  })
}

/**
 * أي عملية مالية تبطل كاش الفواتير والرئيسية والطلاب معاً:
 * الرئيسية تحسب محصّل الشهر وعدد الفواتير غير المسددة وهدف التحصيل منها،
 * والطلاب يعرضون شارات الأرصدة من student_balances.
 */
function useInvalidateInvoices() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: [INV] })
    void qc.invalidateQueries({ queryKey: [HOME] })
    void qc.invalidateQueries({ queryKey: [SG] })
  }
}

export function useIssueInvoices(teacherId: string) {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: (opts: IssueOptions) => generateInvoices(teacherId, opts),
    onSuccess: invalidate,
  })
}

export function useCreatePayment(teacherId: string) {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: ({
      invoiceId,
      input,
    }: {
      invoiceId: string
      input: { amount: number; method: PaymentMethod; paid_on: string }
    }) => createPayment(teacherId, invoiceId, input),
    onSuccess: invalidate,
  })
}

export function useVoidPayment(teacherId: string) {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: (payment: PaymentRow) => voidPayment(teacherId, payment),
    onSuccess: invalidate,
  })
}

export function useApplyAdjustment(teacherId: string) {
  const qc = useQueryClient()
  const invalidateInvoices = useInvalidateInvoices()
  return useMutation({
    mutationFn: ({
      invoice,
      session,
      newStatus,
      reason,
    }: {
      invoice: InvoiceListItem
      session: InvoiceMonthSession
      newStatus: AttendanceStatus
      reason: string
    }) => applyAttendanceAdjustment(teacherId, invoice, session, newStatus, reason),
    onSuccess: () => {
      invalidateInvoices()
      // التسوية تعدّل حالة حضور فعلية — كاش الحضور يتأثر أيضاً
      void qc.invalidateQueries({ queryKey: [ATT] })
    },
  })
}
