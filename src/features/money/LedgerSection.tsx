import { useMemo, useState } from 'react'
import { ChevronDown, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { t, type I18nKey } from '../../i18n'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState } from '../../components/ui/states'
import { useToast } from '../../components/ui/toast'
import { formatMoney } from '../../lib/format'
import { errText } from '../../lib/supabaseErrors'
import type { SupplierRow } from '../../types/database'
import { monthStartStr, todayStr } from '../home/api'
import { periodLabel } from '../invoices/api'
import { formatDateLabel } from '../schedule/api'
import { AGING_BUCKETS, summarizePayables, type BalanceStatus } from './ledgerCalc'
import type { PurchaseListItem, SaleListItem } from './ledgerApi'
import {
  useDeletePurchase,
  useDeleteSale,
  useDeleteSupplier,
  useMonthlyCentreFinance,
  usePurchaseDetail,
  usePurchases,
  useSaleLines,
  useSales,
  useSupplierPayables,
  useSuppliers,
} from './ledgerHooks'
import {
  PurchaseFormSheet,
  PurchasePaymentSheet,
  SaleCollectSheet,
  SaleFormSheet,
  SupplierFormSheet,
} from './ledgerSheets'

// ---------------------------------------------------------------------------
// دفتر السنتر (migration ‏0051 — مهمة فيز 2 رقم 10): قسم داخل شاشة الفلوس
// تحت الإغلاق اليومي، بنفس منطق اختيار CashboxSection قسماً لا شاشة
// مستقلة (التنقل السفلي ثابت). ثلاث تبويبات: مشتريات (مع ملخص مستحقات
// الموردين وأعمارها)، مبيعات غير دراسية، وموردون. المالية للمالك فقط —
// القسم لا يُرسم أصلاً لغير المالك (وRLS تمنع البيانات نفسها).
//
// ⚠️ القسم يعمل بكامل وظائفه فور تطبيق 0051 عند بوابة تجميد فيز 2؛ قبلها
// تفشل استعلاماته بخطأ قاعدة بيانات فيظهر بحالة خطأ صريحة لا انهيار.
// ---------------------------------------------------------------------------

type Tab = 'purchases' | 'sales' | 'suppliers'

const STATUS_KEY: Record<BalanceStatus, I18nKey> = {
  paid: 'money.ledgerStatusPaid',
  partial: 'money.ledgerStatusPartial',
  unpaid: 'money.ledgerStatusUnpaid',
  overpaid: 'money.ledgerStatusOverpaid',
}

const STATUS_CLASS: Record<BalanceStatus, string> = {
  paid: 'bg-ok-soft text-ok-text',
  partial: 'bg-warn/15 text-warn-text',
  unpaid: 'bg-bad-soft text-bad-text',
  overpaid: 'bg-warn/15 text-warn-text',
}

