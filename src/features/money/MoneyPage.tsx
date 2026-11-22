import { invalidatePrefixes } from '../../lib/invalidate'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { t } from '../../i18n'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import { Card } from '../../components/ui/Card'
import { Building2, Lock, Pin, Plus, Wallet } from 'lucide-react'
import { useToast } from '../../components/ui/toast'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatMoney } from '../../lib/format'
import type { ExpenseRow, RecurringExpenseRow } from '../../types/database'
import { PageToolBar, StickyGroupHeader } from '../../components/ui/PageToolBar'
import { Chip } from '../../components/ui/form'
import { monthStartStr, todayStr } from '../home/api'
import { periodLabel } from '../invoices/api'
import { formatDateLabel } from '../schedule/api'
import { lastSixMonths, summaryOf, type MonthSummary } from './api'
import { CashboxSection } from './CashboxSection'
import {
  MONEY,
  useApplyRecurring,
  useCenterSharePercent,
  useDeleteExpense,
  useDeleteRecurring,
  useMonthExpenses,
  useMonthlyProfit,
  useRecurringExpenses,
} from './hooks'
import { ExpenseFormSheet, RecurringFormSheet } from './sheets'

function Kpi({ value, label, valueClass = '' }: { value: string; label: string; valueClass?: string }) {
  return (
    <Card className="mb-0 text-center h-full">
      {/* (3A-331 عائلة ب — قاعدة صارمة: رقم مالي لا يُقصّ بنقاط حذف أبداً):
          كان whitespace-nowrap + overflow-hidden + text-ellipsis يقصّ
          «1,644.5 ج» إلى «…644.5» بلا عملة عند 360 و390 معاً. الاختيار:
          الالتفاف (break-words) بدل القصّ — الرقم نفسه كتلة واحدة تلتف
          للسطر التالي سليمةً متى ضاق العمود، والعملة قد تلتف بعده، فتظهر
          القيمة كاملة دائماً مهما كبر المبلغ (nowrap كان سيفيض أفقياً
          مع مبالغ أكبر داخل عمود ~72px صافياً بعد حشوة البطاقة) */}
      <b className={`block break-words text-[clamp(14px,4.6vw,19px)] font-extrabold leading-tight ${valueClass}`}>{value}</b>
      <span className="block text-muted text-[12px] font-semibold mt-0.5">{label}</span>
    </Card>
  )
}

