import { useMemo, useState } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { MessageCircle, Printer, ReceiptText } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Logo } from '../../components/brand/Logo'
import { Chip, ChipRow, Field, FormError, Select, TextArea, TextInput } from '../../components/ui/form'
import { formatMoney, shortTime } from '../../lib/format'
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

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'حصل خطأ غير متوقع'
}

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
      title={studentId ? `إصدار فواتير ${monthLabel} — ${studentName ?? 'الطالب'}` : `إصدار فواتير ${monthLabel}`}
      onClose={onClose}
      footer={
        result ? undefined : (
          <>
            <Button full type="submit" form="issue-form" disabled={issue.isPending || !month}>
              {issue.isPending ? 'بنصدر الفواتير…' : `إصدار فواتير ${monthLabel}`}
            </Button>
            <Button full variant="ghost" type="button" onClick={onClose} className="mt-2">
              إلغاء
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
                ? `اتعمل ${result.created} فاتورة جديدة لشهر ${monthLabel}`
                : 'كل فواتير الشهر صادرة بالفعل'}
            </div>
            <p className="text-muted text-[13.5px] mt-1 mb-0">
              {result.skipped > 0
                ? `اتتخطى ${result.skipped} فاتورة موجودة من قبل (منع التكرار). `
                : ''}
              إعادة الإصدار آمنة دائماً ومش هتعمل فواتير مكررة.
            </p>
          </div>
          <Button full onClick={onClose}>
            تمام
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
          <Field label="الشهر">
            <TextInput
              type="month"
              required
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </Field>
          <Field label="خصم عام اختياري (ج) — يطبق على كل فاتورة ولا يتجاوز قيمتها الأساسية">
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
          <Field label="سبب الخصم (اختياري)">
            <TextInput
              placeholder="خصم خاص"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <p className="text-muted text-[13.5px] mt-0">
            {studentId
              ? 'هيتصدر للطالب ده في كل مجموعاته المسجل فيها (وهو نشط).'
              : 'هيتصدر لكل طالب نشط مسجل في أي مجموعة، بسعره الفعلي (سعر المجموعة أو سعره الخاص) وحسب نظام فوترة مجموعته.'}{' '}
            فواتير «حسب الحضور» بتتحسب بعدد الحصص المحضورة لحد النهاردة.
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
      title="تسجيل دفعة"
      onClose={onClose}
      footer={
        <>
          <Button full type="submit" form="pay-form" disabled={pay.isPending || !(amt > 0)}>
            {pay.isPending ? 'بنسجل الدفعة…' : 'تسجيل الدفعة وإصدار الإيصال'}
          </Button>
          <Button full variant="ghost" type="button" onClick={onClose} className="mt-2">
            إلغاء
          </Button>
        </>
      }
    >
      <div className="bg-soft rounded-xl px-3 py-2 mb-3 text-[13.5px]">
        <div className="font-bold">{invoice.student_name}</div>
        <div className="text-muted">
          {invoice.group_name} · {periodLabel(invoice.period_month)} · المتبقي{' '}
          <b className="text-text">{formatMoney(invoice.balance)}</b> من إجمالي{' '}
          {formatMoney(invoice.total)}
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
            كامل المتبقي
          </Button>
          {balance >= 100 && (
            <Button
              type="button"
              variant="soft"
              className="flex-1"
              onClick={() => setAmount(String(balance / 2))}
            >
              النصف ({formatMoney(balance / 2)})
            </Button>
          )}
        </div>
        <Field label="المبلغ (ج)">
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
        <Field label="طريقة الدفع">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="تاريخ الدفع">
          <TextInput
            type="date"
            required
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </Field>
        {amt > balance && balance > 0 && (
          <p className="text-warn-text text-[13.5px] font-semibold">
            المبلغ أكبر من المتبقي — الفاتورة هتتقفل والفرق هيظهر كرصيد مدفوع زيادة.
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

  const student = studentQ.data ?? null
  const guardian = student?.guardian_name?.trim() ? student.guardian_name : 'ولي الأمر'

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
    <Sheet open title={`إيصال ${payment.receipt_no}`} onClose={onClose}>
      <ChipRow>
        <Chip active={paper === 'a4'} onClick={() => setPaper('a4')}>
          ورق A4
        </Chip>
        <Chip active={paper === 'thermal'} onClick={() => setPaper('thermal')}>
          حراري 80mm
        </Chip>
      </ChipRow>

      <div
        className={`print-area ${paper === 'thermal' ? 'paper-thermal' : ''} bg-white text-slate-900 border border-dashed border-slate-300 rounded-xl p-4 mb-3`}
      >
        <div className="text-center border-b border-slate-200 pb-2 mb-2">
          <div className="flex justify-center mb-1.5">
            <Logo size={44} />
          </div>
          <div className="font-extrabold text-[16px]">
            {teacherNameQ.data ? teacherNameQ.data : 'إيصال دفع'}
          </div>
          <div className="text-[12px] text-slate-500">
            إيصال رقم <span dir="ltr" className="font-bold text-slate-800">{payment.receipt_no}</span>
            {' · '}
            {payment.paid_on}
          </div>
        </div>
        <div className="text-[13.5px] space-y-1">
          <div>
            الطالب: <b>{invoice.student_name}</b>
            {invoice.student_code ? (
              <>
                {' '}
                (<span dir="ltr">{invoice.student_code}</span>)
              </>
            ) : null}
          </div>
          <div>
            المجموعة: <b>{invoice.group_name}</b>
          </div>
          <div>
            الشهر: <b>{periodLabel(invoice.period_month)}</b> (<span dir="ltr">{periodYm(invoice.period_month)}</span>)
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
            <span>دفعة هذا الإيصال</span>
            <b dir="ltr">{formatMoney(payment.amount)}</b>
          </div>
          <div className="flex justify-between">
            <span>إجمالي الفاتورة</span>
            <span dir="ltr">{formatMoney(invoice.total)}</span>
          </div>
          <div className="flex justify-between">
            <span>إجمالي المدفوع</span>
            <span dir="ltr">{formatMoney(invoice.paid)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1.5 font-extrabold">
            <span>المتبقي</span>
            <span dir="ltr">
              {state === 'paid' ? 'مسدد بالكامل' : formatMoney(invoice.balance)}
            </span>
          </div>
        </div>
        <div className="text-center text-[12px] text-slate-500 mt-3">شكراً لك</div>
      </div>

      <Field label="رسالة واتساب لولي الأمر (قابلة للتحرير)">
        <TextArea
          rows={3}
          value={message ?? ''}
          onChange={(e) => setEditedMessage(e.target.value)}
          placeholder="بنجهّز الرسالة من قالب الإعدادات…"
        />
      </Field>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => window.print()}>
          <Printer size={20} />
          طباعة الإيصال
        </Button>
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noreferrer" className="flex-1 no-underline">
            <Button variant="soft" className="w-full" type="button">
              <MessageCircle size={20} />
              إرسال واتساب
            </Button>
          </a>
        )}
      </div>
      <Button full variant="ghost" onClick={onClose} className="mt-2">
        إغلاق
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
      title="تسوية حضور"
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
              {adjust.isPending ? 'بنسجل التسوية…' : 'حفظ التسوية'}
            </Button>
            <Button full variant="ghost" type="button" onClick={onClose} className="mt-2">
              إلغاء
            </Button>
          </>
        ) : undefined
      }
    >
      {sessionsQ.isPending ? (
        <p className="text-muted text-[13.5px]">بنحمّل حصص شهر الفاتورة…</p>
      ) : sessionsQ.isError ? (
        <p className="text-bad-text text-[13.5px] font-semibold">{errText(sessionsQ.error)}</p>
      ) : sessions.length === 0 ? (
        <p className="text-muted text-[13.5px]">
          مفيش حصص مسجلة لمجموعة الفاتورة في شهرها لحد النهاردة — التسوية محتاجة حصة قائمة.
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
                      ? 'اتحدثت حالة الحضور من غير فرق مالي (مفيش بند تسوية)'
                      : `اتعملت التسوية: بند ${delta > 0 ? '+' : ''}${formatMoney(delta)} اتضاف للفاتورة`,
                  ),
              },
            )
          }}
        >
          <Field label="حصة من شهر الفاتورة (حتى اليوم)">
            <Select
              value={selected?.session_id ?? ''}
              onChange={(e) => {
                setSessionId(e.target.value)
                setStatusChoice(null)
              }}
            >
              {sessions.map((s) => (
                <option key={s.session_id} value={s.session_id}>
                  {s.session_date} · {shortTime(s.start_time)} — حالياً:{' '}
                  {s.status ? STATUS_LABELS[s.status] : 'بلا حالة'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الحالة الجديدة">
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
          <Field label="سبب التسوية (إلزامي — بيظهر تحت بند التسوية في الفاتورة)">
            <TextInput
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: تصحيح غياب بالخطأ"
            />
          </Field>
          <p className="text-muted text-[13.5px] mt-0">
            الفاتورة الأصلية مش هتتعدل؛ الفرق بين الحالتين × السعر الفعلي هيتضاف كبند تسوية
            (موجب أو سالب)، وحالة الحضور نفسها هتتحدث.
          </p>
          {adjust.isError && <FormError message={errText(adjust.error)} />}
        </form>
      )}
    </Sheet>
  )
}
