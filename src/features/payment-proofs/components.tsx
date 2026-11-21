import { isUnpaid } from '../invoices/api'
import { useMemo, useState } from 'react'
import { errText } from '../../lib/supabaseErrors'
import { ImageOff, ReceiptText, SearchCheck } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ListRow } from '../../components/ui/ListRow'
import { Sheet } from '../../components/ui/Sheet'
import { Field, FormError, Select, TextInput } from '../../components/ui/form'
import { ErrorState, SkeletonRows } from '../../components/ui/states'
import { useToast } from '../../components/ui/toast'
import { formatClock12, formatMoney } from '../../lib/format'
import { PAYMENT_METHOD_LABELS, periodLabel } from '../invoices/api'
import { useStudentInvoices } from '../invoices/hooks'
import type { PendingProofItem } from './api'
import { useApproveProof, usePendingProofs, useProofImageUrl, useRejectProof } from './hooks'
import { t } from '../../i18n'

/** تاريخ ووقت رفع الإثبات بصيغة مقروءة (التوقيت المحلي للمتصفح) */
function proofDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toLocaleDateString('ar-EG')} · ${formatClock12(d)}`
}

// ---------------------------------------------------------------------------
// قسم «إثباتات دفع قيد المراجعة» في شاشة الفواتير — موضع المراجعة الطبيعي
// لأنه ملاصق للفواتير والدفعات، وصفحة الفواتير للمالك فقط أصلاً (نفس
// جمهور الإثباتات في RLS). القسم يظهر فقط عند وجود معلّقات أو خطأ تحميل؛
// وتنبيه مجمّع في مصدر التنبيهات الواحد (fetchAlerts) بعدّادها يربط هنا
// ويغذّي شارة الشريط السفلي — بلا مصدر عدّاد موازٍ.
// ---------------------------------------------------------------------------

export function ProofsReviewSection({
  teacherId,
  reviewerId,
}: {
  teacherId: string
  reviewerId: string
}) {
  const proofsQ = usePendingProofs(teacherId, true)
  const [selected, setSelected] = useState<PendingProofItem | null>(null)
  const toast = useToast()

  const proofs = proofsQ.data ?? []

  if (proofsQ.isError) {
    return (
      <Card className="border-warn/50">
        <ErrorState
          message={errText(proofsQ.error)}
          onRetry={() => void proofsQ.refetch()}
        />
      </Card>
    )
  }

  if (!proofsQ.isPending && proofs.length === 0) return null

  return (
    <Card className="border-primary/40 bg-soft/40">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="font-extrabold text-[16px] flex items-center gap-2">
          <SearchCheck size={20} className="text-primary" />
          {t('paymentProofs.reviewTitle')}
        </div>
        {proofs.length > 0 && (
          <span className="shrink-0 min-w-[24px] h-6 px-1.5 rounded-full bg-bad text-white type-badge flex items-center justify-center">
            {proofs.length}
          </span>
        )}
      </div>
      <p className="text-muted text-[13.5px] mt-0">
        {t('paymentProofs.reviewHint')}
      </p>

      {proofsQ.isPending ? (
        <SkeletonRows rows={2} />
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {proofs.map((p, i) => (
            <ListRow
              key={p.id}
              first={i === 0}
              leading={<Avatar name={p.student_name} />}
              title={p.student_name}
              secondary={
                <>
                  {formatMoney(p.amount)} · {PAYMENT_METHOD_LABELS[p.method]} ·{' '}
                  {proofDateTime(p.created_at)}
                </>
              }
              trailing={
                <Button variant="soft" onClick={() => setSelected(p)}>
                  {t('paymentProofs.reviewAction')}
                </Button>
              }
            />
          ))}
        </div>
      )}

      {selected && (
        <ReviewProofSheet
          teacherId={teacherId}
          reviewerId={reviewerId}
          proof={selected}
          onClose={() => setSelected(null)}
          onDone={(msg) => {
            setSelected(null)
            toast(msg)
          }}
        />
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// شيت مراجعة إثبات واحد: الصورة (رابط موقّع)، بيانات الادعاء، اختيار
// فاتورة الاعتماد والمبلغ النهائي، واعتماد/رفض. الاعتماد بلا فاتورة
// مستحقة للطالب مستحيل بنيوياً (payments.invoice_id إلزامي) فيُشرح
// للمدرس بدل ما يفشل بصمت.
// ---------------------------------------------------------------------------

function ReviewProofSheet({
  teacherId,
  reviewerId,
  proof,
  onClose,
  onDone,
}: {
  teacherId: string
  reviewerId: string
  proof: PendingProofItem
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const imageQ = useProofImageUrl(proof.storage_path)
  const invoicesQ = useStudentInvoices(teacherId, proof.student_id, true)
  const approve = useApproveProof(teacherId, reviewerId)
  const reject = useRejectProof(teacherId, reviewerId)

  const dueInvoices = useMemo(
    () => (invoicesQ.data ?? []).filter(isUnpaid),
    [invoicesQ.data],
  )
  // الفاتورة المربوطة من الرفع إن وُجدت ومستحقة، وإلا أقدم مستحقة
  const [invoiceChoice, setInvoiceChoice] = useState<string | null>(null)
  const selectedInvoice =
    dueInvoices.find((i) => i.invoice_id === (invoiceChoice ?? proof.invoice_id)) ??
    dueInvoices[0] ??
    null

  const [amount, setAmount] = useState(() => String(proof.amount))
  const [reason, setReason] = useState('')
  const amt = parseFloat(amount) || 0
  const busy = approve.isPending || reject.isPending

  return (
    <Sheet
      open
      title={t('paymentProofs.reviewSheetTitle', { name: proof.student_name })}
      onClose={onClose}
      footer={
        <>
          <Button
            full
            disabled={busy || !selectedInvoice || !(amt > 0)}
            onClick={() => {
              if (!selectedInvoice) return
              approve.mutate(
                { proof, input: { invoiceId: selectedInvoice.invoice_id, amount: amt } },
                {
                  onSuccess: ({ receiptNo }) =>
                    onDone(t('paymentProofs.approveSuccessToast', { receiptNo })),
                },
              )
            }}
          >
            {approve.isPending ? t('paymentProofs.approving') : t('paymentProofs.approveAction')}
          </Button>
          <Button
            full
            variant="danger"
            className="mt-2"
            disabled={busy}
            onClick={() =>
              reject.mutate(
                { proofId: proof.id, reason },
                { onSuccess: () => onDone(t('paymentProofs.rejectSuccessToast')) },
              )
            }
          >
            {reject.isPending ? t('paymentProofs.rejecting') : t('paymentProofs.rejectAction')}
          </Button>
          <Button full variant="ghost" type="button" onClick={onClose} className="mt-2" disabled={busy}>
            {t('paymentProofs.cancel')}
          </Button>
        </>
      }
    >
      {/* صورة الإثبات */}
      {imageQ.isPending ? (
        <div className="rounded-2xl bg-soft animate-pulse h-[220px] mb-3" aria-label={t('paymentProofs.imageLoadingAria')} />
      ) : imageQ.isError || !imageQ.data ? (
        <div className="rounded-2xl border border-border bg-bg p-4 mb-3 text-center">
          <ImageOff size={28} className="mx-auto text-muted mb-1" />
          <p className="text-muted text-[13.5px] mb-0">
            {t('paymentProofs.imageErrorHint')}
          </p>
        </div>
      ) : (
        <a href={imageQ.data} target="_blank" rel="noreferrer" className="block mb-3">
          <img
            src={imageQ.data}
            alt={t('paymentProofs.imageAlt', { name: proof.student_name })}
            className="w-full max-h-[380px] object-contain rounded-2xl border border-border bg-bg"
          />
        </a>
      )}

      {/* بيانات الادعاء */}
      <div className="bg-soft rounded-xl px-3 py-2 mb-3 text-[13.5px]">
        <div className="font-bold flex items-center gap-1.5">
          <ReceiptText size={18} className="text-primary" />
          {proof.student_name}
          {proof.student_code ? (
            <span className="text-muted font-semibold" dir="ltr">
              {proof.student_code}
            </span>
          ) : null}
        </div>
        <div className="text-muted">
          {t('paymentProofs.claimPrefix')} <b className="text-text">{formatMoney(proof.amount)}</b> ·{' '}
          {PAYMENT_METHOD_LABELS[proof.method]} · {t('paymentProofs.claimUploaded')} {proofDateTime(proof.created_at)}
        </div>
      </div>

      <Field label={t('paymentProofs.invoiceFieldLabel')}>
        {invoicesQ.isPending ? (
          <p className="text-muted text-[13.5px]">{t('paymentProofs.loadingInvoices')}</p>
        ) : invoicesQ.isError ? (
          <FormError message={errText(invoicesQ.error)} />
        ) : dueInvoices.length === 0 ? (
          <p className="text-warn-text text-[13.5px] font-semibold mb-0">
            {t('paymentProofs.noDueInvoicesWarn')}
          </p>
        ) : (
          <Select
            value={selectedInvoice?.invoice_id ?? ''}
            onChange={(e) => setInvoiceChoice(e.target.value)}
          >
            {dueInvoices.map((i) => (
              <option key={i.invoice_id} value={i.invoice_id}>
                {i.group_name} · {periodLabel(i.period_month)} — {t('paymentProofs.optionRemaining')} {formatMoney(i.balance)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('paymentProofs.amountFieldLabel')}>
        <TextInput
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>

      <Field label={t('paymentProofs.rejectReasonLabel')}>
        <TextInput
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('paymentProofs.rejectReasonPlaceholder')}
        />
      </Field>

      {approve.isError && <FormError message={errText(approve.error)} />}
      {reject.isError && <FormError message={errText(reject.error)} />}
    </Sheet>
  )
}
