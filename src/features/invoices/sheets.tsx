import { useMemo, useState } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { MessageCircle, Printer, ReceiptText } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Logo } from '../../components/brand/Logo'
import { Mascot } from '../../components/mascot/Mascot'
import { useMascotVisible } from '../../components/mascot/useMascotVisible'
import { useBrandIdentity } from '../../hooks/useBrandIdentity'
import { Chip, ChipRow, Field, FormError, Select, TextArea, TextInput } from '../../components/ui/form'
import { formatMoney, formatTime12 } from '../../lib/format'
import { errText } from '../../lib/supabaseErrors'
import type { AttendanceStatus, PaymentMethod, PaymentRow } from '../../types/database'
import { todayStr } from '../home/api'
import { ATTENDANCE_STATUSES, STATUS_LABELS } from '../attendance/api'
import { useStudent } from '../students/hooks'
import {
  DEFAULT_WA_TEMPLATE,
  PAYMENT_METHODS,
  buildReceiptMessage,
  payStateOf,
  periodLabel,
  periodYm,
  receiptWaUrl,
  type InvoiceListItem,
  type IssueResult,
} from './api'
import {
  useApplyAdjustment,
  useCreatePayment,
  useInvoiceLines,
  useInvoiceMonthAttendance,
  useIssueInvoices,
  useTeacherDisplayName,
  useWhatsappTemplate,
} from './hooks'
import { t } from '../../i18n'

// ---------------------------------------------------------------------------
// إصدار فواتير شهر — المرجع §4 مودال issueModal + §5.1:
// شهر مختار + خصم عام اختياري وسببه، والتوليد idempotent (إعادة الإصدار
// لنفس الشهر لا تنشئ أي فاتورة مكررة — قيد المخطط الفريد + فحص العميل).
// ---------------------------------------------------------------------------

