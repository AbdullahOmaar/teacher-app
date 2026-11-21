import { isUnpaid } from './api'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Banknote, Check, ReceiptText } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState } from '../../components/ui/states'
import { formatMoney } from '../../lib/format'
import { PAYMENT_METHOD_LABELS, payStateOf, periodLabel, periodYm } from './api'
import { useStudentInvoices, useStudentPayments } from './hooks'
import { IssueInvoicesSheet } from './sheets'
import { monthStartStr, todayStr } from '../home/api'

/**
 * تبويب المدفوعات في ملف الطالب (المرجع §3.4): ملخص الرصيد المستحق، زر
 * إصدار فواتير الشهر الحالي لهذا الطالب تحديداً، بطاقات فواتيره (تفتح
 * تفاصيل الفاتورة)، وسجل دفعاته عبر كل الفواتير بأرقام الإيصالات.
 * يُعرض للمالك فقط (المالية محجوبة عن المساعد بـ RLS والواجهة).
 */
export function StudentPaymentsTab({
  teacherId,
  studentId,
  studentName,
}: {
  teacherId: string
  studentId: string
  studentName: string
}) {
  const [issueOpen, setIssueOpen] = useState(false)
  const invoicesQ = useStudentInvoices(teacherId, studentId, true)
  const paymentsQ = useStudentPayments(teacherId, studentId, true)

  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data])
  const payments = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data])
  const summary = useMemo(() => {
    const due = invoices.filter(isUnpaid)
    return {
      dueTotal: due.reduce((s, i) => s + i.balance, 0),
      dueCount: due.length,
      totalPaid: invoices.reduce((s, i) => s + i.paid, 0),
    }
  }, [invoices])

  if (invoicesQ.isPending || paymentsQ.isPending)
    return <LoadingState label="بنحمّل فواتير ودفعات الطالب…" />
  const error = invoicesQ.error ?? paymentsQ.error
  if (error)
    return <ErrorState message={error instanceof Error ? error.message : 'خطأ غير معروف'} />

  const currentMonthLabel = periodLabel(monthStartStr(todayStr()))

  return (
    <div>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-extrabold text-[15px]">
              {summary.dueTotal > 0 ? (
                <>
                  مستحق <span className="text-warn-text" dir="ltr">{formatMoney(summary.dueTotal)}</span>
                </>
              ) : (
                <span className="text-ok-text inline-flex items-center gap-1">لا توجد مستحقات <Check size={18} /></span>
              )}
            </div>
            <div className="text-muted text-[13.5px] mt-0.5">
              {summary.dueCount > 0
                ? `${summary.dueCount} فاتورة غير مسددة · `
                : ''}
              إجمالي المدفوع عبر كل الفواتير: {formatMoney(summary.totalPaid)}
            </div>
          </div>
        </div>
        <Button full className="mt-3" onClick={() => setIssueOpen(true)}>
          <ReceiptText size={20} />
          إصدار فواتير {currentMonthLabel}
        </Button>
        <p className="text-muted text-[12px] mt-2 mb-0">
          الإصدار لهذا الطالب في كل مجموعاته، وآمن التكرار — الفواتير الصادرة من قبل لنفس الشهر
          مش هتتكرر.
        </p>
      </Card>

      <h3 className="text-[16px] font-extrabold mb-2 mt-1">فواتير الطالب</h3>
      {invoices.length === 0 ? (
        <Card>
          <EmptyState
            icon={ReceiptText}
            title="لسه مفيش فواتير للطالب ده"
            hint="اصدر فواتير الشهر من الزر اللي فوق وهتظهر هنا بحالتها."
          />
        </Card>
      ) : (
        invoices.map((inv) => {
          const state = payStateOf(inv)
          return (
            <Link
              key={inv.invoice_id}
              to={`/invoices/${inv.invoice_id}`}
              className="block no-underline text-text"
            >
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-[16px]">
                    {periodLabel(inv.period_month)}{' '}
                    <span className="text-muted font-semibold" dir="ltr">
                      {periodYm(inv.period_month)}
                    </span>
                  </div>
                  {state === 'paid' ? (
                    <span className="shrink-0 text-[12px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-2 py-0.5">
                      مسدد
                    </span>
                  ) : state === 'partial' ? (
                    <span className="shrink-0 text-[12px] font-bold bg-primary/10 text-primary border border-primary/30 rounded-full px-2 py-0.5">
                      جزئي — باقي {formatMoney(inv.balance)}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[12px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5">
                      باقي {formatMoney(inv.balance)}
                    </span>
                  )}
                </div>
                <div className="text-muted text-[13.5px] mt-0.5">
                  {inv.group_name} · الإجمالي {formatMoney(inv.total)}
                  {inv.paid > 0 ? ` · مدفوع ${formatMoney(inv.paid)}` : ''}
                </div>
              </Card>
            </Link>
          )
        })
      )}

      <h3 className="text-[16px] font-extrabold mb-2 mt-4">دفعات الطالب</h3>
      {payments.length === 0 ? (
        <Card>
          <EmptyState
            icon={Banknote}
            title="لسه مفيش دفعات مسجلة"
            hint="الدفعات بتتسجل من صفحة الفاتورة وهتظهر هنا برقم الإيصال."
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          {payments.map((p, i) => (
            <Link
              key={p.id}
              to={`/invoices/${p.invoice_id}`}
              className={`block px-[14px] py-3 no-underline text-text ${i > 0 ? 'border-t border-border' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-extrabold text-[16px] ${p.amount < 0 ? 'text-bad-text' : 'text-ok-text'}`}
                  dir="ltr"
                >
                  {formatMoney(p.amount)}
                </span>
                <span className="text-muted text-[13.5px]">
                  {p.period_month ? `${periodLabel(p.period_month)} · ` : ''}
                  {p.group_name}
                </span>
              </div>
              <div className="text-muted text-[13.5px] mt-0.5">
                {p.paid_on} · {PAYMENT_METHOD_LABELS[p.method]} · إيصال{' '}
                <span dir="ltr" className="font-semibold">{p.receipt_no}</span>
                {p.voided ? ' · اتعكست' : ''}
                {p.reverses_payment_id ? ' · دفعة عكسية' : ''}
              </div>
            </Link>
          ))}
        </Card>
      )}

      {issueOpen && (
        <IssueInvoicesSheet
          teacherId={teacherId}
          studentId={studentId}
          studentName={studentName}
          onClose={() => setIssueOpen(false)}
        />
      )}
    </div>
  )
}
