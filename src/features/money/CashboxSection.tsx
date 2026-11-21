import { useMemo, useState } from 'react'
import { formatDateTimeAr } from '../../lib/format'
import { Banknote, CalendarDays, CheckCircle2, ReceiptText } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { TextInput } from '../../components/ui/form'
import { ErrorState, SkeletonCards } from '../../components/ui/states'
import { useToast } from '../../components/ui/toast'
import { formatMoney } from '../../lib/format'
import type { DailyClosingRow } from '../../types/database'
import { addDaysStr, todayStr } from '../home/api'
import { PAYMENT_METHODS } from '../invoices/api'
import { formatDateLabel } from '../schedule/api'
import { diffOf, diffState } from './cashboxApi'
import { useDailyClosing, useDailyClosings, useDaySummary } from './cashboxHooks'
import { ClosingFormSheet } from './ClosingFormSheet'
import { DiffBadge } from './diffUi'
import { t } from '../../i18n'

function SummaryCell({
  label,
  value,
  valueClass = '',
  sub,
}: {
  label: string
  value: string
  valueClass?: string
  sub?: string
}) {
  return (
    <div className="rounded-xl bg-soft/50 px-3 py-2.5 text-center">
      <b className={`block text-[17px] font-extrabold leading-tight tabular-nums ${valueClass}`} dir="ltr">
        {value}
      </b>
      <span className="block text-muted text-[12px] font-semibold mt-0.5">{label}</span>
      {sub && <span className="block text-muted text-[12px] mt-0.5">{sub}</span>}
    </div>
  )
}

/** صف يوم مغلق في السجل: التاريخ + إجمالي الفرق بشارته + المتوقع/المعدود */
function ClosingHistoryRow({
  closing,
  selected,
  onSelect,
}: {
  closing: DailyClosingRow
  selected: boolean
  onSelect: () => void
}) {
  const diff = diffOf(closing)
  const expectedTotal = closing.expected_cash + closing.expected_electronic
  const countedTotal = closing.counted_cash + closing.counted_electronic
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-start rounded-xl px-3 py-2.5 mb-1.5 border cursor-pointer ${
        selected ? 'border-primary bg-soft' : 'border-transparent hover:bg-soft'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-[13.5px]">{formatDateLabel(closing.closing_date)}</span>
        <DiffBadge diff={diff.total} />
      </div>
      <div className="flex justify-between text-[12px] text-muted mt-1">
        <span>
          {t('money.cashboxExpected')} <span dir="ltr">{formatMoney(expectedTotal)}</span>
        </span>
        <span>
          {t('money.cashboxCounted')} <span dir="ltr">{formatMoney(countedTotal)}</span>
        </span>
        <span className={diffState(diff.cash) === 'match' ? '' : 'font-semibold'}>
          {t('money.cashboxCash')} <span dir="ltr">{formatMoney(diff.cash)}</span>
        </span>
      </div>
      {closing.note && (
        <div className="text-[12px] text-muted mt-0.5 truncate">{closing.note}</div>
      )}
    </button>
  )
}

/**
 * قسم الإغلاق اليومي للخزنة (Phase 2 — الخطوة 5) — داخل شاشة الفلوس،
 * فوق الملخص الشهري: الإغلاق إيقاع يومي مستقل عن تنقّل الشهور، فموضعه
 * هنا يجعله أول ما يراه المالك عند فتح الشاشة، وبياناته تُحسب حياً
 * لليوم المختار (اليوم الحالي افتراضياً، وأي يوم سابق من منتقي التاريخ
 * أو من سجل الإغلاقات). راجع cashboxApi.ts لتعريف المتوقع حرفياً.
 * المالية للمالك فقط: الشاشة الأم لا تعرض القسم للمساعد أصلاً، وRLS
 * على daily_closings/payments/expenses تمنعه في القاعدة نفسها.
 */
