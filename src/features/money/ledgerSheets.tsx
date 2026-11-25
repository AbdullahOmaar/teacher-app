import { useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { errText } from '../../lib/supabaseErrors'
import { formatMoney } from '../../lib/format'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import { Field, FormError, Select, TextInput } from '../../components/ui/form'
import { t } from '../../i18n'
import type { PaymentMethod, SupplierRow } from '../../types/database'
import { PAYMENT_METHOD_LABELS } from '../invoices/api'
import { useStudents } from '../students/hooks'
import { todayStr } from '../home/api'
import {
  linesError,
  linesTotal,
  salePaymentError,
  type LedgerLine,
} from './ledgerCalc'
import {
  useCreatePurchase,
  useCreateSale,
  useCreateSupplier,
  useRecordPurchasePayment,
  useSuppliers,
  useUpdateSaleCollected,
  useUpdateSupplier,
} from './ledgerHooks'
import type { PurchaseListItem, SaleListItem } from './ledgerApi'

const METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]

// ---------------------------------------------------------------------------
// محرر بنود مشترك (شراء/بيع): وصف + كمية + سعر وحدة، والإجمالي حي أثناء
// الكتابة من نفس دوال ledgerCalc التي تحسب أرصدة القاعدة — فلا يرى المدرس
// رقماً مختلفاً عما ستحفظه الـ view. أزرار الصف (حذف بند/إضافة بند) في صف
// أفقي دائماً طبقاً لقاعدة المالك لأزرار الواجهة.
// ---------------------------------------------------------------------------

