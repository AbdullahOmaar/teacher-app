import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import { useToast } from '../../components/ui/toast'
import { Button } from '../../components/ui/Button'
import { Banknote, CalendarCog, Lock, ReceiptText, Undo2, UserRound } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatMoney } from '../../lib/format'
import type { PaymentRow } from '../../types/database'
import { useGroup } from '../groups/hooks'
import { SG } from '../students/hooks'
import { PAYMENT_METHOD_LABELS, payStateOf, periodLabel } from './api'
import { INV, useInvoice, useInvoiceLines, useInvoicePayments, useVoidPayment } from './hooks'
import { AdjustSheet, PaySheet, ReceiptSheet } from './sheets'
import { t } from '../../i18n'

/**
 * تفاصيل الفاتورة (المواصفات §3.6): جدول البنود (الأساسي/الخصم/التسويات
 * بأسبابها)، الإجمالي والمدفوع والمتبقي من view ‏invoice_balances، سجل
 * الدفعات مع العكس بدفعة سالبة، وأزرار ملف الطالب/تسجيل دفعة/إيصال،
 * وزر تسوية الحضور لمجموعات «حسب الحضور» فقط.
 * المالية محجوبة عن المساعد بـ RLS والواجهة معاً.
 */
export function InvoiceDetailPage({ invoiceId }: { invoiceId?: string } = {}) {
  const params = useParams()
  const qc = useQueryClient()
  // نمط List-Detail (≥1024px): المعرّف من قائمة الفواتير؛ وصفحة التفاصيل
  // المستقلة تقرأه من الرابط كالمعتاد (الروابط العميقة كما هي)
  const id = invoiceId ?? params.id
  const teacher = useCurrentTeacher()
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined

  const [payOpen, setPayOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [receipt, setReceipt] = useState<{ payment: PaymentRow } | null>(null)
  const toast = useToast()

  const invoiceQ = useInvoice(teacherId, id, isOwner)
  const invoice = invoiceQ.data ?? null
  const linesQ = useInvoiceLines(teacherId, id, isOwner)
  const paymentsQ = useInvoicePayments(teacherId, id, isOwner)
  const groupQ = useGroup(teacherId, invoice?.group_id)
  const voidPay = useVoidPayment(teacherId ?? '')

  const payments = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data])
  const latestPayment = payments.find((p) => p.amount > 0 && !p.reverses_payment_id) ?? payments[0]

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  if (!isOwner) {
    return (
      <Card className="text-center py-10">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
          <Lock size={28} />
        </div>
        <div className="type-section mb-1">{t('invoices.ownerOnlyTitle')}</div>
        <p className="text-muted text-[13.5px] mb-0">
          {t('invoices.detailOwnerOnlyBody')}
        </p>
      </Card>
    )
  }

  if (invoiceQ.isPending || linesQ.isPending || paymentsQ.isPending)
    return <LoadingState label={t('invoices.detailLoading')} />
  const error = invoiceQ.error ?? linesQ.error ?? paymentsQ.error
  if (error)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : t('common.unknownError')}
        onRetry={() => {
          void invoiceQ.refetch()
          void linesQ.refetch()
          void paymentsQ.refetch()
        }}
      />
    )
  if (!invoice) {
    return (
      <EmptyState mascot mascotPose="oops" icon={ReceiptText} title={t('invoices.detailNotFoundTitle')} hint={t('invoices.detailNotFoundHint')} />
    )
  }

  const state = payStateOf(invoice)
  const isAttendedGroup = groupQ.data?.billing_type === 'per_session_attended'
  const lines = linesQ.data ?? []

  // إجراءات الترويسة الظاهرة فعلاً وترتيبها — عند عدد فردي يمتد
  // الإجراء الأخير على العرض الكامل بدل خلية نصفية وحيدة معلّقة في
  // سطر أخير (3A-324: زر «إيصال» كان وحده بعرض جزئي)
  const actionCount =
    1 + (invoice.balance > 0 ? 1 : 0) + (latestPayment ? 1 : 0) + (isAttendedGroup ? 1 : 0)
  const orphanSpan = actionCount % 2 === 1 ? 'col-span-2' : ''
  const lastAction: 'adjust' | 'receipt' | 'pay' | 'file' = isAttendedGroup
    ? 'adjust'
    : latestPayment
      ? 'receipt'
      : invoice.balance > 0
        ? 'pay'
        : 'file'

  return (
    <PullToRefresh
      onRefresh={async () => {
        await qc.invalidateQueries({ queryKey: [INV] })
        await qc.invalidateQueries({ queryKey: [SG] })
      }}
    >
    <div>
      <Card className="rise-in" style={{ animationDelay: '0ms' }}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link
              to={`/students/${invoice.student_id}`}
              className="font-extrabold text-[16px] text-text no-underline"
            >
              {invoice.student_name}
            </Link>
            {/* سطر تعريف من مقاطع لا تنشطر (3A-324): حُذفت صيغة
                (YYYY-MM) المكررة بجانب اسم الشهر، وصار كل مقطع وحدة
                nowrap فلا يقع الكود وحده في سطر بلا تسميته */}
            <div className="text-muted text-[13.5px] mt-0.5 flex flex-wrap items-center gap-x-1.5">
              <span>{invoice.group_name}</span>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">{periodLabel(invoice.period_month)}</span>
              {invoice.student_code ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="whitespace-nowrap">
                    {t('invoices.detailCodeLabel')} <span dir="ltr">{invoice.student_code}</span>
                  </span>
                </>
              ) : null}
            </div>
          </div>
          {state === 'paid' ? (
            <span className="shrink-0 text-[12px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-2 py-0.5">
              {t('invoices.badgePaid')}
            </span>
          ) : state === 'partial' ? (
            <span className="shrink-0 text-[12px] font-bold bg-primary/10 text-primary border border-primary/30 rounded-full px-2 py-0.5">
              {t('invoices.detailBadgePartial')}
            </span>
          ) : (
            <span className="shrink-0 text-[12px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5">
              {t('invoices.detailBadgeDue')}
            </span>
          )}
        </div>

        {/* جدول البنود */}
        <div className="mt-3 border-t border-border">
          {lines.length === 0 ? (
            <p className="text-muted text-[13.5px] py-3 mb-0">{t('invoices.detailNoLines')}</p>
          ) : (
            lines.map((l) => (
              <div key={l.id} className="flex justify-between gap-3 py-2 border-b border-border/70">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold">
                    {l.description}
                    {l.line_type === 'discount' && (
                      <span className="ms-2 text-[12px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-2 py-0.5 align-middle">
                        {t('invoices.detailLineDiscount')}
                      </span>
                    )}
                    {l.line_type === 'adjustment' && (
                      <span className="ms-2 text-[12px] font-bold bg-soft text-primary border border-primary/30 rounded-full px-2 py-0.5 align-middle">
                        {t('invoices.detailLineAdjustment')}
                      </span>
                    )}
                  </div>
                  {l.reason && <div className="text-muted text-[13.5px]">{l.reason}</div>}
                </div>
                <span
                  className={`font-bold text-[15px] shrink-0 ${l.amount < 0 ? 'text-bad-text' : ''}`}
                  dir="ltr"
                >
                  {formatMoney(l.amount)}
                </span>
              </div>
            ))
          )}
          <div className="pt-2 space-y-1 text-[15px]">
            <div className="flex justify-between">
              <span className="text-muted font-semibold">{t('invoices.detailTotal')}</span>
              <b dir="ltr">{formatMoney(invoice.total)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-muted font-semibold">{t('invoices.detailPaid')}</span>
              <b dir="ltr" className="text-ok-text">{formatMoney(invoice.paid)}</b>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5">
              <span className="font-extrabold">{t('invoices.remaining')}</span>
              <b dir="ltr" className={invoice.balance > 0 ? 'text-warn-text' : 'text-ok-text'}>
                {invoice.balance > 0 ? formatMoney(invoice.balance) : t('invoices.paidInFull')}
              </b>
            </div>
          </div>
        </div>

        {/* إجراءات الترويسة: شبكة خلايا متساوية (نقطة ٢) — كل خلية
            بنفس العرض والارتفاع 48px مهما تغيّر عدد الإجراءات الظاهرة
            (٢–٤)، بدل التفاف بعرض المحتوى. وعند عدد فردي يمتد الأخير
            على العرض الكامل (3A-324) فلا تبقى خلية نصفية وحيدة.
            الألوان الدلالية كما هي (تسجيل دفعة يبقى الأساسي) والسلوك
            لم يتغير */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Link
            to={`/students/${invoice.student_id}`}
            className={`flex no-underline ${lastAction === 'file' ? orphanSpan : ''}`}
          >
            <Button variant="soft" full className="flex-1">
              <UserRound size={20} />
              {t('invoices.detailStudentFile')}
            </Button>
          </Link>
          {invoice.balance > 0 && (
            <Button full onClick={() => setPayOpen(true)} className={lastAction === 'pay' ? orphanSpan : undefined}>
              <Banknote size={20} />
              {t('invoices.recordPayment')}
            </Button>
          )}
          {latestPayment && (
            <Button
              variant="ghost"
              full
              onClick={() => setReceipt({ payment: latestPayment })}
              className={lastAction === 'receipt' ? orphanSpan : undefined}
            >
              <ReceiptText size={20} />
              {t('invoices.receiptWord')}
            </Button>
          )}
          {isAttendedGroup && (
            <Button
              variant="ghost"
              full
              onClick={() => setAdjustOpen(true)}
              className={lastAction === 'adjust' ? orphanSpan : undefined}
            >
              <CalendarCog size={20} />
              {t('invoices.detailAdjustAttendance')}
            </Button>
          )}
        </div>
      </Card>

      {/* سجل الدفعات */}
      <h2 className="type-section mb-2 mt-1">{t('invoices.detailPaymentsTitle')}</h2>
      {payments.length === 0 ? (
        <Card className="rise-in" style={{ animationDelay: '50ms' }}>
          <EmptyState
            icon={Banknote}
            title={t('invoices.detailNoPaymentsTitle')}
            hint={t('invoices.detailNoPaymentsHint')}
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden rise-in" style={{ animationDelay: '50ms' }}>
          {payments.map((p, i) => {
            const isReversal = p.reverses_payment_id != null || p.amount < 0
            const canVoid = p.amount > 0 && !p.voided && !isReversal
            return (
              <div key={p.id} className={`px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-extrabold text-[15px] ${p.amount < 0 ? 'text-bad-text' : 'text-ok-text'}`}
                    dir="ltr"
                  >
                    {formatMoney(p.amount)}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {isReversal && (
                      <span className="text-[12px] font-bold bg-bad/10 text-bad-text border border-bad/30 rounded-full px-2 py-0.5">
                        {t('invoices.detailReversalBadge')}
                      </span>
                    )}
                    {p.voided && (
                      <span className="text-[12px] font-bold bg-muted/15 text-muted border border-border rounded-full px-2 py-0.5">
                        {t('invoices.detailVoidedBadge')}
                      </span>
                    )}
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 min-h-[48px] px-2 text-[13.5px] font-bold text-primary bg-transparent border-0 cursor-pointer"
                      onClick={() => setReceipt({ payment: p })}
                    >
                      <ReceiptText size={16} />
                      {t('invoices.detailReceiptBtn')}
                    </button>
                    {canVoid && (
                      <button
                        type="button"
                        disabled={voidPay.isPending}
                        className="inline-flex items-center gap-1.5 min-h-[48px] px-2 text-[13.5px] font-bold text-bad-text bg-transparent border-0 cursor-pointer disabled:opacity-50"
                        onClick={() => {
                          if (
                            window.confirm(
                              t('invoices.detailVoidConfirm', { amount: formatMoney(p.amount), receiptNo: p.receipt_no }),
                            )
                          ) {
                            voidPay.mutate(p, {
                              onSuccess: () => toast(t('invoices.detailVoidSuccessToast')),
                              onError: (e) =>
                                toast(e instanceof Error ? e.message : t('invoices.detailVoidErrorToast')),
                            })
                          }
                        }}
                      >
                        <Undo2 size={16} />
                        {t('invoices.detailVoid')}
                      </button>
                    )}
                  </span>
                </div>
                <div className="text-muted text-[13.5px] mt-0.5">
                  {p.paid_on} · {PAYMENT_METHOD_LABELS[p.method]} · {t('invoices.receiptWord')}{' '}
                  <span dir="ltr" className="font-semibold">{p.receipt_no}</span>
                </div>
              </div>
            )
          })}
        </Card>
      )}

      {payOpen && teacherId && (
        <PaySheet
          teacherId={teacherId}
          invoice={invoice}
          onClose={() => setPayOpen(false)}
          onPaid={(payment) => {
            setPayOpen(false)
            // الرصيد بعد الدفعة مباشرة (الـ view هيعيد حسابه عند تحديث الكاش)
            setReceipt({
              payment,
            })
            toast(t('invoices.detailPaidToast', { receiptNo: payment.receipt_no }))
          }}
        />
      )}
      {receipt && teacherId && (
        <ReceiptSheet
          teacherId={teacherId}
          invoice={{
            ...invoice,
            // عند فتح الإيصال بعد دفعة جديدة مباشرة نعكس أثرها على الأرقام
            // المعروضة حتى لو كاش القائمة لسه بيتحدث (المصدر النهائي هو الـ view)
            paid:
              receipt.payment.invoice_id === invoice.invoice_id &&
              !payments.some((p) => p.id === receipt.payment.id)
                ? invoice.paid + receipt.payment.amount
                : invoice.paid,
            balance:
              receipt.payment.invoice_id === invoice.invoice_id &&
              !payments.some((p) => p.id === receipt.payment.id)
                ? invoice.balance - receipt.payment.amount
                : invoice.balance,
          }}
          payment={receipt.payment}
          onClose={() => setReceipt(null)}
        />
      )}
      {adjustOpen && teacherId && (
        <AdjustSheet
          teacherId={teacherId}
          invoice={invoice}
          onClose={() => setAdjustOpen(false)}
          onDone={(msg) => {
            setAdjustOpen(false)
            toast(msg)
          }}
        />
      )}
    </div>
    </PullToRefresh>
  )
}