export function CashboxSection({ teacherId }: { teacherId: string }) {
  const today = todayStr()
  const [selectedDate, setSelectedDate] = useState(today)
  const [sheetOpen, setSheetOpen] = useState(false)
  const toast = useToast()

  const summaryQ = useDaySummary(teacherId, selectedDate, true)
  const closingQ = useDailyClosing(teacherId, selectedDate, true)
  const closingsQ = useDailyClosings(teacherId, true)

  const summary = summaryQ.data
  const closing = closingQ.data ?? null
  const closings = useMemo(() => closingsQ.data ?? [], [closingsQ.data])

  const pending = summaryQ.isPending || closingQ.isPending
  const error = summaryQ.error ?? closingQ.error ?? closingsQ.error
  const isToday = selectedDate === today
  const liveDiff =
    closing && summary
      ? diffOf({
          counted_cash: closing.counted_cash,
          counted_electronic: closing.counted_electronic,
          expected_cash: summary.cash,
          expected_electronic: summary.electronic,
        })
      : null
  // هل تغيّر متوقع اليوم الحي عن اللقطة المحفوظة وقت الإغلاق؟
  const snapshotStale =
    closing != null &&
    summary != null &&
    (Math.abs(closing.expected_cash - summary.cash) >= 0.005 ||
      Math.abs(closing.expected_electronic - summary.electronic) >= 0.005)

  return (
    <section aria-label={t('money.cashboxTitle')} className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Banknote size={22} className="text-primary" />
        <h2 className="type-section">{t('money.cashboxTitle')}</h2>
      </div>

      {/* اختيار اليوم: على الموبايل منتقي التاريخ في صف كامل أولاً ثم
          زرا التنقل نصفين تحته — الصف الواحد القديم كان يقصّ قيمة التاريخ
          («11/20/2…») لأن لحقل التاريخ حداً أدنى ذاتياً لا ينكمش */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Button
          variant="ghost"
          className="flex-1 min-[480px]:flex-none"
          onClick={() => setSelectedDate(addDaysStr(selectedDate, -1))}
        >
          {t('money.cashboxPrevDay')}
        </Button>
        <div className="order-first w-full min-[480px]:order-none min-[480px]:w-auto min-[480px]:flex-1 min-w-0">
          <TextInput
            type="date"
            aria-label={t('money.cashboxDayAria')}
            max={today}
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) setSelectedDate(e.target.value)
            }}
          />
        </div>
        <Button
          variant="ghost"
          className="flex-1 min-[480px]:flex-none"
          disabled={isToday}
          onClick={() => setSelectedDate(addDaysStr(selectedDate, 1))}
        >
          {t('money.cashboxNextDay')}
        </Button>
      </div>
      <div className="text-center font-bold text-[13.5px] text-muted -mt-1 mb-3">
        {formatDateLabel(selectedDate)}
        {isToday ? t('money.cashboxTodaySuffix') : ''}
      </div>

      {pending ? (
        <SkeletonCards cards={2} />
      ) : error ? (
        <ErrorState
          message={error instanceof Error ? error.message : t('common.unknownError')}
          onRetry={() => {
            void summaryQ.refetch()
            void closingQ.refetch()
            void closingsQ.refetch()
          }}
        />
      ) : summary ? (
        <>
          <Card>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <SummaryCell label={t('money.cashboxExpectedCash')} value={formatMoney(summary.cash)} valueClass="text-ok-text" />
              <SummaryCell
                label={t('money.cashboxExpectedElectronic')}
                value={formatMoney(summary.electronic)}
                valueClass="text-ok-text"
              />
              <SummaryCell
                label={t('money.cashboxDayTotal')}
                value={formatMoney(summary.total)}
                sub={`${t('money.cashboxPaymentsSub', { count: summary.paymentCount })}${summary.reversalCount > 0 ? t('money.cashboxReversalsSuffix', { count: summary.reversalCount }) : ''}`}
              />
              <SummaryCell
                label={t('money.cashboxDayExpenses')}
                value={formatMoney(summary.expenses)}
                valueClass={summary.expenses > 0 ? 'text-bad-text' : ''}
                sub={summary.expensesCount > 0 ? t('money.cashboxExpensesSub', { count: summary.expensesCount }) : t('money.cashboxNoExpenses')}
              />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 mb-3">
              <span className="text-[13.5px] font-bold">{t('money.cashboxDayNet')}</span>
              <b dir="ltr" className={`text-[15px] ${summary.net < 0 ? 'text-bad-text' : ''}`}>
                {formatMoney(summary.net)}
              </b>
            </div>

            {/* تفصيل الطرق الإلكترونية */}
            <div className="text-[13.5px] text-muted mb-3">
              {PAYMENT_METHODS.map((m) => (
                <div key={m.code} className="flex justify-between py-0.5">
                  <span>{m.label}</span>
                  <b dir="ltr" className="text-text">{formatMoney(summary.byMethod[m.code])}</b>
                </div>
              ))}
            </div>

            {/* حالة إغلاق اليوم المختار */}
            {closing ? (
              <div className="rounded-xl bg-ok-soft/60 border border-ok/30 px-3 py-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 font-bold text-[14px] text-ok-text">
                    <CheckCircle2 size={18} />
                    {t('money.cashboxClosedTitle')}
                  </span>
                  {liveDiff && <DiffBadge diff={liveDiff.total} />}
                </div>
                <div className="text-[13.5px] mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  <span className="text-muted">{t('money.cashboxCountedCash')}</span>
                  <b dir="ltr" className="text-start">{formatMoney(closing.counted_cash)}</b>
                  <span className="text-muted">{t('money.cashboxCountedElectronic')}</span>
                  <b dir="ltr" className="text-start">{formatMoney(closing.counted_electronic)}</b>
                  <span className="text-muted">{t('money.cashboxDiffAtClosing')}</span>
                  <span className="text-start">
                    <DiffBadge diff={diffOf(closing).total} />
                  </span>
                </div>
                {snapshotStale && liveDiff && (
                  <p className="text-warn-text bg-warn-soft rounded-lg px-2.5 py-2 text-[13.5px] font-semibold mb-0 mt-2">
                    {t('money.cashboxStalePrefix')}{' '}
                    <span dir="ltr">{formatMoney(liveDiff.total)}</span> {t('money.cashboxStaleMiddle')}{' '}
                    <span dir="ltr">{formatMoney(diffOf(closing).total)}</span> {t('money.cashboxStaleSuffix')}
                  </p>
                )}
                {closing.note && (
                  <p className="text-[13.5px] mb-0 mt-2">{t('money.cashboxNotePrefix')} {closing.note}</p>
                )}
                <p className="text-muted text-[12px] mb-0 mt-2">
                  {t('money.cashboxLastSaved', { date: formatDateTimeAr(closing.updated_at) })}
                  {closing.updated_at !== closing.created_at
                    ? t('money.cashboxFirstClosingSuffix', { date: formatDateTimeAr(closing.created_at) })
                    : ''}
                </p>
                <Button full variant="soft" className="mt-3" onClick={() => setSheetOpen(true)}>
                  {t('money.cashboxEditClosing')}
                </Button>
              </div>
            ) : (
              <div className="rounded-xl bg-warn-soft/70 border border-warn/40 px-3 py-3">
                <div className="font-bold text-[14px] text-warn-text mb-1">{t('money.cashboxNotClosedTitle')}</div>
                <p className="text-[13.5px] mb-3">
                  {t('money.cashboxNotClosedHint')}
                </p>
                <Button full onClick={() => setSheetOpen(true)}>
                  {t('money.cashboxCloseDay')}
                </Button>
              </div>
            )}
          </Card>

          {/* سجل الإغلاقات السابقة */}
          <div className="flex items-center gap-2 mt-4 mb-2">
            <CalendarDays size={20} className="text-primary" />
            <h3 className="type-section">{t('money.cashboxHistoryTitle')}</h3>
          </div>
          {closingsQ.isPending ? (
            <SkeletonCards cards={2} />
          ) : closings.length === 0 ? (
            <Card>
              <EmptyState
                icon={ReceiptText}
                title={t('money.cashboxHistoryEmptyTitle')}
                hint={t('money.cashboxHistoryEmptyHint')}
              />
            </Card>
          ) : (
            <Card>
              {closings.map((c) => (
                <ClosingHistoryRow
                  key={c.id}
                  closing={c}
                  selected={c.closing_date === selectedDate}
                  onSelect={() => setSelectedDate(c.closing_date)}
                />
              ))}
              <p className="text-muted text-[13.5px] mb-0 mt-1">
                {t('money.cashboxHistoryNote')}
              </p>
            </Card>
          )}
        </>
      ) : null}

      {sheetOpen && summary && (
        <ClosingFormSheet
          teacherId={teacherId}
          summary={summary}
          closing={closing}
          onClose={() => setSheetOpen(false)}
          onSaved={(msg) => {
            setSheetOpen(false)
            toast(msg)
          }}
        />
      )}
    </section>
  )
}