function StatusChip({ status }: { status: BalanceStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[status]}`}
    >
      {t(STATUS_KEY[status])}
    </span>
  )
}

const AGING_KEY: Record<(typeof AGING_BUCKETS)[number], I18nKey> = {
  d0_30: 'money.ledgerAging_d0_30',
  d31_60: 'money.ledgerAging_d31_60',
  d61_90: 'money.ledgerAging_d61_90',
  over90: 'money.ledgerAging_over90',
}

/** زر حذف بنقرتين: الأولى تطلب التأكيد في نفس الزر، الثانية تنفّذ */
function ConfirmDeleteButton({
  onDelete,
  label,
}: {
  onDelete: () => void
  label: string
}) {
  const [armed, setArmed] = useState(false)
  return (
    <Button
      type="button"
      variant={armed ? 'danger' : 'ghost'}
      size="sm"
      onClick={() => {
        if (armed) onDelete()
        else {
          setArmed(true)
          setTimeout(() => setArmed(false), 3000)
        }
      }}
    >
      <Trash2 size={15} />
      {armed ? t('money.ledgerDeleteConfirm') : label}
    </Button>
  )
}

function PurchaseRow({
  purchase,
  onPay,
  onSaved,
}: {
  purchase: PurchaseListItem
  onPay: (p: PurchaseListItem) => void
  onSaved: (msg: string) => void
}) {
  const [open, setOpen] = useState(false)
  const detailQ = usePurchaseDetail(open ? purchase.id : undefined)
  const del = useDeletePurchase()
  const toast = useToast()
  return (
    <Card className="mb-2">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-start"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">
            {purchase.supplier_name ?? t('money.ledgerNoSupplier')}
          </span>
          <span className="block text-xs text-muted">{formatDateLabel(purchase.purchase_date)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-end">
            <span className="block font-bold">{formatMoney(purchase.balance.total)}</span>
            <span className="block text-xs text-muted">
              {t('money.ledgerRemaining')}: {formatMoney(purchase.balance.remaining)}
            </span>
          </span>
          <StatusChip status={purchase.balance.status} />
          <ChevronDown size={16} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </span>
      </button>
      {open && (
        <div className="mt-3 border-t border-line pt-3">
          {detailQ.isPending ? (
            <LoadingState label={t('money.ledgerLoading')} />
          ) : detailQ.isError ? (
            <ErrorState
              message={t('money.ledgerDetailError')}
              onRetry={() => void detailQ.refetch()}
            />
          ) : detailQ.data ? (
            <>
              <ul className="mb-2 text-sm">
                {detailQ.data.lines.map((l) => (
                  <li key={l.id} className="flex justify-between gap-2 py-0.5">
                    <span className="min-w-0 truncate">
                      {l.description} × {Number(l.quantity)}
                    </span>
                    <span className="shrink-0">{formatMoney(Number(l.quantity) * Number(l.unit_price))}</span>
                  </li>
                ))}
              </ul>
              {detailQ.data.payments.length > 0 && (
                <>
                  <p className="mb-1 text-xs font-semibold text-muted">{t('money.ledgerPaymentsHistory')}</p>
                  <ul className="mb-2 text-sm">
                    {detailQ.data.payments.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2 py-0.5">
                        <span>{formatDateLabel(p.paid_on)}</span>
                        <span>{formatMoney(Number(p.amount))}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {purchase.note && <p className="mb-2 text-xs text-muted">{purchase.note}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="soft" size="sm" onClick={() => onPay(purchase)}>
                  <Wallet size={15} />
                  {t('money.ledgerRecordPayment')}
                </Button>
                <ConfirmDeleteButton
                  label={t('money.delete')}
                  onDelete={() =>
                    del.mutate(purchase.id, {
                      onSuccess: () => onSaved(t('money.ledgerDeleted')),
                      onError: () => toast(t('money.ledgerDeleteError')),
                    })
                  }
                />
              </div>
            </>
          ) : null}
        </div>
      )}
    </Card>
  )
}

function SaleRow({
  sale,
  onCollect,
  onSaved,
}: {
  sale: SaleListItem
  onCollect: (s: SaleListItem) => void
  onSaved: (msg: string) => void
}) {
  const [open, setOpen] = useState(false)
  const linesQ = useSaleLines(open ? sale.id : undefined)
  const del = useDeleteSale()
  const toast = useToast()
  const buyer = sale.student_name ?? sale.buyer_name ?? t('money.ledgerBuyerFree')
  return (
    <Card className="mb-2">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-start"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">{buyer}</span>
          <span className="block text-xs text-muted">{formatDateLabel(sale.sale_date)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-end">
            <span className="block font-bold">{formatMoney(sale.balance.total)}</span>
            <span className="block text-xs text-muted">
              {t('money.ledgerRemaining')}: {formatMoney(sale.balance.remaining)}
            </span>
          </span>
          <StatusChip status={sale.balance.status} />
          <ChevronDown size={16} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </span>
      </button>
      {open && (
        <div className="mt-3 border-t border-line pt-3">
          {linesQ.isPending ? (
            <LoadingState label={t('money.ledgerLoading')} />
          ) : linesQ.isError ? (
            <ErrorState message={t('money.ledgerDetailError')} onRetry={() => void linesQ.refetch()} />
          ) : (
            <ul className="mb-2 text-sm">
              {(linesQ.data ?? []).map((l) => (
                <li key={l.id} className="flex justify-between gap-2 py-0.5">
                  <span className="min-w-0 truncate">
                    {l.description} × {Number(l.quantity)}
                  </span>
                  <span className="shrink-0">{formatMoney(Number(l.quantity) * Number(l.unit_price))}</span>
                </li>
              ))}
            </ul>
          )}
          {sale.note && <p className="mb-2 text-xs text-muted">{sale.note}</p>}
          <div className="flex gap-2">
            {sale.balance.remaining > 0 && (
              <Button type="button" variant="soft" size="sm" onClick={() => onCollect(sale)}>
                <Wallet size={15} />
                {t('money.ledgerCollect')}
              </Button>
            )}
            <ConfirmDeleteButton
              label={t('money.delete')}
              onDelete={() =>
                del.mutate(sale.id, {
                  onSuccess: () => onSaved(t('money.ledgerDeleted')),
                  onError: () => toast(t('money.ledgerDeleteError')),
                })
              }
            />
          </div>
        </div>
      )}
    </Card>
  )
}

export function LedgerSection({ teacherId }: { teacherId: string }) {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('purchases')
  const [sheet, setSheet] = useState<
    | { kind: 'purchase' }
    | { kind: 'sale' }
    | { kind: 'supplier'; supplier?: SupplierRow }
    | { kind: 'payment'; purchase: PurchaseListItem }
    | { kind: 'collect'; sale: SaleListItem }
    | null
  >(null)

  const purchasesQ = usePurchases(teacherId, true)
  const salesQ = useSales(teacherId, true)
  const suppliersQ = useSuppliers(teacherId, true)
  const payablesQ = useSupplierPayables(teacherId, true)
  const financeQ = useMonthlyCentreFinance(teacherId, true)

  const saved = (msg: string) => {
    setSheet(null)
    toast(msg)
  }

  const aging = useMemo(
    () =>
      summarizePayables(
        (purchasesQ.data ?? []).map((p) => ({
          purchase_date: p.purchase_date,
          remaining: p.balance.remaining,
        })),
        todayStr(),
      ),
    [purchasesQ.data],
  )
  const totalPayables = useMemo(
    () => (payablesQ.data ?? []).reduce((s, r) => s + Math.max(Number(r.remaining) || 0, 0), 0),
    [payablesQ.data],
  )
  const currentMonth = monthStartStr(todayStr())
  const financeNow = (financeQ.data ?? []).find((r) => r.month === currentMonth)

  const loading = purchasesQ.isPending || salesQ.isPending || suppliersQ.isPending
  const failed = purchasesQ.isError || salesQ.isError || suppliersQ.isError

  return (
    <section className="mt-6">
      <h2 className="mb-1 text-lg font-bold">{t('money.ledgerTitle')}</h2>
      <p className="mb-3 text-sm text-muted">{t('money.ledgerSubtitle')}</p>

      {financeNow && (
        <Card className="mb-3">
          <p className="mb-2 text-sm font-semibold">
            {t('money.ledgerFinanceTitle', { month: periodLabel(currentMonth) })}
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted">{t('money.ledgerTuition')}</span>
            <span className="text-end font-semibold">{formatMoney(financeNow.tuition_collected)}</span>
            <span className="text-muted">{t('money.ledgerSalesCollected')}</span>
            <span className="text-end font-semibold">{formatMoney(financeNow.sales_collected)}</span>
            <span className="text-muted">{t('money.ledgerPurchasesPaid')}</span>
            <span className="text-end font-semibold">{formatMoney(financeNow.purchases_paid)}</span>
            <span className="text-muted">{t('money.kpiExpenses')}</span>
            <span className="text-end font-semibold">{formatMoney(financeNow.expenses)}</span>
            <span className="font-semibold">{t('money.ledgerNetCash')}</span>
            <span className="text-end font-bold">{formatMoney(financeNow.net_cash)}</span>
          </div>
          <p className="mt-2 text-xs text-muted">
            {t('money.ledgerFinanceNote', {
              sales: formatMoney(financeNow.sales_total),
              purchases: formatMoney(financeNow.purchases_total),
            })}
          </p>
        </Card>
      )}

      {/* تبويبات + زر الإضافة في صف أفقي واحد (قاعدة المالك للأزرار) */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {(
            [
              ['purchases', 'money.ledgerTabPurchases'],
              ['sales', 'money.ledgerTabSales'],
              ['suppliers', 'money.ledgerTabSuppliers'],
            ] as [Tab, I18nKey][]
          ).map(([key, label]) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={tab === key ? 'primary' : 'soft'}
              onClick={() => setTab(key)}
            >
              {t(label)}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() =>
            setSheet(
              tab === 'purchases'
                ? { kind: 'purchase' }
                : tab === 'sales'
                  ? { kind: 'sale' }
                  : { kind: 'supplier' },
            )
          }
        >
          <Plus size={16} />
          {t(
            tab === 'purchases'
              ? 'money.ledgerAddPurchase'
              : tab === 'sales'
                ? 'money.ledgerAddSale'
                : 'money.ledgerAddSupplier',
          )}
        </Button>
      </div>

      {loading ? (
        <LoadingState label={t('money.ledgerLoading')} />
      ) : failed ? (
        <ErrorState
          message={t('money.ledgerLoadError')}
          onRetry={() => {
            void purchasesQ.refetch()
            void salesQ.refetch()
            void suppliersQ.refetch()
          }}
        />
      ) : (
        <>
          {tab === 'purchases' && (
            <>
              <Card className="mb-3">
                <p className="mb-1 text-sm font-semibold">
                  {t('money.ledgerPayablesTitle')}: {formatMoney(totalPayables)}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  {AGING_BUCKETS.map((b) => (
                    <span key={b}>
                      {t(AGING_KEY[b])}: {formatMoney(aging[b])}
                    </span>
                  ))}
                </div>
              </Card>
              {(purchasesQ.data ?? []).length === 0 ? (
                <EmptyState
                  title={t('money.ledgerEmptyPurchasesTitle')}
                  hint={t('money.ledgerEmptyPurchasesHint')}
                />
              ) : (
                (purchasesQ.data ?? []).map((p) => (
                  <PurchaseRow
                    key={p.id}
                    purchase={p}
                    onPay={(purchase) => setSheet({ kind: 'payment', purchase })}
                    onSaved={saved}
                  />
                ))
              )}
            </>
          )}

          {tab === 'sales' && (
            <>
              {(salesQ.data ?? []).length === 0 ? (
                <EmptyState
                  title={t('money.ledgerEmptySalesTitle')}
                  hint={t('money.ledgerEmptySalesHint')}
                />
              ) : (
                (salesQ.data ?? []).map((s) => (
                  <SaleRow
                    key={s.id}
                    sale={s}
                    onCollect={(sale) => setSheet({ kind: 'collect', sale })}
                    onSaved={saved}
                  />
                ))
              )}
            </>
          )}

          {tab === 'suppliers' && (
            <>
              {(suppliersQ.data ?? []).length === 0 ? (
                <EmptyState
                  title={t('money.ledgerEmptySuppliersTitle')}
                  hint={t('money.ledgerEmptySuppliersHint')}
                />
              ) : (
                (suppliersQ.data ?? []).map((s) => {
                  const payable = (payablesQ.data ?? []).find((r) => r.supplier_id === s.id)
                  const remaining = Number(payable?.remaining) || 0
                  return (
                    <Card key={s.id} className="mb-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{s.name}</span>
                          <span className="block text-xs text-muted">
                            {s.phone ?? ''}
                            {remaining > 0 &&
                              ` · ${t('money.ledgerRemaining')}: ${formatMoney(remaining)}`}
                          </span>
                        </span>
                        <span className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setSheet({ kind: 'supplier', supplier: s })}
                            aria-label={t('money.edit')}
                          >
                            <Pencil size={15} />
                          </Button>
                          <SupplierDelete supplier={s} onSaved={saved} />
                        </span>
                      </div>
                    </Card>
                  )
                })
              )}
            </>
          )}
        </>
      )}

      {sheet?.kind === 'purchase' && (
        <PurchaseFormSheet teacherId={teacherId} onClose={() => setSheet(null)} onSaved={saved} />
      )}
      {sheet?.kind === 'sale' && (
        <SaleFormSheet teacherId={teacherId} onClose={() => setSheet(null)} onSaved={saved} />
      )}
      {sheet?.kind === 'supplier' && (
        <SupplierFormSheet
          teacherId={teacherId}
          supplier={sheet.supplier}
          onClose={() => setSheet(null)}
          onSaved={saved}
        />
      )}
      {sheet?.kind === 'payment' && (
        <PurchasePaymentSheet
          teacherId={teacherId}
          purchase={sheet.purchase}
          onClose={() => setSheet(null)}
          onSaved={saved}
        />
      )}
      {sheet?.kind === 'collect' && (
        <SaleCollectSheet sale={sheet.sale} onClose={() => setSheet(null)} onSaved={saved} />
      )}
    </section>
  )
}

function SupplierDelete({ supplier, onSaved }: { supplier: SupplierRow; onSaved: (m: string) => void }) {
  const del = useDeleteSupplier()
  const toast = useToast()
  return (
    <ConfirmDeleteButton
      label=""
      onDelete={() =>
        del.mutate(supplier.id, {
          onSuccess: () => onSaved(t('money.ledgerDeleted')),
          onError: (err) => toast(errText(err)),
        })
      }
    />
  )
}
