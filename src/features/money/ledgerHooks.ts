import { useMutation, useQuery } from '@tanstack/react-query'
import type { PaymentMethod } from '../../types/database'
import { INVALIDATION_SETS, useInvalidatePrefixes } from '../../lib/invalidate'
import type { LedgerLine } from './ledgerCalc'
import {
  createPurchase,
  createSale,
  createSupplier,
  deletePurchase,
  deleteSale,
  deleteSupplier,
  fetchMonthlyCentreFinance,
  fetchPurchaseDetail,
  fetchPurchases,
  fetchSaleLines,
  fetchSales,
  fetchSupplierPayables,
  fetchSuppliers,
  recordPurchasePayment,
  updateSaleCollected,
  updateSupplier,
} from './ledgerApi'

// مفاتيح دفتر السنتر تحت مظلة 'money' حتى تبطلها مجموعات الإبطال المالية
// القائمة (INVALIDATION_SETS.money) مع باقي أقسام شاشة الفلوس.
export const LEDGER = 'money'

export function useSuppliers(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [LEDGER, 'suppliers', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchSuppliers(teacherId!),
  })
}

export function usePurchases(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [LEDGER, 'purchases', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchPurchases(teacherId!),
  })
}

export function usePurchaseDetail(purchaseId: string | undefined) {
  return useQuery({
    queryKey: [LEDGER, 'purchase-detail', purchaseId],
    enabled: Boolean(purchaseId),
    queryFn: () => fetchPurchaseDetail(purchaseId!),
  })
}

export function useSales(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [LEDGER, 'sales', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchSales(teacherId!),
  })
}

export function useSaleLines(saleId: string | undefined) {
  return useQuery({
    queryKey: [LEDGER, 'sale-lines', saleId],
    enabled: Boolean(saleId),
    queryFn: () => fetchSaleLines(saleId!),
  })
}

export function useSupplierPayables(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [LEDGER, 'payables', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchSupplierPayables(teacherId!),
  })
}

export function useMonthlyCentreFinance(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [LEDGER, 'centre-finance', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchMonthlyCentreFinance(teacherId!),
  })
}

function useLedgerMutation<TArgs>(fn: (args: TArgs) => Promise<void>) {
  const invalidate = useInvalidatePrefixes(INVALIDATION_SETS.money)
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidate(),
  })
}

export function useCreateSupplier(teacherId: string) {
  return useLedgerMutation((input: { name: string; phone: string | null; note: string | null }) =>
    createSupplier(teacherId, input),
  )
}

export function useUpdateSupplier() {
  return useLedgerMutation(
    (args: { id: string; input: { name: string; phone: string | null; note: string | null } }) =>
      updateSupplier(args.id, args.input),
  )
}

export function useDeleteSupplier() {
  return useLedgerMutation((id: string) => deleteSupplier(id))
}

export function useCreatePurchase(teacherId: string) {
  return useLedgerMutation(
    (input: {
      supplierId: string | null
      purchaseDate: string
      note: string | null
      lines: LedgerLine[]
    }) => createPurchase(teacherId, input),
  )
}

export function useRecordPurchasePayment(teacherId: string) {
  return useLedgerMutation(
    (input: {
      purchaseId: string
      amount: number
      method: PaymentMethod
      paidOn: string
      note: string | null
    }) => recordPurchasePayment(teacherId, input),
  )
}

export function useDeletePurchase() {
  return useLedgerMutation((id: string) => deletePurchase(id))
}

export function useCreateSale(teacherId: string) {
  return useLedgerMutation(
    (input: {
      studentId: string | null
      buyerName: string | null
      saleDate: string
      amountPaid: number
      note: string | null
      lines: LedgerLine[]
    }) => createSale(teacherId, input),
  )
}

export function useUpdateSaleCollected() {
  return useLedgerMutation((args: { saleId: string; amountPaid: number }) =>
    updateSaleCollected(args.saleId, args.amountPaid),
  )
}

export function useDeleteSale() {
  return useLedgerMutation((id: string) => deleteSale(id))
}
