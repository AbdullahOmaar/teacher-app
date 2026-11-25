import { invalidatePrefixes } from '../../lib/invalidate'
import { isUnpaid } from '../invoices/api'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { errText } from '../../lib/supabaseErrors'
import { CheckCheck, ImageOff, ReceiptText, SearchCheck } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ListRow } from '../../components/ui/ListRow'
import { Sheet } from '../../components/ui/Sheet'
import { Field, FormError, Select, TextInput } from '../../components/ui/form'
import { ErrorState } from '../../components/ui/states'
import { useToast } from '../../components/ui/toast'
import { formatClock12, formatMoney } from '../../lib/format'
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, periodLabel } from '../invoices/api'
import { useStudentInvoices } from '../invoices/hooks'
import { proofDate, type PendingProofItem } from './api'
import type { ExtractRequestResult } from './extract'
import {
  PP,
  useApproveProof,
  useExtractReceipt,
  usePendingProofs,
  useProofImageUrl,
  useRejectProof,
} from './hooks'
import { t, type I18nKey } from '../../i18n'
import type { PaymentMethod } from '../../types/database'

/** تاريخ ووقت رفع الإثبات بصيغة مقروءة (التوقيت المحلي للمتصفح) */
function proofDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${proofDate(iso)} · ${formatClock12(d)}`
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
  const qc = useQueryClient()
  const proofsQ = usePendingProofs(teacherId, true)
  const [selected, setSelected] = useState<PendingProofItem | null>(null)
  const toast = useToast()

  const proofs = proofsQ.data ?? []

  if (proofsQ.isError) {
    return (
      <Card className="border-warn/50">
        <ErrorState
          message={errText(proofsQ.error)}
          onRetry={() => void invalidatePrefixes(qc, [PP])}
        />
      </Card>
    )
  }

  // أثناء التحميل لا يُرسم شيء (3A-712 — قياس CLS): البطاقة الهيكلية
  // بارتفاعها الكامل كانت تختفي عند فراغ النتيجة فيقفز محتوى الفواتير
  // تحتها لأعلى (إزاحة مقاسة 0.235 على 375px). القسم بحسب قصده الموثق
  // أعلاه «يظهر فقط عند وجود معلّقات أو خطأ تحميل» — فالانتظار بلا
  // رسم يطابق القصد ويُبقي موضعه النهائي ثابتاً، وصفحة الفواتير نفسها
  // تعرض حالة تحميلها العامة في الأثناء.
  if (proofsQ.isPending) return null

  if (proofs.length === 0) return null

  return (
    <Card className="border-primary/40 bg-soft/40">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="font-extrabold text-[16px] flex items-center gap-2">
          <SearchCheck size={20} className="text-primary" />
          {t('paymentProofs.reviewTitle')}
        </div>
        {proofs.length > 0 && (
          <span className="shrink-0 min-w-[24px] h-6 px-1.5 rounded-full bg-bad text-on-status type-badge flex items-center justify-center">
            {proofs.length}
          </span>
        )}
      </div>
      <p className="text-muted text-[13.5px] mt-0">
        {t('paymentProofs.reviewHint')}
      </p>

      {(
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
/** شارة مطابقة قيمة مقروءة آلياً للمدّعى — لا تُرسم عند غياب المقارنة (null) */
function ExtractMatchBadge({ match }: { match: boolean | null }) {
  if (match == null) return null
  return match ? (
    <span className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-ok-soft text-ok-text">
      {t('paymentProofs.extractMatch')}
    </span>
  ) : (
    <span className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-warn/15 text-warn-text">
      {t('paymentProofs.extractMismatch')}
    </span>
  )
}

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
  const [method, setMethod] = useState<PaymentMethod>(proof.method)
  const [paidOn, setPaidOn] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const amt = parseFloat(amount) || 0
  const busy = approve.isPending || reject.isPending

  // Extract-1 (T10): قراءة تلقائية من اللقطة تعبّئ الحقول فوق — اقتراح
  // يراجعه المدرّس، وحالاتها غير الناجحة رسائل صادقة لا أخطاء قاتلة.
  const extract = useExtractReceipt()
  const [extractState, setExtractState] = useState<
    | { phase: 'idle' }
    | { phase: 'done'; result: Extract<ExtractRequestResult, { kind: 'ok' }> }
    | { phase: 'notice'; messageKey: I18nKey }
  >({ phase: 'idle' })

  function runExtract() {
    extract.mutate(proof.id, {
      onSuccess: (res) => {
        if (res.kind === 'ok') {
          setExtractState({ phase: 'done', result: res })
          if (res.extraction.amount != null) setAmount(String(res.extraction.amount))
          if (res.extraction.method != null) setMethod(res.extraction.method)
          if (res.extraction.paid_on != null) setPaidOn(res.extraction.paid_on)
        } else if (res.kind === 'unavailable') {
          setExtractState({ phase: 'notice', messageKey: 'paymentProofs.extractUnavailable' })
        } else if (res.kind === 'no_key') {
          setExtractState({ phase: 'notice', messageKey: 'paymentProofs.extractNoKey' })
        } else {
          setExtractState({ phase: 'notice', messageKey: 'paymentProofs.extractFailed' })
        }
      },
      onError: () =>
        setExtractState({ phase: 'notice', messageKey: 'paymentProofs.extractFailed' }),
    })
  }

  const extractOk = extractState.phase === 'done' ? extractState.result : null
  const extractNothing =
    extractOk != null &&
    extractOk.extraction.amount == null &&
    extractOk.extraction.method == null &&
    extractOk.extraction.paid_on == null
  const confidenceKey: I18nKey =
    extractOk?.extraction.confidence === 'high'
      ? 'paymentProofs.extractConfidenceHigh'
      : extractOk?.extraction.confidence === 'medium'
        ? 'paymentProofs.extractConfidenceMedium'
        : 'paymentProofs.extractConfidenceLow'

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
                {
                  proof,
                  input: {
                    invoiceId: selectedInvoice.invoice_id,
                    amount: amt,
                    method,
                    paidOn: paidOn ?? undefined,
                  },
                },
                {
                  onSuccess: ({ receiptNo }) =>
                    onDone(t('paymentProofs.approveSuccessToast', { receiptNo })),
                },
              )
            }}
          >
            <CheckCheck size={18} />
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

      {/* Extract-1 (T10): قراءة تلقائية مساعدة — تعبّئ الحقول ولا تعتمد شيئاً */}
      <div className="mb-3">
        <Button variant="soft" size="sm" disabled={busy || extract.isPending} onClick={runExtract}>
          <SearchCheck size={16} />
          {extract.isPending ? t('paymentProofs.extracting') : t('paymentProofs.extractAction')}
        </Button>
        {extractState.phase === 'notice' && (
          <p className="text-muted text-[13px] mt-2 mb-0">{t(extractState.messageKey)}</p>
        )}
        {extractOk && (
          <div className="rounded-xl border border-border bg-bg px-3 py-2 mt-2 text-[13.5px]">
            <div className="font-bold mb-1">{t('paymentProofs.extractTitle')}</div>
            {extractNothing ? (
              <p className="text-muted mb-0">{t('paymentProofs.extractNothing')}</p>
            ) : (
              <>
                {extractOk.extraction.amount != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted">{t('paymentProofs.extractAmountLabel')}:</span>
                    <b>{formatMoney(extractOk.extraction.amount)}</b>
                    <ExtractMatchBadge match={extractOk.comparison.amount_match} />
                  </div>
                )}
                {extractOk.extraction.method != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted">{t('paymentProofs.extractMethodLabel')}:</span>
                    <b>{PAYMENT_METHOD_LABELS[extractOk.extraction.method]}</b>
                    <ExtractMatchBadge match={extractOk.comparison.method_match} />
                  </div>
                )}
                {extractOk.extraction.paid_on != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted">{t('paymentProofs.extractDateLabel')}:</span>
                    <b>{proofDate(extractOk.extraction.paid_on)}</b>
                  </div>
                )}
                <div className="text-muted text-[12.5px] mt-1">
                  {t('paymentProofs.extractConfidenceLabel')}: {t(confidenceKey)}
                </div>
              </>
            )}
            <p className="text-muted text-[12.5px] mt-1 mb-0">{t('paymentProofs.extractHint')}</p>
          </div>
        )}
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

      <Field label={t('paymentProofs.methodFieldLabel')}>
        <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.code} value={m.code}>
              {m.label}
            </option>
          ))}
        </Select>
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
