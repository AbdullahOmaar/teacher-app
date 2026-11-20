import { useEffect, useMemo, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatMoney } from '../../lib/format'
import type { ExpenseRow, RecurringExpenseRow } from '../../types/database'
import { monthStartStr, todayStr } from '../home/api'
import { periodLabel } from '../invoices/api'
import { addMonthsStr, formatDateLabel } from '../schedule/api'
import { lastSixMonths, summaryOf, type MonthSummary } from './api'
import {
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
      <b className={`block text-[19px] font-extrabold leading-tight ${valueClass}`}>{value}</b>
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
        <span
          className={`text-[13px] font-extrabold ${row.net_profit < 0 ? 'text-bad-text' : 'text-ok-text'}`}
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
      <div className="flex justify-between text-[11.5px] text-muted mt-1">
        <span>
          محصّل <span dir="ltr">{formatMoney(row.collected)}</span>
        </span>
        <span>
          مصروفات <span dir="ltr">{formatMoney(row.expenses)}</span>
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
 */
export function MoneyPage() {
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
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

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
  const templates = useMemo(() => recurringQ.data ?? [], [recurringQ.data])
  const centerPercent = centerQ.data ?? 0

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  if (!isOwner) {
    return (
      <Card className="text-center py-10">
        <div className="text-[34px] mb-2">🔒</div>
        <div className="font-extrabold mb-1">المصروفات والأرباح للمالك فقط</div>
        <p className="text-muted text-[13px] mb-0">
          حساب المساعد لا يملك صلاحية مالية — المصروفات والأرباح ونسبة السنتر محجوبة في قاعدة
          البيانات نفسها (RLS) وليس في الواجهة فقط.
        </p>
      </Card>
    )
  }

  const pending = profitQ.isPending || expensesQ.isPending || recurringQ.isPending
  const error = profitQ.error ?? centerQ.error ?? expensesQ.error ?? recurringQ.error
  const isCurrentMonth = selectedMonth === currentMonth
  const defaultExpenseDate = isCurrentMonth ? todayStr() : selectedMonth

  return (
    <div>
      {/* تنقّل الشهور */}
      <div className="flex items-center gap-2 mb-3">
        <Button
          variant="ghost"
          onClick={() => setSelectedMonth(addMonthsStr(selectedMonth, -1))}
        >
          الشهر السابق
        </Button>
        <div className="flex-1 text-center font-extrabold text-[15px]">
          {periodLabel(selectedMonth)}
        </div>
        <Button
          variant="ghost"
          onClick={() => setSelectedMonth(addMonthsStr(selectedMonth, 1))}
        >
          الشهر التالي
        </Button>
      </div>
      {!isCurrentMonth && (
        <Button full variant="soft" className="mb-3" onClick={() => setSelectedMonth(currentMonth)}>
          رجوع للشهر الحالي ({periodLabel(currentMonth)})
        </Button>
      )}

      {pending ? (
        <LoadingState label="بنحمّل الملخص المالي…" />
      ) : error ? (
        <ErrorState message={error instanceof Error ? error.message : 'خطأ غير معروف'} />
      ) : (
        <>
          {/* ملخص الفترة — من view ‏monthly_profit حرفياً */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Kpi value={formatMoney(summary.collected)} label="محصّل الشهر" valueClass="text-ok-text" />
            <Kpi value={formatMoney(summary.expenses)} label="مصروفات الشهر" valueClass="text-bad-text" />
            <Kpi
              value={formatMoney(summary.net_profit)}
              label="صافي الربح"
              valueClass={summary.net_profit < 0 ? 'text-bad-text' : 'text-ok-text'}
            />
          </div>

          {/* بطاقة نسبة السنتر — تظهر عند تفعيلها فقط (المرجع §3.12) */}
          {centerPercent > 0 && (
            <Card className="border-primary/30 bg-soft/60">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-extrabold text-[14.5px]">🏢 نسبة السنتر {centerPercent}%</div>
                  <div className="text-muted text-[13px]">
                    خصم من محصّل {periodLabel(selectedMonth)} — اتحسبت واتخصمت من صافي الربح فوق
                  </div>
                </div>
                <b className="text-[17px] shrink-0" dir="ltr">
                  {formatMoney(summary.center_share_amount)}
                </b>
              </div>
            </Card>
          )}

          {/* آخر 6 شهور */}
          <h2 className="text-[15px] font-extrabold mb-2 mt-1">آخر 6 شهور</h2>
          <Card>
            {sixMonths.map((row) => (
              <MonthBarRow
                key={row.month}
                row={row}
                maxVal={barsMax}
                selected={row.month === selectedMonth}
                onSelect={() => setSelectedMonth(row.month)}
              />
            ))}
            <p className="text-muted text-[12px] mb-0 mt-1">
              الرقم اللي على الشمال هو صافي ربح الشهر — اضغط أي شهر لعرض تفاصيله ومصروفاته.
            </p>
          </Card>

          {/* مصروفات الشهر المختار */}
          <div className="flex items-center justify-between gap-2 mt-4 mb-2">
            <h2 className="text-[15px] font-extrabold">مصروفات {periodLabel(selectedMonth)}</h2>
          </div>
          <div className="flex gap-2 mb-3">
            <Button className="flex-1" onClick={() => setExpenseSheet({ mode: 'create' })}>
              + تسجيل مصروف
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
                        setToast(
                          r.created > 0
                            ? `اتضاف ${r.created} مصروف ثابت لشهر ${periodLabel(selectedMonth)}${r.skipped > 0 ? `، و${r.skipped} كانوا موجودين فاتتخطوا` : ''} ✓`
                            : 'الثوابت بتاعة الشهر ده مطبقة بالفعل — مفيش تكرار ✓',
                        ),
                      onError: () => setToast('حصل خطأ أثناء إضافة الثوابت'),
                    },
                  )
                }
              >
                {applyRecurring.isPending ? 'بنضيف الثوابت…' : `إضافة الثوابت (${templates.length})`}
              </Button>
            )}
          </div>

          {expenses.length === 0 ? (
            <Card>
              <EmptyState
                icon="💸"
                title="مفيش مصروفات في الشهر ده"
                hint="سجّل أول مصروف من الزر اللي فوق، أو طبّق المصروفات الثابتة إن وجدت."
              />
            </Card>
          ) : (
            expenses.map((exp) => (
              <Card key={exp.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-[15px]">{exp.category}</div>
                    <div className="text-muted text-[13px] mt-0.5">
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
                    className="flex-1 min-h-[38px] text-[13px]"
                    onClick={() => setExpenseSheet({ mode: 'edit', expense: exp })}
                  >
                    تعديل
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1 min-h-[38px] text-[13px] text-bad-text border-bad/40"
                    disabled={delExpense.isPending}
                    onClick={() =>
                      delExpense.mutate(exp.id, {
                        onSuccess: () => setToast('اتحذف المصروف'),
                        onError: () => setToast('حصل خطأ أثناء الحذف'),
                      })
                    }
                  >
                    حذف
                  </Button>
                </div>
              </Card>
            ))
          )}

          {/* المصروفات الشهرية الثابتة (القوالب) */}
          <div className="flex items-center justify-between gap-2 mt-4 mb-2">
            <h2 className="text-[15px] font-extrabold">المصروفات الشهرية الثابتة</h2>
            <Button variant="soft" onClick={() => setRecurringSheet({ mode: 'create' })}>
              + قالب ثابت
            </Button>
          </div>
          {templates.length === 0 ? (
            <Card>
              <EmptyState
                icon="📌"
                title="مفيش مصروفات ثابتة متسجلة"
                hint="أضف قالب ثابت (زي إيجار القاعة الشهري) وبعدين طبّقه على أي شهر بزر «إضافة الثوابت» من غير ما يكرر نفسه."
              />
            </Card>
          ) : (
            templates.map((t) => (
              <Card key={t.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-[15px]">{t.category}</div>
                    <div className="text-muted text-[13px] mt-0.5">
                      شهرياً{t.note ? ` · ${t.note}` : ''}
                    </div>
                  </div>
                  <b className="text-[15px] shrink-0" dir="ltr">
                    {formatMoney(t.amount)}
                  </b>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="soft"
                    className="flex-1 min-h-[38px] text-[13px]"
                    onClick={() => setRecurringSheet({ mode: 'edit', template: t })}
                  >
                    تعديل
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1 min-h-[38px] text-[13px] text-bad-text border-bad/40"
                    disabled={delRecurring.isPending}
                    onClick={() =>
                      delRecurring.mutate(t.id, {
                        onSuccess: () => setToast('اتحذف المصروف الثابت'),
                        onError: () => setToast('حصل خطأ أثناء الحذف'),
                      })
                    }
                  >
                    حذف القالب
                  </Button>
                </div>
              </Card>
            ))
          )}
          <p className="text-muted text-[12px] mt-1">
            حذف القالب بيوقفه من الشهور الجاية بس، والمصروفات اللي اتطبقت منه قبل كده بتفضل
            موجودة زي ما هي.
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
            setToast(msg)
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
            setToast(msg)
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-[92px] inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
          <div className="bg-text text-bg text-[13.5px] font-semibold rounded-full px-4 py-2.5 shadow-lg max-w-[640px] text-center">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}
