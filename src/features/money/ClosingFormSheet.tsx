import { useState } from 'react'
import { Save } from 'lucide-react'
import { errText } from '../../lib/supabaseErrors'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import { Field, FormError, TextArea, TextInput } from '../../components/ui/form'
import { formatMoney } from '../../lib/format'
import type { DailyClosingRow } from '../../types/database'
import { diffState, DIFF_TEXT_CLS, type DaySummary } from './cashboxApi'
import { useUpsertDailyClosing } from './cashboxHooks'
import { t } from '../../i18n'

function DiffPreviewRow({
  label,
  expected,
  counted,
}: {
  label: string
  expected: number
  counted: number | null
}) {
  const diff = counted == null ? null : counted - expected
  const state = diff == null ? null : diffState(diff)
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-[13.5px] font-semibold text-muted">{label}</span>
      <span className="text-[13.5px]">
        {t('money.cashboxExpected')} <b dir="ltr">{formatMoney(expected)}</b>
        {' · '}
        {diff == null || state == null ? (
          <span className="text-muted">{t('money.closingDiffPending')}</span>
        ) : (
          <b dir="ltr" className={DIFF_TEXT_CLS[state]}>
            {diff > 0.005 ? `+${formatMoney(diff)}` : formatMoney(diff)}
          </b>
        )}
      </span>
    </div>
  )
}

/**
 * نموذج إغلاق/إعادة فتح يوم — daily_closings عبر upsert على (teacher_id,
 * closing_date): أول حفظ ينشئ سجل اليوم، وأي حفظ لاحق لنفس اليوم يعدّل
 * نفس السجل (المعدود + لقطة المتوقع الحالية + الملحوظة).
 *
 * • المعدود النقدي يُدخل يدوياً دائماً (هو جوهر الإغلاق) فلا يُملأ مسبقاً
 *   إلا عند تعديل إغلاق قائم (قيمته المحفوظة).
 * • المعدود الإلكتروني عند إغلاق جديد يُملأ مسبقاً بالمتوقع (القنوات
 *   الإلكترونية تُراجع من كشوف فودافون كاش/إنستاباي/البنك، فالأصل تطابقها)
 *   ويبقى قابلاً للتعديل إن أظهر الكشف فرقاً.
 * • الفرق يُحسب حياً أثناء الكتابة لكل قناة وللإجمالي، ويُحفظ السجل
 *   بلقطة المتوقع المعروضة هنا وقت الحفظ.
 * • closed_by = معرّف المالك نفسه: الشاشة للمالك فقط (RLS بلا سياسة
 *   مساعد على الجدول)، و teacherId هنا هو حساب المالك ذاته.
 */
export function ClosingFormSheet({
  teacherId,
  summary,
  closing,
  onClose,
  onSaved,
}: {
  teacherId: string
  /** ملخص اليوم الحي — لقطة المتوقع التي ستُحفظ مع الإغلاق */
  summary: DaySummary
  /** الإغلاق المحفوظ لليوم إن وُجد (وضع التعديل/إعادة الفتح) */
  closing: DailyClosingRow | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const isEdit = Boolean(closing)
  const [countedCash, setCountedCash] = useState(
    closing ? String(closing.counted_cash) : '',
  )
  const [countedElectronic, setCountedElectronic] = useState(
    closing ? String(closing.counted_electronic) : String(summary.electronic),
  )
  const [note, setNote] = useState(closing?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const upsert = useUpsertDailyClosing(teacherId)

  const cashVal = countedCash.trim() === '' ? null : parseFloat(countedCash)
  const elecVal = countedElectronic.trim() === '' ? null : parseFloat(countedElectronic)
  const cashOk = cashVal != null && Number.isFinite(cashVal) && cashVal >= 0
  const elecOk = elecVal != null && Number.isFinite(elecVal) && elecVal >= 0
  const valid = cashOk && elecOk
  const totalDiff =
    valid && cashVal != null && elecVal != null
      ? cashVal + elecVal - (summary.cash + summary.electronic)
      : null
  const totalState = totalDiff == null ? null : diffState(totalDiff)

  return (
    <Sheet
      open
      title={isEdit ? t('money.closingEditTitle') : t('money.cashboxCloseDay')}
      onClose={onClose}
      footer={
        <>
          <Button
            full
            type="submit"
            form="closing-form"
            disabled={upsert.isPending || !valid}
          >
            <Save size={18} />
            {upsert.isPending ? t('money.closingSaving') : isEdit ? t('money.closingSaveEdit') : t('money.closingSave')}
          </Button>
          <Button full variant="ghost" type="button" onClick={onClose} className="mt-2">
            {t('money.cancel')}
          </Button>
        </>
      }
    >
      <form
        id="closing-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid || cashVal == null || elecVal == null) return
          setError(null)
          upsert.mutate(
            {
              closedBy: teacherId,
              input: {
                closing_date: summary.date,
                expected_cash: summary.cash,
                expected_electronic: summary.electronic,
                expenses_total: summary.expenses,
                counted_cash: cashVal,
                counted_electronic: elecVal,
                note: note.trim() ? note.trim() : null,
              },
            },
            {
              onSuccess: () =>
                onSaved(isEdit ? t('money.closingSavedEdit') : t('money.closingSavedNew')),
              onError: (err) => setError(errText(err)),
            },
          )
        }}
      >
        <div className="rounded-xl bg-soft/60 px-3 py-2 mb-3">
          <DiffPreviewRow label={t('money.cashboxCash')} expected={summary.cash} counted={cashOk ? cashVal : null} />
          <DiffPreviewRow
            label={t('money.closingElectronic')}
            expected={summary.electronic}
            counted={elecOk ? elecVal : null}
          />
          <div className="border-t border-border mt-1 pt-2 flex items-center justify-between gap-2">
            <span className="text-[13.5px] font-bold">{t('money.closingTotalDiffLabel')}</span>
            {totalDiff == null || totalState == null ? (
              <span className="text-muted text-[13.5px]">—</span>
            ) : (
              <b dir="ltr" className={`text-[15px] ${DIFF_TEXT_CLS[totalState]}`}>
                {totalDiff > 0.005 ? `+${formatMoney(totalDiff)}` : formatMoney(totalDiff)}
              </b>
            )}
          </div>
          {summary.expenses > 0 && (
            <p className="text-muted text-[13.5px] mb-0 mt-1">
              {t('money.cashboxDayExpenses')} <b dir="ltr">{formatMoney(summary.expenses)}</b> {t('money.closingExpensesNoteSuffix')}
            </p>
          )}
        </div>

        <Field label={t('money.closingCountedCashLabel')}>
          <TextInput
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            required
            value={countedCash}
            onChange={(e) => setCountedCash(e.target.value)}
            placeholder={String(summary.cash)}
          />
        </Field>
        <Field label={t('money.closingCountedElectronicLabel')}>
          <TextInput
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            required
            value={countedElectronic}
            onChange={(e) => setCountedElectronic(e.target.value)}
            placeholder={String(summary.electronic)}
          />
        </Field>
        <Field label={t('money.noteOptional')}>
          <TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('money.closingNotePlaceholder')}
            rows={2}
          />
        </Field>
        {isEdit && (
          <p className="text-muted text-[13.5px] mt-0">
            {t('money.closingEditNote')}
          </p>
        )}
        {error && <FormError message={error} />}
      </form>
    </Sheet>
  )
}