export function IssueInvoicesSheet({
  teacherId,
  onClose,
  studentId,
  studentName,
}: {
  teacherId: string
  onClose: () => void
  studentId?: string
  studentName?: string
}) {
  const [month, setMonth] = useState(() => todayStr().slice(0, 7))
  const [discount, setDiscount] = useState('')
  const [note, setNote] = useState('')
  const [result, setResult] = useState<IssueResult | null>(null)
  const issue = useIssueInvoices(teacherId)

  const monthLabel = month
    ? periodLabel(`${month}-01`)
    : ''

  return (
    <Sheet
      open
      title={studentId ? t('invoices.sheetIssueTitleStudent', { month: monthLabel, name: studentName ?? t('invoices.sheetStudentFallback') }) : t('invoices.sheetIssueTitle', { month: monthLabel })}
      onClose={onClose}
      footer={
        result ? undefined : (
          <>
            <Button full type="submit" form="issue-form" disabled={issue.isPending || !month}>
              {issue.isPending ? t('invoices.sheetIssuing') : t('invoices.sheetIssueTitle', { month: monthLabel })}
            </Button>
            <Button full variant="ghost" type="button" onClick={onClose} className="mt-2">
              {t('invoices.cancel')}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div>
          <div className="text-center py-4">
            <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
              <ReceiptText size={28} />
            </div>
            <div className="font-extrabold text-[16px]">
              {result.created > 0
                ? t('invoices.sheetIssueCreated', { count: result.created, month: monthLabel })
                : t('invoices.sheetIssueNoneCreated')}
            </div>
            <p className="text-muted text-[13.5px] mt-1 mb-0">
              {result.skipped > 0
                ? t('invoices.sheetIssueSkipped', { count: result.skipped })
                : ''}
              {t('invoices.sheetIssueSafeNote')}
            </p>
          </div>
          <Button full onClick={onClose}>
            {t('invoices.sheetOk')}
          </Button>
        </div>
      ) : (
        <form
          id="issue-form"
          onSubmit={(e) => {
            e.preventDefault()
            issue.mutate(
              {
                periodMonth: `${month}-01`,
                discount: Math.max(0, parseFloat(discount) || 0),
                discountNote: note.trim() ? note.trim() : null,
                studentId,
              },
              { onSuccess: (r) => setResult(r) },
            )
          }}
        >
          <Field label={t('invoices.sheetMonthLabel')}>
            <TextInput
              type="month"
              required
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </Field>
          <Field label={t('invoices.sheetDiscountLabel')}>
            <TextInput
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </Field>
          <Field label={t('invoices.sheetDiscountReasonLabel')}>
            <TextInput
              placeholder={t('invoices.sheetDiscountPlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <p className="text-muted text-[13.5px] mt-0">
            {studentId
              ? t('invoices.sheetIssueHintStudent')
              : t('invoices.sheetIssueHintAll')}{' '}
            {t('invoices.sheetIssueHintAttended')}
          </p>
          {issue.isError && <FormError message={errText(issue.error)} />}
        </form>
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// تسجيل دفعة — المرجع §4 مودال pay: عرض المتبقي + سداد سريع (كامل/النصف)
// + مبلغ وتاريخ وطريقة دفع. الرقم التسلسلي للإيصال من دالة المخطط.
// ---------------------------------------------------------------------------

export function PaySheet({
  teacherId,
  invoice,
  onClose,
  onPaid,
}: {
  teacherId: string
  invoice: InvoiceListItem
  onClose: () => void
  onPaid: (payment: PaymentRow) => void
}) {
  const balance = Math.max(0, invoice.balance)
  const [amount, setAmount] = useState(() => String(balance || ''))
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [paidOn, setPaidOn] = useState(() => todayStr())
  const pay = useCreatePayment(teacherId)

  const amt = parseFloat(amount) || 0

  return (
    <Sheet
      open
      title={t('invoices.recordPayment')}
      onClose={onClose}
      footer={
        <>
          <Button full type="submit" form="pay-form" disabled={pay.isPending || !(amt > 0)}>
            {pay.isPending ? t('invoices.sheetPaying') : t('invoices.sheetPaySubmit')}
          </Button>
          <Button full variant="ghost" type="button" onClick={onClose} className="mt-2">
            {t('invoices.cancel')}
          </Button>
        </>
      }
    >
      <div className="bg-soft rounded-xl px-3 py-2 mb-3 text-[13.5px]">
        <div className="font-bold">{invoice.student_name}</div>
        <div className="text-muted">
          {invoice.group_name} · {periodLabel(invoice.period_month)} · {t('invoices.remaining')}{' '}
          <b className="text-text">{formatMoney(invoice.balance)}</b> {t('invoices.sheetPayOfTotal', { amount: formatMoney(invoice.total) })}
        </div>
      </div>
      <form
        id="pay-form"
        onSubmit={(e) => {
          e.preventDefault()
          pay.mutate(
            { invoiceId: invoice.invoice_id, input: { amount: amt, method, paid_on: paidOn } },
            { onSuccess: (p) => onPaid(p) },
          )
        }}
      >
        <div className="flex gap-2 mb-3">
          <Button
            type="button"
            variant="soft"
            className="flex-1"
            onClick={() => setAmount(String(balance))}
          >
            {t('invoices.sheetPayFull')}
          </Button>
          {balance >= 100 && (
            <Button
              type="button"
              variant="soft"
              className="flex-1"
              onClick={() => setAmount(String(balance / 2))}
            >
              {t('invoices.sheetPayHalf', { amount: formatMoney(balance / 2) })}
            </Button>
          )}
        </div>
        <Field label={t('invoices.sheetAmountLabel')}>
          <TextInput
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label={t('invoices.sheetMethodLabel')}>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('invoices.sheetPaidOnLabel')}>
          <TextInput
            type="date"
            required
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </Field>
        {amt > balance && balance > 0 && (
          <p className="text-warn-text text-[13.5px] font-semibold">
            {t('invoices.sheetPayOverWarn')}
          </p>
        )}
        {pay.isError && <FormError message={errText(pay.error)} />}
      </form>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// الإيصال — المرجع §4 مودال receipt + §6.8: مبدّل ورق A4 / حراري 80mm،
// منطقة طباعة .print-area (CSS print في index.css)، ورسالة واتساب من قالب
// الإعدادات قابلة للتحرير والرابط يتحدث حياً.
// ---------------------------------------------------------------------------

export function ReceiptSheet({
  teacherId,
  invoice,
  payment,
  onClose,
}: {
  teacherId: string
  invoice: InvoiceListItem
  payment: PaymentRow
  onClose: () => void
}) {
  const [paper, setPaper] = useState<'a4' | 'thermal'>('a4')
  const [editedMessage, setEditedMessage] = useState<string | null>(null)
  const linesQ = useInvoiceLines(teacherId, invoice.invoice_id, true)
  const studentQ = useStudent(teacherId, invoice.student_id)
  const teacherNameQ = useTeacherDisplayName(teacherId, true)
  const templateQ = useWhatsappTemplate(teacherId, true)
  // الهوية البيضاء (Phase 3 خطوة 1): اسم السنتر وشعاره ولهجته على ترويسة
  // الإيصال إن وُجدت — الاسم التجاري يتقدم اسم المدرس، وغيابها = الشكل
  // الحالي حرفياً (شعار التطبيق + اسم المدرس).
  const { brand } = useBrandIdentity(teacherId, true)
  // احتفال الدفعة (دُفّي + جملته) نقطة ظهور ماسكوت: مفتاح الإظهار يحكم
  // الشريط كله — صورةً ونصاً — كما في باقي النقاط (MASCOT-PLAN §٧)
  const mascotVisible = useMascotVisible()

  const student = studentQ.data ?? null
  const guardian = student?.guardian_name?.trim() ? student.guardian_name : t('invoices.guardianFallback')

  // رسالة الواتساب تُبنى من قالب الإعدادات عند اكتمال البيانات، وتحرير
  // المستخدم اليدوي يتغلب عليها (كما في المرجع: النص قابل للتحرير والرابط حي)
  const builtMessage = useMemo(() => {
    if (templateQ.isPending || studentQ.isPending) return null
    return buildReceiptMessage(templateQ.data ?? DEFAULT_WA_TEMPLATE, {
      guardian,
      name: invoice.student_name,
      periodMonth: invoice.period_month,
      paid: invoice.paid,
      total: invoice.total,
      balance: invoice.balance,
    })
  }, [
    templateQ.isPending,
    templateQ.data,
    studentQ.isPending,
    guardian,
    invoice.student_name,
    invoice.period_month,
    invoice.paid,
    invoice.total,
    invoice.balance,
  ])
  const message = editedMessage ?? builtMessage

  const waUrl = useMemo(() => {
    if (!student || message == null) return null
    return receiptWaUrl(student, message)
  }, [student, message])

  const lines = linesQ.data ?? []
  const state = payStateOf(invoice)

  return (
    <Sheet open title={t('invoices.sheetReceiptTitle', { receiptNo: payment.receipt_no })} onClose={onClose}>
      {/* احتفال دُفّي بنجاح تسجيل الدفعة (MASCOT-PLAN §٤/§٦ — الورقة دي
          لا تُفتح إلا من مسار نجاح الدفع مباشرة). خارج منطقة الطباعة
          (print-area) تماماً فلا يصل للإيصال الورقي أبداً. جملة النجاح
          من §٨ حرفياً (خطة الهوية P-8) — الاحتفال بصري + صوتي */}
      {mascotVisible && (
        <div className="flex flex-col items-center gap-1.5 mb-1">
          <Mascot state="celebrate" size={64} />
          <div className="font-bold text-[14.5px] text-center">{t('mascot.paymentSuccess')}</div>
        </div>
      )}
      <ChipRow>
        <Chip active={paper === 'a4'} onClick={() => setPaper('a4')}>
          {t('invoices.sheetPaperA4')}
        </Chip>
        <Chip active={paper === 'thermal'} onClick={() => setPaper('thermal')}>
          {t('invoices.sheetPaperThermal')}
        </Chip>
      </ChipRow>

      <div
        className={`print-area ${paper === 'thermal' ? 'paper-thermal' : ''} bg-white text-slate-900 border border-dashed border-slate-300 rounded-xl p-4 mb-3`}
      >
        <div
          className="text-center border-b border-slate-200 pb-2 mb-2"
          style={brand.accent ? { borderBottomColor: brand.accent, borderBottomWidth: 2 } : undefined}
        >
          <div className="flex justify-center mb-1.5">
            {brand.logoUrl ? (
              <img
                src={brand.logoUrl}
                alt={brand.name ?? t('invoices.sheetCentreLogoAlt')}
                className="h-[52px] max-w-[180px] object-contain"
              />
            ) : (
              <Logo size={44} />
            )}
          </div>
          <div
            className="font-extrabold text-[16px]"
            style={brand.accent ? { color: brand.accent } : undefined}
          >
            {brand.name ?? (teacherNameQ.data ? teacherNameQ.data : t('invoices.sheetReceiptFallbackTitle'))}
          </div>
          <div className="text-[12px] text-slate-500">
            {t('invoices.sheetReceiptNoLabel')} <span dir="ltr" className="font-bold text-slate-800">{payment.receipt_no}</span>
            {' · '}
            {payment.paid_on}
          </div>
        </div>
        <div className="text-[13.5px] space-y-1">
          <div>
            {t('invoices.sheetReceiptStudent')} <b>{invoice.student_name}</b>
            {invoice.student_code ? (
              <>
                {' '}
                (<span dir="ltr">{invoice.student_code}</span>)
              </>
            ) : null}
          </div>
          <div>
            {t('invoices.sheetReceiptGroup')} <b>{invoice.group_name}</b>
          </div>
          <div>
            {t('invoices.sheetReceiptMonth')} <b>{periodLabel(invoice.period_month)}</b> (<span dir="ltr">{periodYm(invoice.period_month)}</span>)
          </div>
        </div>
        <table className="w-full text-[13.5px] mt-3 border-t border-slate-200">
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-100">
                <td className="py-1.5">
                  {l.description}
                  {l.reason && <div className="text-[12px] text-slate-500">{l.reason}</div>}
                </td>
                <td
                  className={`py-1.5 text-left font-bold ${l.amount < 0 ? 'text-red-600' : ''}`}
                  dir="ltr"
                >
                  {formatMoney(l.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-[13.5px] mt-2 space-y-1">
          <div className="flex justify-between">
            <span>{t('invoices.sheetReceiptThisPayment')}</span>
            <b dir="ltr">{formatMoney(payment.amount)}</b>
          </div>
          <div className="flex justify-between">
            <span>{t('invoices.sheetReceiptInvoiceTotal')}</span>
            <span dir="ltr">{formatMoney(invoice.total)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t('invoices.sheetReceiptTotalPaid')}</span>
            <span dir="ltr">{formatMoney(invoice.paid)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1.5 font-extrabold">
            <span>{t('invoices.remaining')}</span>
            <span dir="ltr">
              {state === 'paid' ? t('invoices.paidInFull') : formatMoney(invoice.balance)}
            </span>
          </div>
        </div>
        <div className="text-center text-[12px] text-slate-500 mt-3">{t('invoices.sheetReceiptThanks')}</div>
      </div>

      <Field label={t('invoices.sheetReceiptWaLabel')}>
        <TextArea
          rows={3}
          value={message ?? ''}
          onChange={(e) => setEditedMessage(e.target.value)}
          placeholder={t('invoices.sheetReceiptWaPlaceholder')}
        />
      </Field>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => window.print()}>
          <Printer size={20} />
          {t('invoices.sheetReceiptPrint')}
        </Button>
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noreferrer" className="flex-1 no-underline">
            <Button variant="soft" className="w-full" type="button">
              <MessageCircle size={20} />
              {t('invoices.sheetReceiptSendWa')}
            </Button>
          </a>
        )}
      </div>
      <Button full variant="ghost" onClick={onClose} className="mt-2">
        {t('common.close')}
      </Button>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// تسوية حضور — المرجع §4 مودال adjust + §5.3 (لفواتير حسب الحضور فقط)
// ---------------------------------------------------------------------------

export function AdjustSheet({
  teacherId,
  invoice,
  onClose,
  onDone,
}: {
  teacherId: string
  invoice: InvoiceListItem
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const sessionsQ = useInvoiceMonthAttendance(teacherId, invoice, true)
  const [sessionId, setSessionId] = useState('')
  const [statusChoice, setStatusChoice] = useState<AttendanceStatus | null>(null)
  const [reason, setReason] = useState('')
  const adjust = useApplyAdjustment(teacherId)

  const sessions = useMemo(() => sessionsQ.data ?? [], [sessionsQ.data])
  const selected = sessions.find((s) => s.session_id === sessionId) ?? sessions[0] ?? null
  // الحالة الجديدة تبدأ من حالة الحصة الحالية ما لم يغيّرها المستخدم
  const newStatus: AttendanceStatus = statusChoice ?? selected?.status ?? 'p'

  return (
    <Sheet
      open
      title={t('invoices.sheetAdjustTitle')}
      onClose={onClose}
      footer={
        sessions.length > 0 && !sessionsQ.isPending && !sessionsQ.isError ? (
          <>
            <Button
              full
              type="submit"
              form="adjust-form"
              disabled={adjust.isPending || !selected || !reason.trim()}
            >
              {adjust.isPending ? t('invoices.sheetAdjusting') : t('invoices.sheetAdjustSave')}
            </Button>
            <Button full variant="ghost" type="button" onClick={onClose} className="mt-2">
              {t('invoices.cancel')}
            </Button>
          </>
        ) : undefined
      }
    >
      {sessionsQ.isPending ? (
        <p className="text-muted text-[13.5px]">{t('invoices.sheetAdjustLoading')}</p>
      ) : sessionsQ.isError ? (
        <p className="text-bad-text text-[13.5px] font-semibold">{errText(sessionsQ.error)}</p>
      ) : sessions.length === 0 ? (
        <p className="text-muted text-[13.5px]">
          {t('invoices.sheetAdjustEmpty')}
        </p>
      ) : (
        <form
          id="adjust-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!selected) return
            adjust.mutate(
              { invoice, session: selected, newStatus, reason },
              {
                onSuccess: ({ delta }) =>
                  onDone(
                    delta === 0
                      ? t('invoices.sheetAdjustDoneNoDelta')
                      : t('invoices.sheetAdjustDoneDelta', { delta: `${delta > 0 ? '+' : ''}${formatMoney(delta)}` }),
                  ),
              },
            )
          }}
        >
          <Field label={t('invoices.sheetAdjustSessionLabel')}>
            <Select
              value={selected?.session_id ?? ''}
              onChange={(e) => {
                setSessionId(e.target.value)
                setStatusChoice(null)
              }}
            >
              {sessions.map((s) => (
                <option key={s.session_id} value={s.session_id}>
                  {s.session_date} · {formatTime12(s.start_time)} — {t('invoices.sheetAdjustCurrently')}{' '}
                  {s.status ? STATUS_LABELS[s.status] : t('invoices.sheetAdjustNoStatus')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('invoices.sheetAdjustNewStatusLabel')}>
            <Select
              value={newStatus}
              onChange={(e) => setStatusChoice(e.target.value as AttendanceStatus)}
            >
              {ATTENDANCE_STATUSES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('invoices.sheetAdjustReasonLabel')}>
            <TextInput
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('invoices.sheetAdjustReasonPlaceholder')}
            />
          </Field>
          <p className="text-muted text-[13.5px] mt-0">
            {t('invoices.sheetAdjustNote')}
          </p>
          {adjust.isError && <FormError message={errText(adjust.error)} />}
        </form>
      )}
    </Sheet>
  )
}
