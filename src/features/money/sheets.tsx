import { useState } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import { Field, Select, TextInput } from '../../components/ui/form'
import type { ExpenseRow, RecurringExpenseRow } from '../../types/database'
import { EXPENSE_CATEGORIES } from './api'
import {
  useCreateExpense,
  useCreateRecurring,
  useUpdateExpense,
  useUpdateRecurring,
} from './hooks'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'حصل خطأ غير متوقع'
}

// ---------------------------------------------------------------------------
// مصروف جديد / تعديل مصروف — المرجع §4 مودال expense:
// التاريخ (افتراضي اليوم)، الفئة من EXP_CATS (قيد المخطط)، المبلغ > 0
// إلزامي، وملحوظة اختيارية. في الإنشاء فقط: خيار «تثبيت كمصروف شهري
// متكرر» (ex-rec) يضيف قالباً مطابقاً إلى recurring_expenses بجانب
// المصروف الفعلي — كما في المرجع حرفياً. لا حقل «عنوان» في جدول
// expenses بالمخطط؛ الفئة والملحوظة هما الوصف.
// ---------------------------------------------------------------------------

export function ExpenseFormSheet({
  teacherId,
  onClose,
  onSaved,
  expense,
  defaultDate,
}: {
  teacherId: string
  onClose: () => void
  onSaved: (msg: string) => void
  /** عند التعديل: المصروف القائم؛ غيابه = إنشاء جديد */
  expense?: ExpenseRow
  /** تاريخ افتراضي للإنشاء (اليوم إن كان داخل الشهر المعروض، وإلا أوله) */
  defaultDate: string
}) {
  const isEdit = Boolean(expense)
  const [date, setDate] = useState(expense?.expense_date ?? defaultDate)
  const [category, setCategory] = useState(expense?.category ?? EXPENSE_CATEGORIES[0])
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
  const [note, setNote] = useState(expense?.note ?? '')
  const [makeRecurring, setMakeRecurring] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = useCreateExpense(teacherId)
  const update = useUpdateExpense(teacherId)
  const createRecurring = useCreateRecurring(teacherId)

  const amt = parseFloat(amount) || 0

  return (
    <Sheet open title={isEdit ? 'تعديل مصروف' : 'تسجيل مصروف'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          setBusy(true)
          const input = {
            expense_date: date,
            category,
            amount: amt,
            note: note.trim() ? note.trim() : null,
          }
          const done = (msg: string) => {
            setBusy(false)
            onSaved(msg)
          }
          const fail = (err: unknown) => {
            setBusy(false)
            setError(errText(err))
          }
          if (expense) {
            update.mutate({ expenseId: expense.id, input }, { onSuccess: () => done('اتعدّل المصروف'), onError: fail })
          } else {
            create.mutate(input, {
              onSuccess: () => {
                if (makeRecurring) {
                  createRecurring.mutate(
                    { category, amount: amt, note: input.note },
                    {
                      onSuccess: () => done('اتسجل المصروف واتثبّت كمصروف شهري متكرر'),
                      onError: fail,
                    },
                  )
                } else {
                  done('اتسجل المصروف')
                }
              },
              onError: fail,
            })
          }
        }}
      >
        <Field label="التاريخ">
          <TextInput type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="الفئة">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="المبلغ (ج)">
          <TextInput
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="ملحوظة (اختياري)">
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="مثال: إيجار قاعة شهر نوفمبر"
          />
        </Field>
        {!isEdit && (
          <label className="flex items-center gap-2 mb-3 cursor-pointer text-[15px] font-semibold">
            <input
              type="checkbox"
              className="w-5 h-5 accent-primary"
              checked={makeRecurring}
              onChange={(e) => setMakeRecurring(e.target.checked)}
            />
            تثبيت كمصروف شهري متكرر
          </label>
        )}
        {error && <p className="text-bad-text text-[13.5px] font-semibold">{error}</p>}
        <Button full type="submit" disabled={busy || !(amt > 0) || !date}>
          {busy ? 'بنسجل…' : isEdit ? 'حفظ التعديل' : 'تسجيل المصروف'}
        </Button>
        <Button full variant="ghost" type="button" onClick={onClose} className="mt-2">
          إلغاء
        </Button>
      </form>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// قالب مصروف ثابت — recurring_expenses (فئة / مبلغ / ملحوظة فقط في المخطط؛
// لا يوم استحقاق ولا مفتاح تفعيل). التطبيق على الشهور يدوي بزر
// «إضافة الثوابت» في شاشة الفلوس (انظر api.ts لقاعدة منع التكرار).
// ---------------------------------------------------------------------------

export function RecurringFormSheet({
  teacherId,
  onClose,
  onSaved,
  template,
}: {
  teacherId: string
  onClose: () => void
  onSaved: (msg: string) => void
  template?: RecurringExpenseRow
}) {
  const isEdit = Boolean(template)
  const [category, setCategory] = useState(template?.category ?? EXPENSE_CATEGORIES[0])
  const [amount, setAmount] = useState(template ? String(template.amount) : '')
  const [note, setNote] = useState(template?.note ?? '')
  const create = useCreateRecurring(teacherId)
  const update = useUpdateRecurring(teacherId)

  const amt = parseFloat(amount) || 0
  const busy = create.isPending || update.isPending

  return (
    <Sheet open title={isEdit ? 'تعديل مصروف ثابت' : 'مصروف شهري ثابت جديد'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const input = {
            category,
            amount: amt,
            note: note.trim() ? note.trim() : null,
          }
          if (template) {
            update.mutate(
              { recurringId: template.id, input },
              { onSuccess: () => onSaved('اتعدّل المصروف الثابت') },
            )
          } else {
            create.mutate(input, { onSuccess: () => onSaved('اتضاف المصروف الثابت') })
          }
        }}
      >
        <Field label="الفئة">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="المبلغ الشهري (ج)">
          <TextInput
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="ملحوظة (اختياري)">
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="مثال: إيجار القاعة الشهري"
          />
        </Field>
        <p className="text-muted text-[13.5px] mt-0">
          القالب نفسه مش مصروف فعلي؛ بيتحول لمصروفات حقيقية لما تضغط «إضافة الثوابت» في شهر
          معين من شاشة الفلوس، وكل قالب بيضاف مرة واحدة بس في الشهر (مفيش تكرار).
        </p>
        {(create.isError || update.isError) && (
          <p className="text-bad-text text-[13.5px] font-semibold">
            {errText(create.error ?? update.error)}
          </p>
        )}
        <Button full type="submit" disabled={busy || !(amt > 0)}>
          {busy ? 'بنسجل…' : isEdit ? 'حفظ التعديل' : 'إضافة القالب'}
        </Button>
        <Button full variant="ghost" type="button" onClick={onClose} className="mt-2">
          إلغاء
        </Button>
      </form>
    </Sheet>
  )
}