function LinesEditor({
  lines,
  onChange,
}: {
  lines: LedgerLine[]
  onChange: (lines: LedgerLine[]) => void
}) {
  const set = (i: number, patch: Partial<LedgerLine>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  return (
    <div>
      {lines.map((line, i) => (
        <div key={i} className="mb-2 rounded-xl border border-line p-2">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <TextInput
                placeholder={t('money.ledgerLineDesc')}
                value={line.description}
                onChange={(e) => set(i, { description: e.target.value })}
                aria-label={t('money.ledgerLineDesc')}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={lines.length === 1}
              onClick={() => onChange(lines.filter((_, j) => j !== i))}
              aria-label={t('money.ledgerRemoveLine')}
            >
              <Trash2 size={16} />
            </Button>
          </div>
          <div className="mt-2 flex gap-2">
            <div className="flex-1">
              <TextInput
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder={t('money.ledgerLineQty')}
                value={line.quantity || ''}
                onChange={(e) => set(i, { quantity: parseFloat(e.target.value) || 0 })}
                aria-label={t('money.ledgerLineQty')}
              />
            </div>
            <div className="flex-1">
              <TextInput
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder={t('money.ledgerLinePrice')}
                value={line.unit_price || ''}
                onChange={(e) => set(i, { unit_price: parseFloat(e.target.value) || 0 })}
                aria-label={t('money.ledgerLinePrice')}
              />
            </div>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="soft"
          size="sm"
          onClick={() => onChange([...lines, { description: '', quantity: 1, unit_price: 0 }])}
        >
          <Plus size={16} />
          {t('money.ledgerAddLine')}
        </Button>
        <span className="text-sm font-bold">
          {t('money.ledgerTotal')}: {formatMoney(linesTotal(lines))}
        </span>
      </div>
    </div>
  )
}

function linesErrorText(lines: LedgerLine[]): string | null {
  const err = linesError(lines)
  if (!err) return null
  return t(
    err === 'empty'
      ? 'money.ledgerLinesEmpty'
      : err === 'description'
        ? 'money.ledgerLinesDesc'
        : err === 'quantity'
          ? 'money.ledgerLinesQty'
          : 'money.ledgerLinesPrice',
  )
}

function SheetFooter({
  busy,
  disabled,
  submitLabel,
  formId,
  onClose,
}: {
  busy: boolean
  disabled: boolean
  submitLabel: string
  formId: string
  onClose: () => void
}) {
  return (
    <div className="flex gap-2">
      <Button className="flex-1" type="submit" form={formId} disabled={busy || disabled}>
        <Save size={18} />
        {submitLabel}
      </Button>
      <Button variant="ghost" type="button" onClick={onClose}>
        {t('money.cancel')}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// عملية شراء جديدة — RPC ‏create_purchase الذرّية (رأس + بنود)
// ---------------------------------------------------------------------------

export function PurchaseFormSheet({
  teacherId,
  onClose,
  onSaved,
}: {
  teacherId: string
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const suppliersQ = useSuppliers(teacherId, true)
  const create = useCreatePurchase(teacherId)
  const [supplierId, setSupplierId] = useState('')
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<LedgerLine[]>([{ description: '', quantity: 1, unit_price: 0 }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lineErr = linesErrorText(lines)

  return (
    <Sheet
      open
      title={t('money.ledgerNewPurchaseTitle')}
      onClose={onClose}
      footer={
        <SheetFooter
          busy={busy}
          disabled={Boolean(lineErr) || !date}
          submitLabel={busy ? t('money.ledgerSaving') : t('money.ledgerSubmitPurchase')}
          formId="purchase-form"
          onClose={onClose}
        />
      }
    >
      <form
        id="purchase-form"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          setBusy(true)
          create.mutate(
            {
              supplierId: supplierId || null,
              purchaseDate: date,
              note: note.trim() ? note.trim() : null,
              lines,
            },
            {
              onSuccess: () => {
                setBusy(false)
                onSaved(t('money.ledgerSavedPurchase'))
              },
              onError: (err) => {
                setBusy(false)
                setError(errText(err))
              },
            },
          )
        }}
      >
        <Field label={t('money.ledgerSupplier')}>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">{t('money.ledgerNoSupplier')}</option>
            {(suppliersQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('money.ledgerDate')}>
          <TextInput type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('money.ledgerLines')}>
          <LinesEditor lines={lines} onChange={setLines} />
        </Field>
        {lineErr && <FormError message={lineErr} />}
        <Field label={t('money.noteOptional')}>
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <FormError message={error} />}
      </form>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// عملية بيع جديدة — RPC ‏create_sale الذرّية؛ المشتري طالب مسجل أو اسم حر
// ---------------------------------------------------------------------------

export function SaleFormSheet({
  teacherId,
  onClose,
  onSaved,
}: {
  teacherId: string
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const studentsQ = useStudents(teacherId)
  const create = useCreateSale(teacherId)
  const [studentId, setStudentId] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [date, setDate] = useState(todayStr())
  const [amountPaid, setAmountPaid] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<LedgerLine[]>([{ description: '', quantity: 1, unit_price: 0 }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lineErr = linesErrorText(lines)
  const total = linesTotal(lines)
  const paid = parseFloat(amountPaid) || 0
  const payErr = salePaymentError(total, paid)

  return (
    <Sheet
      open
      title={t('money.ledgerNewSaleTitle')}
      onClose={onClose}
      footer={
        <SheetFooter
          busy={busy}
          disabled={Boolean(lineErr) || Boolean(payErr) || !date}
          submitLabel={busy ? t('money.ledgerSaving') : t('money.ledgerSubmitSale')}
          formId="sale-form"
          onClose={onClose}
        />
      }
    >
      <form
        id="sale-form"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          setBusy(true)
          create.mutate(
            {
              studentId: studentId || null,
              buyerName: studentId ? null : buyerName.trim() || null,
              saleDate: date,
              amountPaid: paid,
              note: note.trim() ? note.trim() : null,
              lines,
            },
            {
              onSuccess: () => {
                setBusy(false)
                onSaved(t('money.ledgerSavedSale'))
              },
              onError: (err) => {
                setBusy(false)
                setError(errText(err))
              },
            },
          )
        }}
      >
        <Field label={t('money.ledgerBuyerStudent')}>
          <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">{t('money.ledgerBuyerFree')}</option>
            {(studentsQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        {!studentId && (
          <Field label={t('money.ledgerBuyerName')}>
            <TextInput value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
          </Field>
        )}
        <Field label={t('money.ledgerDate')}>
          <TextInput type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('money.ledgerLines')}>
          <LinesEditor lines={lines} onChange={setLines} />
        </Field>
        {lineErr && <FormError message={lineErr} />}
        <Field label={t('money.ledgerAmountPaidNow')}>
          <TextInput
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
          />
        </Field>
        {payErr && (
          <FormError
            message={t(payErr === 'exceeds' ? 'money.ledgerPaidExceeds' : 'money.ledgerPaidNegative')}
          />
        )}
        <Field label={t('money.noteOptional')}>
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <FormError message={error} />}
      </form>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// دفعة لمورد — دفتر purchase_payments: إدخال فقط؛ التصحيح بقيد سالب من
// نفس النموذج (مبلغ سالب) كما في فلسفة payments.
// ---------------------------------------------------------------------------

export function PurchasePaymentSheet({
  teacherId,
  purchase,
  onClose,
  onSaved,
}: {
  teacherId: string
  purchase: PurchaseListItem
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const record = useRecordPurchasePayment(teacherId)
  const [amount, setAmount] = useState(
    purchase.balance.remaining > 0 ? String(purchase.balance.remaining) : '',
  )
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const amt = parseFloat(amount) || 0

  return (
    <Sheet
      open
      title={t('money.ledgerPaymentTitle')}
      onClose={onClose}
      footer={
        <SheetFooter
          busy={busy}
          disabled={amt === 0 || !date}
          submitLabel={busy ? t('money.ledgerSaving') : t('money.ledgerSubmitPayment')}
          formId="purchase-payment-form"
          onClose={onClose}
        />
      }
    >
      <p className="mb-3 text-sm text-muted">
        {t('money.ledgerPaymentSummary', {
          total: formatMoney(purchase.balance.total),
          paid: formatMoney(purchase.balance.paid),
          remaining: formatMoney(purchase.balance.remaining),
        })}
      </p>
      <form
        id="purchase-payment-form"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          setBusy(true)
          record.mutate(
            {
              purchaseId: purchase.id,
              amount: amt,
              method,
              paidOn: date,
              note: note.trim() ? note.trim() : null,
            },
            {
              onSuccess: () => {
                setBusy(false)
                onSaved(t('money.ledgerPaymentSaved'))
              },
              onError: (err) => {
                setBusy(false)
                setError(errText(err))
              },
            },
          )
        }}
      >
        <Field label={t('money.ledgerPaymentAmount')}>
          <TextInput
            type="number"
            step="0.01"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <p className="mb-2 text-xs text-muted">{t('money.ledgerPaymentReversalHint')}</p>
        <Field label={t('money.ledgerPaymentMethod')}>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('money.ledgerDate')}>
          <TextInput type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('money.noteOptional')}>
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <FormError message={error} />}
      </form>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// تحصيل لاحق من بيع آجل — تحديث amount_paid بالمجموع الجديد
// ---------------------------------------------------------------------------

export function SaleCollectSheet({
  sale,
  onClose,
  onSaved,
}: {
  sale: SaleListItem
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const collect = useUpdateSaleCollected()
  const [extra, setExtra] = useState(sale.balance.remaining > 0 ? String(sale.balance.remaining) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const add = parseFloat(extra) || 0
  const newPaid = sale.balance.paid + add
  const payErr = salePaymentError(sale.balance.total, newPaid)

  return (
    <Sheet
      open
      title={t('money.ledgerCollectTitle')}
      onClose={onClose}
      footer={
        <SheetFooter
          busy={busy}
          disabled={!(add > 0) || Boolean(payErr)}
          submitLabel={busy ? t('money.ledgerSaving') : t('money.ledgerSubmitCollect')}
          formId="sale-collect-form"
          onClose={onClose}
        />
      }
    >
      <p className="mb-3 text-sm text-muted">
        {t('money.ledgerPaymentSummary', {
          total: formatMoney(sale.balance.total),
          paid: formatMoney(sale.balance.paid),
          remaining: formatMoney(sale.balance.remaining),
        })}
      </p>
      <form
        id="sale-collect-form"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          setBusy(true)
          collect.mutate(
            { saleId: sale.id, amountPaid: newPaid },
            {
              onSuccess: () => {
                setBusy(false)
                onSaved(t('money.ledgerCollectedSaved'))
              },
              onError: (err) => {
                setBusy(false)
                setError(errText(err))
              },
            },
          )
        }}
      >
        <Field label={t('money.ledgerCollectAmount')}>
          <TextInput
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            required
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
        </Field>
        {payErr && <FormError message={t('money.ledgerPaidExceeds')} />}
        {error && <FormError message={error} />}
      </form>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// مورد جديد / تعديل مورد
// ---------------------------------------------------------------------------

export function SupplierFormSheet({
  teacherId,
  supplier,
  onClose,
  onSaved,
}: {
  teacherId: string
  supplier?: SupplierRow
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const create = useCreateSupplier(teacherId)
  const update = useUpdateSupplier()
  const [name, setName] = useState(supplier?.name ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [note, setNote] = useState(supplier?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Sheet
      open
      title={supplier ? t('money.ledgerSupplierEditTitle') : t('money.ledgerSupplierNewTitle')}
      onClose={onClose}
      footer={
        <SheetFooter
          busy={busy}
          disabled={!name.trim()}
          submitLabel={busy ? t('money.ledgerSaving') : t('money.ledgerSubmitSupplier')}
          formId="supplier-form"
          onClose={onClose}
        />
      }
    >
      <form
        id="supplier-form"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          setBusy(true)
          const input = {
            name: name.trim(),
            phone: phone.trim() ? phone.trim() : null,
            note: note.trim() ? note.trim() : null,
          }
          const ok = () => {
            setBusy(false)
            onSaved(t('money.ledgerSavedSupplier'))
          }
          const fail = (err: unknown) => {
            setBusy(false)
            setError(errText(err))
          }
          if (supplier) update.mutate({ id: supplier.id, input }, { onSuccess: ok, onError: fail })
          else create.mutate(input, { onSuccess: ok, onError: fail })
        }}
      >
        <Field label={t('money.ledgerSupplierName')}>
          <TextInput required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('money.ledgerSupplierPhone')}>
          <TextInput
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label={t('money.noteOptional')}>
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <FormError message={error} />}
      </form>
    </Sheet>
  )
}
