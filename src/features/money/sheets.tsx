import { useState } from 'react'
import { errText } from '../../lib/supabaseErrors'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import { Field, FormError, Select, TextInput } from '../../components/ui/form'
import type { ExpenseRow, RecurringExpenseRow } from '../../types/database'
import { EXPENSE_CATEGORIES } from './api'
import {
  useCreateExpense,
  useCreateRecurring,
  useUpdateExpense,
  useUpdateRecurring,
} from './hooks'
import { t } from '../../i18n'

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
    <Sheet
      open
      title={isEdit ? t('money.expenseEditTitle') : t('money.expenseNewTitle')}
      onClose={onClose}
      footer={
        <>
          <Button full type="submit" form="expense-form" disabled={busy || !(amt > 0) || !date}>
            {busy ? t('money.expenseSaving') : isEdit ? t('money.expenseSaveEdit') : t('money.expenseSubmit')}
          </Button>
          <Button full variant="ghost" type="button" onClick={onClose} className="mt-2">
            {t('money.cancel')}
          </Button>
        </>
      }
    >
      <form
        id="expense-form"
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
            update.mutate({ expenseId: expense.id, input }, { onSuccess: () => done(t('money.expenseSavedEdit')), onError: fail })
          } else {
            create.mutate(input, {
              onSuccess: () => {
                if (makeRecurring) {
                  createRecurring.mutate(
                    { category, amount: amt, note: input.note },
                    {
                      onSuccess: () => done(t('money.expenseSavedRecurring')),
                      onError: fail,
                    },
                  )
                } else {
                  done(t('money.expenseSaved'))
                }
              },
              onError: fail,
            })
          }
        }}
      >
        <Field label={t('money.expenseDateLabel')}>
          <TextInput type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('money.expenseCategoryLabel')}>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('money.expenseAmountLabel')}>
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
        <Field label={t('money.noteOptional')}>
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('money.expenseNotePlaceholder')}
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
            {t('money.expenseMakeRecurring')}
          </label>
        )}
        {error && <FormError message={error} />}
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
    <Sheet
      open
      title={isEdit ? t('money.recurringEditTitle') : t('money.recurringNewTitle')}
      onClose={onClose}
      footer={
        <>
          <Button full type="submit" form="recurring-form" disabled={busy || !(amt > 0)}>
            {busy ? t('money.expenseSaving') : isEdit ? t('money.expenseSaveEdit') : t('money.recurringSubmit')}
          </Button>
          <Button full variant="ghost" type="button" onClick={onClose} className="mt-2">
            {t('money.cancel')}
          </Button>
        </>
      }
    >
      <form
        id="recurring-form"
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
              { onSuccess: () => onSaved(t('money.recurringSavedEdit')) },
            )
          } else {
            create.mutate(input, { onSuccess: () => onSaved(t('money.recurringSavedNew')) })
          }
        }}
      >
        <Field label={t('money.expenseCategoryLabel')}>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('money.recurringAmountLabel')}>
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
        <Field label={t('money.noteOptional')}>
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('money.recurringNotePlaceholder')}
          />
        </Field>
        <p className="text-muted text-[13.5px] mt-0">
          {t('money.recurringNoteBody')}
        </p>
        {(create.isError || update.isError) && (
          <FormError message={errText(create.error ?? update.error)} />
        )}
      </form>
    </Sheet>
  )
}
