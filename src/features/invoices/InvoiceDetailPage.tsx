import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/toast'
import { Button } from '../../components/ui/Button'
import { Banknote, Lock, ReceiptText, UserRound } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatMoney } from '../../lib/format'
import type { PaymentRow } from '../../types/database'
import { useGroup } from '../groups/hooks'
import { PAYMENT_METHOD_LABELS, payStateOf, periodLabel, periodYm } from './api'
import { useInvoice, useInvoiceLines, useInvoicePayments, useVoidPayment } from './hooks'
import { AdjustSheet, PaySheet, ReceiptSheet } from './sheets'

/**
 * تفاصيل الفاتورة (المواصفات §3.6): جدول البنود (الأساسي/الخصم/التسويات
 * بأسبابها)، الإجمالي والمدفوع والمتبقي من view ‏invoice_balances، سجل
 * الدفعات مع العكس بدفعة سالبة، وأزرار ملف الطالب/تسجيل دفعة/إيصال،
 * وزر تسوية الحضور لمجموعات «حسب الحضور» فقط.
 * المالية محجوبة عن المساعد بـ RLS والواجهة معاً.
 */
export function InvoiceDetailPage() {
  const { id } = useParams()
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
        <div className="type-section mb-1">الفواتير والمالية للمالك فقط</div>
        <p className="text-muted text-[13.5px] mb-0">
          حساب المساعد لا يملك صلاحية مالية — البيانات محجوبة في قاعدة البيانات نفسها (RLS).
        </p>
      </Card>
    )
  }

  if (invoiceQ.isPending || linesQ.isPending || paymentsQ.isPending)
    return <LoadingState label="بنحمّل تفاصيل الفاتورة…" />
  const error = invoiceQ.error ?? linesQ.error ?? paymentsQ.error
  if (error)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'خطأ غير معروف'}
        onRetry={() => {
          void invoiceQ.refetch()
          void linesQ.refetch()
          void paymentsQ.refetch()
        }}
      />
    )
  if (!invoice) {
    return (
      <EmptyState icon={ReceiptText} title="الفاتورة غير موجودة" hint="ممكن تكون اتحذفت أو الرابط غير صحيح" />
    )
  }

  const state = payStateOf(invoice)
  const isAttendedGroup = groupQ.data?.billing_type === 'per_session_attended'
  const lines = linesQ.data ?? []

  return (
    <div>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link
              to={`/students/${invoice.student_id}`}
              className="font-extrabold text-[16px] text-text no-underline"
            >
              {invoice.student_name}
            </Link>
            <div className="text-muted text-[13.5px] mt-0.5">
              {invoice.group_name} · {periodLabel(invoice.period_month)} (
              <span dir="ltr">{periodYm(invoice.period_month)}</span>)
              {invoice.student_code ? (
                <>
                  {' · '}
                  الكود <span dir="ltr">{invoice.student_code}</span>
                </>
              ) : null}
            </div>
          </div>
          {state === 'paid' ? (
            <span className="shrink-0 text-[12px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-2 py-0.5">
              مسدد
            </span>
          ) : state === 'partial' ? (
            <span className="shrink-0 text-[12px] font-bold bg-primary/10 text-primary border border-primary/30 rounded-full px-2 py-0.5">
              مدفوع جزئياً
            </span>
          ) : (
            <span className="shrink-0 text-[12px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5">
              مستحقة
            </span>
          )}
        </div>

        {/* جدول البنود */}
        <div className="mt-3 border-t border-border">
          {lines.length === 0 ? (
            <p className="text-muted text-[13.5px] py-3 mb-0">مفيش بنود مسجلة على الفاتورة دي.</p>
          ) : (
            lines.map((l) => (
              <div key={l.id} className="flex justify-between gap-3 py-2 border-b border-border/70">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold">
                    {l.description}
                    {l.line_type === 'discount' && (
                      <span className="ms-2 text-[12px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-2 py-0.5 align-middle">
                        خصم
                      </span>
                    )}
                    {l.line_type === 'adjustment' && (
                      <span className="ms-2 text-[12px] font-bold bg-soft text-primary border border-primary/30 rounded-full px-2 py-0.5 align-middle">
                        تسوية
                      </span>
                    )}
                  </div>
                  {l.reason && <div className="text-muted text-[12px]">{l.reason}</div>}
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
              <span className="text-muted font-semibold">الإجمالي</span>
              <b dir="ltr">{formatMoney(invoice.total)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-muted font-semibold">المدفوع</span>
              <b dir="ltr" className="text-ok-text">{formatMoney(invoice.paid)}</b>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5">
              <span className="font-extrabold">المتبقي</span>
              <b dir="ltr" className={invoice.balance > 0 ? 'text-warn-text' : 'text-ok-text'}>
                {invoice.balance > 0 ? formatMoney(invoice.balance) : 'مسدد بالكامل'}
              </b>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <Link to={`/students/${invoice.student_id}`} className="no-underline">
            <Button variant="soft">
              <UserRound size={20} />
              ملف الطالب
            </Button>
          </Link>
          {invoice.balance > 0 && (
            <Button onClick={() => setPayOpen(true)}>
              <Banknote size={20} />
              تسجيل دفعة
            </Button>
          )}
          {latestPayment && (
            <Button variant="ghost" onClick={() => setReceipt({ payment: latestPayment })}>
              <ReceiptText size={20} />
              إيصال
            </Button>
          )}
          {isAttendedGroup && (
            <Button variant="ghost" onClick={() => setAdjustOpen(true)}>
              + تسوية حضور
            </Button>
          )}
        </div>
      </Card>

      {/* سجل الدفعات */}
      <h2 className="type-section mb-2 mt-1">سجل الدفعات</h2>
      {payments.length === 0 ? (
        <Card>
          <EmptyState
            icon={Banknote}
            title="لسه مفيش دفعات"
            hint="أول دفعة هتتسجل هنا برقم إيصالها التسلسلي، والدفع الجزئي مدعوم."
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          {payments.map((p, i) => {
            const isReversal = p.reverses_payment_id != null || p.amount < 0
            const canVoid = p.amount > 0 && !p.voided && !isReversal
            return (
              <div key={p.id} className={`px-[14px] py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
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
                        دفعة عكسية
                      </span>
                    )}
                    {p.voided && (
                      <span className="text-[12px] font-bold bg-muted/15 text-muted border border-border rounded-full px-2 py-0.5">
                        اتعكست
                      </span>
                    )}
                    <button
                      type="button"
                      className="inline-flex items-center min-h-[48px] px-2 text-[13.5px] font-bold text-primary bg-transparent border-0 cursor-pointer"
                      onClick={() => setReceipt({ payment: p })}
                    >
                      الإيصال
                    </button>
                    {canVoid && (
                      <button
                        type="button"
                        disabled={voidPay.isPending}
                        className="inline-flex items-center min-h-[48px] px-2 text-[13.5px] font-bold text-bad-text bg-transparent border-0 cursor-pointer disabled:opacity-50"
                        onClick={() => {
                          if (
                            window.confirm(
                              `عكس الدفعة دي (${formatMoney(p.amount)} — إيصال ${p.receipt_no})؟ هيتعمل دفعة عكسية سالبة والدفعة الأصلية هتفضل موجودة ومتعلمة «اتعكست» — مفيش حذف في الدفاتر المالية.`,
                            )
                          ) {
                            voidPay.mutate(p, {
                              onSuccess: () => toast('اتعكست الدفعة واتحدث رصيد الفاتورة'),
                              onError: (e) =>
                                toast(e instanceof Error ? e.message : 'فشل عكس الدفعة'),
                            })
                          }
                        }}
                      >
                        عكس
                      </button>
                    )}
                  </span>
                </div>
                <div className="text-muted text-[13.5px] mt-0.5">
                  {p.paid_on} · {PAYMENT_METHOD_LABELS[p.method]} · إيصال{' '}
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
            toast(`اتسجلت الدفعة — إيصال رقم ${payment.receipt_no}`)
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
  )
}