/** صف شهر في «آخر 6 شهور»: شريطان (أخضر محصّل / أحمر مصروفات) + الصافي */
function MonthBarRow({
  row,
  maxVal,
  selected,
  onSelect,
}: {
  row: MonthSummary
  maxVal: number
  selected: boolean
  onSelect: () => void
}) {
  const collectedPct = Math.round((row.collected / maxVal) * 100)
  const expensesPct = Math.round((row.expenses / maxVal) * 100)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-start rounded-xl px-3 py-2.5 mb-1.5 border cursor-pointer ${
        selected ? 'border-primary bg-soft' : 'border-transparent hover:bg-soft'
      }`}
    >
      <div className="flex justify-between items-center gap-2 mb-1.5">
        <span className="font-bold text-[13.5px]">{periodLabel(row.month)}</span>
        {/* (3A-331 عائلة ب): صافي الشهر مبلغ — nowrap + shrink-0 حتى لا
            ينكسر الرقم عن عملته ولا ينضغط داخل صف العنوان المرن */}
        <span
          className={`text-[13.5px] font-extrabold whitespace-nowrap shrink-0 ${row.net_profit < 0 ? 'text-bad-text' : 'text-ok-text'}`}
          dir="ltr"
        >
          {formatMoney(row.net_profit)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-border/50 overflow-hidden mb-1">
        <div className="h-full rounded-full bg-ok" style={{ width: `${collectedPct}%` }} />
      </div>
      <div className="h-2 rounded-full bg-border/50 overflow-hidden">
        <div className="h-full rounded-full bg-bad" style={{ width: `${expensesPct}%` }} />
      </div>
      <div className="flex justify-between flex-wrap gap-x-2 text-[12px] text-muted mt-1">
        <span>
          {t('money.barCollected')} <span dir="ltr" className="whitespace-nowrap">{formatMoney(row.collected)}</span>
        </span>
        <span>
          {t('money.barExpenses')} <span dir="ltr" className="whitespace-nowrap">{formatMoney(row.expenses)}</span>
        </span>
      </div>
    </button>
  )
}

/**
 * المصروفات والأرباح (المواصفات §3.12): ملخص الشهر المختار من view
 * ‏monthly_profit في المخطط — المحصّل من payments، المصروفات من expenses،
 * نسبة السنتر = النسبة % من محصّل الشهر (teacher_settings)، وصافي الربح =
 * المحصّل − المصروفات − نسبة السنتر (أحمر إن سالب) — ثم آخر 6 شهور بأشرطة
 * مزدوجة، وقائمة مصروفات الشهر مع إضافة/تعديل/حذف، وقوالب المصروفات
 * الثابتة مع زر «إضافة الثوابت» (تطبيق يدوي بلا تكرار — انظر api.ts).
 * المالية محجوبة عن المساعد: RLS تمنع القراءة أصلاً (لا سياسة مالية
 * للمساعد على expenses/recurring_expenses/teacher_settings/payments)،
 * والواجهة تعرض قفلاً بنفس نمط شاشة الفواتير.
 *
 * أعلى الشاشة قسم «الإغلاق اليومي للخزنة» (CashboxSection — Phase 2
 * خطوة 5): ملخص يوم مختار (افتراضياً النهاردة) محسوب حياً من دفعات
 * اليوم ومصروفاته + حفظ/تعديل إغلاق اليوم في daily_closings وسجل
 * الإغلاقات السابقة — اختير قسماً داخل شاشة الفلوس لا شاشة مستقلة لأن
 * التنقل السفلي ثابت بخمس وجهات والإغلاق امتداد طبيعي لسياق الفلوس،
 * ومالك فقط كسائر المالية.
 */
export function MoneyPage() {
  const qc = useQueryClient()
  const teacher = useCurrentTeacher()
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined

  const currentMonth = monthStartStr(todayStr())
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [expenseSheet, setExpenseSheet] = useState<
    { mode: 'create' } | { mode: 'edit'; expense: ExpenseRow } | null
  >(null)
  const [recurringSheet, setRecurringSheet] = useState<
    { mode: 'create' } | { mode: 'edit'; template: RecurringExpenseRow } | null
  >(null)
  const toast = useToast()

  const profitQ = useMonthlyProfit(teacherId, isOwner)
  const centerQ = useCenterSharePercent(teacherId, isOwner)
  const expensesQ = useMonthExpenses(teacherId, selectedMonth, isOwner)
  const recurringQ = useRecurringExpenses(teacherId, isOwner)

  const delExpense = useDeleteExpense(teacherId ?? '')
  const delRecurring = useDeleteRecurring(teacherId ?? '')
  const applyRecurring = useApplyRecurring(teacherId ?? '')

  const profitRows = useMemo(() => profitQ.data ?? [], [profitQ.data])
  const summary = useMemo(
    () => summaryOf(profitRows, selectedMonth),
    [profitRows, selectedMonth],
  )
  const sixMonths = useMemo(
    () => lastSixMonths(profitRows, currentMonth),
    [profitRows, currentMonth],
  )
  const barsMax = useMemo(
    () => Math.max(1, ...sixMonths.map((r) => Math.max(r.collected, r.expenses))),
    [sixMonths],
  )
  const expenses = useMemo(() => expensesQ.data ?? [], [expensesQ.data])
  // تجميع المصروفات باليوم (W3 — R-11): مرتبة بالتاريخ تنازلياً أصلاً،
  // فالتجميع المتتالي يحافظ على الترتيب ويضيف عنوان يوم لاصقاً بإجماليه
  const expenseDayGroups = useMemo(() => {
    const groups: { day: string; items: ExpenseRow[]; total: number }[] = []
    for (const exp of expenses) {
      const last = groups[groups.length - 1]
      if (last && last.day === exp.expense_date) {
        last.items.push(exp)
        last.total += Number(exp.amount) || 0
      } else {
        groups.push({ day: exp.expense_date, items: [exp], total: Number(exp.amount) || 0 })
      }
    }
    return groups
  }, [expenses])
  const templates = useMemo(() => recurringQ.data ?? [], [recurringQ.data])
  const centerPercent = centerQ.data ?? 0

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  if (!isOwner) {
    return (
      <Card className="text-center py-10">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
          <Lock size={28} />
        </div>
        <div className="type-section mb-1">{t('money.ownerOnlyTitle')}</div>
        <p className="text-muted text-[13.5px] mb-0">
          {t('money.ownerOnlyBody')}
        </p>
      </Card>
    )
  }

  // (3A-325 — تدقيق بند ٥): centerQ داخل الحزمة أيضاً — كان مقطع
  // «حصة المركز» (centerPercent) الاستعلام الوحيد خارجها فيظهر متأخراً
  // منفصلاً بعد اكتمال باقي الصفحة؛ الآن الصفحة كلها تظهر دفعة واحدة.
  const pending =
    profitQ.isPending || centerQ.isPending || expensesQ.isPending || recurringQ.isPending
  const error = profitQ.error ?? centerQ.error ?? expensesQ.error ?? recurringQ.error
  const isCurrentMonth = selectedMonth === currentMonth
  const defaultExpenseDate = isCurrentMonth ? todayStr() : selectedMonth

  return (
    <PullToRefresh onRefresh={() => invalidatePrefixes(qc, [MONEY])}>
    <div>
      {/* شريط الشهور الموحّد (W3 — R-10): رقائق آخر 6 شهور بدل زرّي
          السابق/التالي — اختيار شهر أقدم من خارج الستة يبقى ظاهراً
          رقاقة نشطة حتى لا يضيع سياق الاختيار */}
      <PageToolBar
        chips={
          <>
            {sixMonths.map((row) => (
              <Chip
                key={row.month}
                active={selectedMonth === row.month}
                onClick={() => setSelectedMonth(row.month)}
              >
                {periodLabel(row.month)}
              </Chip>
            ))}
            {!sixMonths.some((r) => r.month === selectedMonth) && (
              <Chip active onClick={() => setSelectedMonth(selectedMonth)}>
                {periodLabel(selectedMonth)}
              </Chip>
            )}
          </>
        }
        resultCount={pending ? undefined : expenses.length}
      />
      {!isCurrentMonth && (
        <Button full variant="soft" className="mb-3" onClick={() => setSelectedMonth(currentMonth)}>
          {t('money.backToCurrent', { month: periodLabel(currentMonth) })}
        </Button>
      )}

      {/* الإغلاق اليومي للخزنة (خطوة 5): قسم مستقل بحالاته الخاصة،
          يومي الإيقاع فلا يرتبط بتنقّل الشهور أسفله */}
      {teacherId && <CashboxSection teacherId={teacherId} />}

      {pending ? (
        <LoadingState label={t('money.loading')} />
      ) : error ? (
        <ErrorState
          message={error instanceof Error ? error.message : t('common.unknownError')}
          onRetry={() => {
            // PAT-1 (3A-377): إعادة محاولة موجّهة للاستعلامات الفاشلة نفسها — إبطال 'money' كان سيعيد جلب نسبة السنتر وقسم الإغلاق اليومي أيضاً.
            void profitQ.refetch()
            void expensesQ.refetch()
            void recurringQ.refetch()
          }}
        />
      ) : (
        <>
          {/* ملخص الفترة — من view ‏monthly_profit حرفياً */}
          <div className="grid grid-cols-3 gap-2 mb-3 rise-in" style={{ animationDelay: '0ms' }}>
            <Kpi value={formatMoney(summary.collected)} label={t('money.kpiCollected')} valueClass="text-ok-text" />
            <Kpi value={formatMoney(summary.expenses)} label={t('money.kpiExpenses')} valueClass="text-bad-text" />
            <Kpi
              value={formatMoney(summary.net_profit)}
              label={t('money.kpiNet')}
              valueClass={summary.net_profit < 0 ? 'text-bad-text' : 'text-ok-text'}
            />
          </div>

          {/* بطاقة نسبة السنتر — تظهر عند تفعيلها فقط (المرجع §3.12) */}
          {centerPercent > 0 && (
            <Card className="border-primary/30 bg-soft/60">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-extrabold text-[16px] flex items-center gap-2"><Building2 size={22} className="text-primary" /> {t('money.centreShareTitle', { pct: centerPercent })}</div>
                  <div className="text-muted text-[13.5px]">
                    {t('money.centreShareLine', { month: periodLabel(selectedMonth) })}
                  </div>
                </div>
                <b className="text-[16px] shrink-0" dir="ltr">
                  {formatMoney(summary.center_share_amount)}
                </b>
              </div>
            </Card>
          )}

          {/* آخر 6 شهور */}
          <h2 className="type-section mb-2 mt-1">{t('money.lastSixMonths')}</h2>
          <Card className="rise-in" style={{ animationDelay: '50ms' }}>
            {sixMonths.map((row) => (
              <MonthBarRow
                key={row.month}
                row={row}
                maxVal={barsMax}
                selected={row.month === selectedMonth}
                onSelect={() => setSelectedMonth(row.month)}
              />
            ))}
            <p className="text-muted text-[13.5px] mb-0 mt-1">
              {t('money.barsNote')}
            </p>
          </Card>

          {/* مصروفات الشهر المختار */}
          <div className="flex items-center justify-between gap-2 mt-4 mb-2">
            <h2 className="type-section">{t('money.expensesOfMonth', { month: periodLabel(selectedMonth) })}</h2>
          </div>
          <div className="flex gap-2 mb-3">
            <Button className="flex-1" onClick={() => setExpenseSheet({ mode: 'create' })}>
              <Plus size={18} />
              {t('money.addExpense')}
            </Button>
            {templates.length > 0 && (
              <Button
                variant="soft"
                className="flex-1"
                disabled={applyRecurring.isPending}
                onClick={() =>
                  applyRecurring.mutate(
                    { monthStart: selectedMonth, templates },
                    {
                      onSuccess: (r) =>
                        toast(
                          r.created > 0
                            ? `${t('money.appliedToast', { created: r.created, month: periodLabel(selectedMonth) })}${r.skipped > 0 ? t('money.appliedSkippedSuffix', { skipped: r.skipped }) : ''}`
                            : t('money.alreadyAppliedToast'),
                        ),
                      onError: () => toast(t('money.applyErrorToast')),
                    },
                  )
                }
              >
                {applyRecurring.isPending ? t('money.applyingRecurring') : t('money.applyRecurring', { count: templates.length })}
              </Button>
            )}
          </div>

          {expenses.length === 0 ? (
            <Card className="rise-in" style={{ animationDelay: '90ms' }}>
              <EmptyState
                mascot
                icon={Wallet}
                title={t('money.emptyExpensesTitle')}
                hint={t('money.emptyExpensesHint')}
              />
            </Card>
          ) : (
            expenseDayGroups.map((g) => (
              <div key={g.day}>
                <StickyGroupHeader>
                  {t('money.dayHeader', { date: formatDateLabel(g.day), count: g.items.length, total: formatMoney(g.total) })}
                </StickyGroupHeader>
                {g.items.map((exp) => (
                  <Card key={exp.id} className="rise-in" style={{ animationDelay: '90ms' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-[15px]">{exp.category}</div>
                    <div className="text-muted text-[13.5px] mt-0.5">
                      {formatDateLabel(exp.expense_date)}
                      {exp.note ? ` · ${exp.note}` : ''}
                    </div>
                  </div>
                  <b className="text-bad-text text-[15px] shrink-0" dir="ltr">
                    {formatMoney(exp.amount)}
                  </b>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="soft"
                    className="flex-1 min-h-[48px] text-[13.5px]"
                    onClick={() => setExpenseSheet({ mode: 'edit', expense: exp })}
                  >
                    {t('money.edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1 min-h-[48px] text-[13.5px] text-bad-text border-bad/40"
                    disabled={delExpense.isPending}
                    onClick={() =>
                      delExpense.mutate(exp.id, {
                        onSuccess: () => toast(t('money.expenseDeletedToast')),
                        onError: () => toast(t('money.deleteErrorToast')),
                      })
                    }
                  >
                    {t('money.delete')}
                  </Button>
                </div>
                  </Card>
                ))}
              </div>
            ))
          )}

          {/* المصروفات الشهرية الثابتة (القوالب) */}
          <div className="flex items-center justify-between gap-2 mt-4 mb-2">
            <h2 className="type-section">{t('money.recurringTitle')}</h2>
            <Button variant="soft" onClick={() => setRecurringSheet({ mode: 'create' })}>
              {t('money.addTemplate')}
            </Button>
          </div>
          {templates.length === 0 ? (
            <Card className="rise-in" style={{ animationDelay: '140ms' }}>
              <EmptyState
                icon={Pin}
                title={t('money.emptyTemplatesTitle')}
                hint={t('money.emptyTemplatesHint')}
              />
            </Card>
          ) : (
            templates.map((tpl, i) => (
              <Card key={tpl.id} className="rise-in" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-[15px]">{tpl.category}</div>
                    <div className="text-muted text-[13.5px] mt-0.5">
                      {t('money.monthly')}{tpl.note ? ` · ${tpl.note}` : ''}
                    </div>
                  </div>
                  <b className="text-[15px] shrink-0" dir="ltr">
                    {formatMoney(tpl.amount)}
                  </b>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="soft"
                    className="flex-1 min-h-[48px] text-[13.5px]"
                    onClick={() => setRecurringSheet({ mode: 'edit', template: tpl })}
                  >
                    {t('money.edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1 min-h-[48px] text-[13.5px] text-bad-text border-bad/40"
                    disabled={delRecurring.isPending}
                    onClick={() =>
                      delRecurring.mutate(tpl.id, {
                        onSuccess: () => toast(t('money.templateDeletedToast')),
                        onError: () => toast(t('money.deleteErrorToast')),
                      })
                    }
                  >
                    {t('money.deleteTemplate')}
                  </Button>
                </div>
              </Card>
            ))
          )}
          <p className="text-muted text-[13.5px] mt-1">
            {t('money.recurringNote')}
          </p>
        </>
      )}

      {expenseSheet && teacherId && (
        <ExpenseFormSheet
          teacherId={teacherId}
          expense={expenseSheet.mode === 'edit' ? expenseSheet.expense : undefined}
          defaultDate={defaultExpenseDate}
          onClose={() => setExpenseSheet(null)}
          onSaved={(msg) => {
            setExpenseSheet(null)
            toast(msg)
          }}
        />
      )}
      {recurringSheet && teacherId && (
        <RecurringFormSheet
          teacherId={teacherId}
          template={recurringSheet.mode === 'edit' ? recurringSheet.template : undefined}
          onClose={() => setRecurringSheet(null)}
          onSaved={(msg) => {
            setRecurringSheet(null)
            toast(msg)
          }}
        />
      )}
    </div>
    </PullToRefresh>
  )
}
