import { invalidatePrefixes } from '../../lib/invalidate'
import { summarizeUnpaidByStudent } from './api'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { t } from '../../i18n'
import { Link, useSearchParams } from 'react-router-dom'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import { Card } from '../../components/ui/Card'
import { OwnerOnlyCard } from '../../components/OwnerOnlyCard'
import { useToast } from '../../components/ui/toast'
import { Button } from '../../components/ui/Button'
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, ReceiptText, X } from 'lucide-react'
import { Sheet } from '../../components/ui/Sheet'
import { EmptyState } from '../../components/ui/EmptyState'
import { Fab } from '../../components/ui/Fab'
import { Chip, Field, Select } from '../../components/ui/form'
import {
  PageToolBar,
  StickyGroupHeader,
  GROUP_HEADER_TOP_WITH_SEARCH,
} from '../../components/ui/PageToolBar'
import { ErrorState, ListLoadingState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { Avatar } from '../../components/ui/Avatar'
import { ListRow } from '../../components/ui/ListRow'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatMoney } from '../../lib/format'
import { monthStartStr, todayStr } from '../home/api'
import {
  addVisiblePayableToSelection,
  createPayment,
  fetchInvoice,
  filterInvoiceList,
  INVOICE_MONTH_ALL,
  invoiceMonthOptions,
  PAYMENT_METHODS,
  payStateOf,
  periodLabel,
  resolveInvoiceMonthFilter,
  runBulkPayments,
  selectionTotals,
  type BulkPaySummary,
  type InvoiceListItem,
  type InvoiceStatusFilter,
} from './api'
import type { PaymentMethod } from '../../types/database'
import { INV, useInvoices } from './hooks'
import { InvoiceDetailPage } from './InvoiceDetailPage'
import { IssueInvoicesSheet } from './sheets'
import { ProofsReviewSection } from '../payment-proofs/components'

type FilterKey = InvoiceStatusFilter

/** حجم صفحة قائمة الفواتير (و-7ب) — ترقيم عميل فوق القائمة المفلترة */
const PAGE_SIZE = 25

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: t('invoices.filterAll') },
  { key: 'due', label: t('invoices.filterDue') },
  { key: 'partial', label: t('invoices.filterPartial') },
  { key: 'paid', label: t('invoices.filterPaid') },
]

function stateBadge(inv: InvoiceListItem) {
  const state = payStateOf(inv)
  if (state === 'paid')
    return (
      <span className="shrink-0 type-badge bg-ok-soft text-ok-text border border-ok/30 rounded-full px-2 py-0.5">
        {t('common.paid')}
      </span>
    )
  if (state === 'partial')
    return (
      <span className="shrink-0 type-badge bg-soft text-primary border border-primary/30 rounded-full px-2 py-0.5">
        {t('invoices.badgePartial', { amount: formatMoney(inv.balance) })}
      </span>
    )
  return (
    <span className="shrink-0 type-badge bg-warn-soft text-warn-text border border-warn/40 rounded-full px-2 py-0.5">
      {t('common.remaining', { amount: formatMoney(inv.balance) })}
    </span>
  )
}

export function InvoiceCard({
  inv,
  first = false,
  selected = false,
  onDesktopSelect,
  selectMode = false,
  bulkSelected = false,
  onToggleSelect,
}: {
  inv: InvoiceListItem
  first?: boolean
  selected?: boolean
  onDesktopSelect?: (id: string) => void
  /** وضع تحديد الدفع الجماعي: الضغط يبدّل التحديد لا يتنقّل */
  selectMode?: boolean
  bulkSelected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  // القابلة للتحديد هي ذات الرصيد المتبقي فقط؛ المسددة بلا مربع اختيار
  // أصلاً وضغطها في وضع التحديد لا يفعل شيئاً (قرار موثّق في PR الدفعة)
  const selectable = selectMode && inv.balance > 0
  return (
    <Link
      to={`/invoices/${inv.invoice_id}`}
      className="block no-underline text-text active:bg-soft"
      onClick={(e) => {
        if (selectMode) {
          e.preventDefault()
          if (inv.balance > 0) onToggleSelect?.(inv.invoice_id)
          return
        }
        // عند ≥1024px الاختيار يعرض التفاصيل في اللوحة الجانبية بلا تنقل
        if (onDesktopSelect && window.matchMedia('(min-width: 1024px)').matches) {
          e.preventDefault()
          onDesktopSelect(inv.invoice_id)
        }
      }}
    >
      <ListRow
        first={first}
        className={`${selected ? 'lg:bg-soft' : ''} ${bulkSelected ? 'bg-soft' : ''}`}
        leading={
          selectable ? (
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`flex items-center justify-center w-6 h-6 rounded-md border-2 shrink-0 ${
                  bulkSelected
                    ? 'bg-primary border-primary text-on-primary'
                    : 'bg-card border-border-interactive'
                }`}
              >
                {bulkSelected && <Check size={15} strokeWidth={3.5} />}
              </span>
              <Avatar name={inv.student_name} />
            </span>
          ) : (
            <Avatar name={inv.student_name} />
          )
        }
        title={
          // (ملاحظات المالك 2026-11-28 — بند ٤): شارة الحالة على سطر
          // الاسم نفسه في طرفه المقابل (أقصى الشمال بصرياً)، لا في عمود
          // ذيلي وحده بياكل الكارت — ده بيحل محل موضع 3A-697 (trailing)
          // بمراجعة المالك الحية. الاسم يُختصر بنقاط قبل الشارة دائماً
          // والشارة ثابتة الانكماش.
          <span className="flex items-center gap-2">
            <span className="flex-1 min-w-0 truncate">{inv.student_name}</span>
            {stateBadge(inv)}
          </span>
        }
        titleClassName="font-semibold text-[15px] leading-[1.6]"
        secondary={
          <>
            {/* (3A-651 — نمط الصف المنظّم): كل سطر ثانوي وحدة ذرية
                truncate واحدة — الصيغة القديمة كانت مقاطع whitespace-nowrap
                منفصلة داخل سطر يلتف، فكانت المقاطع تنزل أسطرًا متبعثرة
                وتترك نقاط «·» يتيمة على أسطر وحدها عند 360px (لقطة
                المالك). الآن: سطر ١ المجموعة · الشهر، سطر ٢ الإجمالي ·
                المدفوع — كلٌّ يُختصر كوحدة ولا ينكسر من الداخل أبدًا */}
            <span className="block truncate">
              {inv.group_name} {'·'} {periodLabel(inv.period_month)}
            </span>
            <span className="block truncate">
              {t('invoices.rowTotal', { amount: formatMoney(inv.total) })}
              {inv.paid > 0 && (
                <>
                  {' · '}
                  {t('invoices.rowPaidPart', { amount: formatMoney(inv.paid) })}
                </>
              )}
            </span>
          </>
        }
        secondaryClassName="text-muted text-[13.5px] leading-[1.6]"
      />
    </Link>
  )
}

/**
 * الفواتير (المواصفات §3.5): بحث فوري (طالب/شهر)، فلاتر حالة من view
 * ‏invoice_balances (الكل/مستحقة/جزئية/مسددة — و?filter=due من الرئيسية
 * يفتح على «مستحقة»)، فلتر شهر عند تعدد الشهور (افتراضيه الشهر الحالي)،
 * بطاقة متأخرات، وزر إصدار فواتير الشهر. ودفع جماعي بوضع تحديد: دفع
 * كامل لكل فاتورة محددة بإيصالها المستقل عبر createPayment نفسها،
 * بتأكيد واحد (عدد/إجمالي/طريقة) وملخص نتيجة صريح (نجاح/تخطٍّ/فشل).
 * المالية محجوبة عن المساعد: RLS تمنع القراءة أصلاً، والواجهة تعرض قفلاً.
 */
export function InvoicesPage() {
  const qc = useQueryClient()
  const teacher = useCurrentTeacher()
  const [params] = useSearchParams()
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  // أي تغيير بحث/فلتر يبدأ من الصفحة الأولى (و-7ب)
  const onSearchChange = (v: string) => {
    setSearch(v)
    setPage(0)
  }
  // اختيار المستخدم الصريح يتغلب؛ وإلا ?filter=due من الرئيسية يفتح «مستحقة»
  const [filterChoice, setFilter] = useState<FilterKey | null>(null)
  const filter: FilterKey =
    filterChoice ?? (params.get('filter') === 'due' ? 'due' : 'all')
  // فلتر الشهر (ملاحظة المالك 2026-11-28): null = لم يختر المستخدم بعد،
  // فتُحسم القيمة الفعّالة من البيانات (الشهر الحالي إن وُجد، وإلا الكل)
  const [monthChoice, setMonthChoice] = useState<string | null>(null)
  // Sheet «تصفية حسب الشهر» — النمط الموحّد لشاشات القوائم (كفلتر مجموعات
  // الطلاب): زر تصفية الشريط يفتحها، والاختيار غير الافتراضي يُشار إليه
  // بشارة على الزر وبرقاقة إزالة في صف الرقائق
  const [monthOpen, setMonthOpen] = useState(false)
  // الدفع الجماعي (قرار المدير 2026-11-28): وضع تحديد (التحديد بالمعرّف
  // ويبقى عبر الفلاتر) + تأكيد واحد (عدد/إجمالي/طريقة) + ملخص نتيجة
  // يبقى ظاهراً بعد التنفيذ حتى يُغلقه المدرس بنفسه
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const [bulkMethod, setBulkMethod] = useState<PaymentMethod>('cash')
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkSummary, setBulkSummary] = useState<BulkPaySummary | null>(null)
  const [issueOpen, setIssueOpen] = useState(false)
  const [showOverdue, setShowOverdue] = useState(false)
  const [showCurrentDue, setShowCurrentDue] = useState(false)
  // اختيار List-Detail عند ≥1024px — تحت هذا العرض يبقى التنقل لصفحة التفاصيل
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const toast = useToast()

  const invoicesQ = useInvoices(teacherId, isOwner)
  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data])

  const currentMonth = monthStartStr(todayStr())
  // شهور البيانات الفعلية (الأحدث أولاً) — أكثر من شهر = زر التصفية يظهر
  const months = useMemo(() => invoiceMonthOptions(invoices), [invoices])
  const defaultMonthFilter = resolveInvoiceMonthFilter(null, months, currentMonth)
  const monthFilter = resolveInvoiceMonthFilter(monthChoice, months, currentMonth)

  // القائمة المعروضة = شهر ∩ حالة ∩ بحث (دلالات الفلاتر في filterInvoiceList)
  const filtered = useMemo(
    () => filterInvoiceList(invoices, { month: monthFilter, status: filter, query: search }),
    [invoices, monthFilter, filter, search],
  )

  // إجمالي شريط الدفع الجماعي: كل المحدد من القائمة الكاملة (لا المرئية
  // فقط) — التحديد يبقى عبر الفلاتر فتطابق أرقام الشريط حقيقته دائماً
  const selTotals = selectionTotals(invoices, selectedIds)
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  // الخروج من وضع التحديد يمسح التحديد كله بلا أي أثر جانبي (قرار الشكل ٥)
  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }
  // تنفيذ الدفع الجماعي: متسلسل عبر createPayment نفسها (بحارسها) مع
  // إعادة قراءة رصيد كل فاتورة لحظة تنفيذها؛ الملخص يبقى بعد الخروج
  const runBulk = async () => {
    if (!teacherId || bulkRunning) return
    setBulkRunning(true)
    try {
      const summary = await runBulkPayments([...selectedIds], {
        fetchBalance: async (id) => {
          const inv = await fetchInvoice(teacherId, id)
          return inv ? inv.balance : null
        },
        pay: async (id, amount) => {
          const p = await createPayment(teacherId, id, {
            amount,
            method: bulkMethod,
            paid_on: todayStr(),
          })
          return { receiptNo: p.receipt_no }
        },
      })
      setBulkSummary(summary)
    } finally {
      setBulkRunning(false)
      setBulkConfirmOpen(false)
      exitSelectMode()
      void invalidatePrefixes(qc, [INV])
    }
  }

  // تعريف «متأخر» المعتمد في التطبيق (تدقيق أول استخدام — M4): فاتورة
  // شهرٍ سابق برصيد موجب — هكذا يحسب الملخص اليومي في migration ‏0015
  // حرفياً (period_month < أول الشهر الحالي). فواتير الشهر الحالي غير
  // المسددة «مستحقات جارية» لا «متأخرات»، فلا تدخل بطاقة المتأخرات
  // (كانت فواتير تُصدر للتوّ تظهر «متأخرات مستحقة» بعد دقيقة من إصدارها).
  const { overdue, currentDue } = useMemo(
    () => summarizeUnpaidByStudent(invoices, currentMonth),
    [invoices, currentMonth],
  )

  // ترقيم الصفحات (و-7ب): 25/صفحة فوق القائمة المفلترة كاملة — الصفحة
  // تُقصّ دائماً داخل النطاق إن انكمشت النتائج تحتها (بيانات تغيّرت)
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageItems = useMemo(
    () => filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE),
    [filtered, currentPage],
  )

  // تجميع العرض بالشهر (W3 — R-11): الفواتير مرتبة بالفترة تنازلياً
  // أصلاً، فالتجميع المتتالي يحافظ على الترتيب ويضيف عنوان شهر لاصقاً —
  // يعمل على عناصر الصفحة الحالية فقط (و-7ب)
  const invoiceSections = useMemo(() => {
    const sections: { period: string; items: InvoiceListItem[] }[] = []
    for (const inv of pageItems) {
      const last = sections[sections.length - 1]
      if (last && last.period === inv.period_month) last.items.push(inv)
      else sections.push({ period: inv.period_month, items: [inv] })
    }
    return sections
  }, [pageItems])

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  if (!isOwner) {
    return <OwnerOnlyCard title={t('invoices.ownerOnlyTitle')} body={t('invoices.ownerOnlyBody')} />
  }

  const currentMonthLabel = periodLabel(monthStartStr(todayStr()))
  const paneInvoiceId =
    selectedId && filtered.some((i) => i.invoice_id === selectedId)
      ? selectedId
      : (filtered[0]?.invoice_id ?? null)

  return (
    <PullToRefresh onRefresh={() => invalidatePrefixes(qc, [INV])}>
    <div className="lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-5 lg:items-start">
      <div className="min-w-0">
      {/* شريط الأدوات الموحّد (W3 — R-10): بحث + رقائق حالة + عدّاد */}
      <PageToolBar
        bleed={false}
        search={{
          value: search,
          onChange: onSearchChange,
          placeholder: t('invoices.searchPlaceholder'),
        }}
        chips={
          <>
            {/* رقاقة الشهر المفعّل القابلة للإزالة (نمط فلتر مجموعة الطلاب
                الموحّد): تظهر فقط حين يختلف الاختيار الفعّال عن الافتراضي،
                وضغطها يعيد الافتراضي */}
            {months.length > 1 && monthFilter !== defaultMonthFilter && (
              <Chip
                active
                onClick={() => {
                  setMonthChoice(null)
                  setPage(0)
                }}
              >
                {monthFilter === INVOICE_MONTH_ALL
                  ? t('invoices.monthFilterAll')
                  : periodLabel(monthFilter)}{' '}
                <X size={14} />
              </Chip>
            )}
            {/* رقاقتا الدفع الجماعي: «تحديد» تدخل وضع التحديد (وتتحول
                لإلغائه بمسح كامل)، و«تحديد الكل» تضيف القابل للدفع من
                المرئي بعد الفلاتر — تظهران فقط حين توجد فواتير قابلة للدفع */}
            {(selectMode || invoices.some((i) => i.balance > 0)) && (
              <Chip
                active={selectMode}
                onClick={() => {
                  if (selectMode) exitSelectMode()
                  else {
                    setSelectMode(true)
                    setPage(0)
                  }
                }}
              >
                {selectMode ? t('invoices.bulkCancelSelect') : t('invoices.bulkSelect')}
              </Chip>
            )}
            {selectMode && (
              <Chip
                active={false}
                onClick={() =>
                  setSelectedIds(addVisiblePayableToSelection(selectedIds, filtered))
                }
              >
                {t('invoices.bulkSelectAll')}
              </Chip>
            )}
            {FILTERS.map((f) => (
              <Chip
                key={f.key}
                active={filter === f.key}
                onClick={() => {
                  setFilter(f.key)
                  setPage(0)
                }}
              >
                {f.label}
              </Chip>
            ))}
          </>
        }
        onFilter={months.length > 1 ? () => setMonthOpen(true) : undefined}
        activeFilterCount={monthFilter !== defaultMonthFilter ? 1 : 0}
        resultCount={invoicesQ.isPending ? undefined : filtered.length}
      />

      {/* ملخص نتيجة الدفع الجماعي: يبقى ظاهراً بعد التنفيذ والخروج من
          وضع التحديد حتى يُغلقه المدرس — يصرّح بالنجاح والتخطي والفشل
          كما حدثوا فعلاً (لا ذرّية مدّعاة) */}
      {bulkSummary && (
        <Card className="rise-in border-primary/40 bg-primary/5">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-[15px] mb-0.5">{t('invoices.bulkSummaryTitle')}</div>
              {bulkSummary.paidCount > 0 && (
                <div className="text-[13.5px]">
                  {t('invoices.bulkSummaryPaid', {
                    count: bulkSummary.paidCount,
                    total: formatMoney(bulkSummary.paidTotal),
                  })}
                </div>
              )}
              {bulkSummary.paidCount > 0 && (
                <div className="text-muted text-[12.5px]">
                  {t('invoices.bulkSummaryReceipts', {
                    list: bulkSummary.results
                      .filter((r) => r.status === 'paid' && r.receiptNo)
                      .map((r) => r.receiptNo)
                      .join(', '),
                  })}
                </div>
              )}
              {bulkSummary.skippedCount > 0 && (
                <div className="text-[13.5px] text-warn-text font-semibold">
                  {t('invoices.bulkSummarySkipped', { count: bulkSummary.skippedCount })}
                </div>
              )}
              {bulkSummary.failedCount > 0 && (
                <div className="text-[13.5px] text-bad-text font-semibold">
                  {t('invoices.bulkSummaryFailed', {
                    count: bulkSummary.failedCount,
                    reasons: [
                      ...new Set(
                        bulkSummary.results
                          .filter((r) => r.status === 'failed' && r.reason)
                          .map((r) => r.reason as string),
                      ),
                    ].join(' — '),
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label={t('common.close')}
              onClick={() => setBulkSummary(null)}
              className="shrink-0 p-1.5 rounded-full hover:bg-soft cursor-pointer text-muted"
            >
              <X size={18} />
            </button>
          </div>
        </Card>
      )}

      {teacherId && (
        <ProofsReviewSection teacherId={teacherId} reviewerId={teacherId} />
      )}

      {invoicesQ.isPending ? (
        <ListLoadingState label={t('invoices.loading')} />
      ) : invoicesQ.isError ? (
        <ErrorState
          message={invoicesQ.error instanceof Error ? invoicesQ.error.message : t('common.unknownError')}
          onRetry={() => void invalidatePrefixes(qc, [INV])}
        />
      ) : (
        <>
          {overdue.count > 0 && (
            <Card className="rise-in border-warn/50 bg-warn/5">
              {/* على الموبايل: النص فوق وزرّان بعرض كامل تحت بعضهما في صف —
                  الصف الأفقي القديم كان يضغط النص لعرض كلمة ويطرد زر «نسخ»
                  خارج حدود البطاقة عند 360px */}
              <div className="flex flex-col gap-3 min-[560px]:flex-row min-[560px]:items-center min-[560px]:justify-between min-[560px]:gap-2">
                <div className="min-w-0">
                  <div className="font-extrabold text-[16px] flex items-center gap-2"><AlertTriangle size={20} className="text-warn-text shrink-0" /> {t('invoices.overdueTitle')}</div>
                  <div className="text-muted text-[13.5px]">
                    {t('invoices.countTotal', { count: overdue.count, total: formatMoney(overdue.total) })}
                  </div>
                </div>
                <div className="flex gap-2 min-[560px]:shrink-0">
                  <Button variant="soft" size="sm" className="flex-1 min-[560px]:flex-none" onClick={() => setShowOverdue((v) => !v)}>
                    {showOverdue ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    {showOverdue ? t('invoices.hideList') : t('invoices.showList')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 min-[560px]:flex-none"
                    onClick={() => {
                      const text = overdue.rows
                        .map((r) => `${r.name}: ${formatMoney(r.total)}`)
                        .join('\n')
                      void navigator.clipboard
                        ?.writeText(text)
                        .then(() => toast(t('invoices.copiedOverdueList')))
                        .catch(() => toast(t('common.copyUnavailable')))
                    }}
                  >
                    <Copy size={16} />
                    {t('invoices.copyOverdue')}
                  </Button>
                </div>
              </div>
              {showOverdue && (
                <div className="mt-2 border-t border-warn/30 pt-2">
                  {overdue.rows.map((r) => (
                    <Link
                      key={r.studentId}
                      to={`/students/${r.studentId}`}
                      className="flex justify-between py-1.5 text-[13.5px] no-underline text-text border-b border-border/60 last:border-0"
                    >
                      <span className="font-semibold">{r.name}</span>
                      <span className="font-bold text-warn-text" dir="ltr">
                        {formatMoney(r.total)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              {currentDue.count > 0 && (
                <div className="text-muted text-[13.5px] mt-2 border-t border-warn/30 pt-2">
                  {t('invoices.plusCurrentDue', { month: currentMonthLabel, count: currentDue.count, total: formatMoney(currentDue.total) })}
                </div>
              )}
            </Card>
          )}

          {overdue.count === 0 && currentDue.count > 0 && (
            <Card className="rise-in">
              {/* مستحقات الشهر الحالي فقط: بطاقة محايدة بلا تلوين إنذاري —
                  الفواتير لسه في شهرها ولم تتجاوز استحقاقها (M4) */}
              <div className="flex flex-col gap-3 min-[560px]:flex-row min-[560px]:items-center min-[560px]:justify-between min-[560px]:gap-2">
                <div className="min-w-0">
                  <div className="font-extrabold text-[16px] flex items-center gap-2"><ReceiptText size={20} className="text-primary shrink-0" /> {t('invoices.currentDueTitle', { month: currentMonthLabel })}</div>
                  <div className="text-muted text-[13.5px]">
                    {t('invoices.currentDueLine', { count: currentDue.count, total: formatMoney(currentDue.total) })}
                  </div>
                </div>
                <div className="flex gap-2 min-[560px]:shrink-0">
                  <Button variant="soft" size="sm" className="flex-1 min-[560px]:flex-none" onClick={() => setShowCurrentDue((v) => !v)}>
                    {showCurrentDue ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    {showCurrentDue ? t('invoices.hideList') : t('invoices.showList')}
                  </Button>
                </div>
              </div>
              {showCurrentDue && (
                <div className="mt-2 border-t border-border pt-2">
                  {currentDue.rows.map((r) => (
                    <Link
                      key={r.studentId}
                      to={`/students/${r.studentId}`}
                      className="flex justify-between py-1.5 text-[13.5px] no-underline text-text border-b border-border/60 last:border-0"
                    >
                      <span className="font-semibold">{r.name}</span>
                      <span className="font-bold" dir="ltr">
                        {formatMoney(r.total)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          )}

          {filtered.length === 0 ? (
            <Card className="rise-in">
              <EmptyState
                mascot
                icon={ReceiptText}
                title={invoices.length === 0 ? t('invoices.emptyNoneTitle') : t('invoices.emptyNoMatchTitle')}
                hint={
                  invoices.length === 0
                    ? t('invoices.emptyNoneHint')
                    : t('invoices.emptyNoMatchHint')
                }
                action={
                  invoices.length === 0
                    ? { label: t('invoices.issueAction'), onClick: () => setIssueOpen(true), icon: ReceiptText }
                    : undefined
                }
              />
            </Card>
          ) : (
            <>
              {invoiceSections.map((section) => (
                <div key={section.period}>
                  <StickyGroupHeader bleed={false} top={GROUP_HEADER_TOP_WITH_SEARCH}>
                    {periodLabel(section.period)} · {section.items.length} فاتورة
                  </StickyGroupHeader>
                  <Card className="rise-in p-0 overflow-hidden" style={{ animationDelay: '60ms' }}>
                    {section.items.map((inv, i) => (
                      <InvoiceCard
                        key={inv.invoice_id}
                        inv={inv}
                        first={i === 0}
                        selected={paneInvoiceId === inv.invoice_id}
                        onDesktopSelect={setSelectedId}
                        selectMode={selectMode}
                        bulkSelected={selectedIds.has(inv.invoice_id)}
                        onToggleSelect={toggleSelect}
                      />
                    ))}
                  </Card>
                </div>
              ))}
              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-2 mt-1">
                  <Button
                    variant="soft"
                    disabled={currentPage === 0}
                    onClick={() => {
                      setPage(currentPage - 1)
                      window.scrollTo({ top: 0 })
                    }}
                  >
                    <ChevronRight size={18} />
                    {t('invoices.pagePrev')}
                  </Button>
                  <span className="text-muted text-[13px] font-semibold tabular-nums">
                    {t('invoices.pageOf', { page: currentPage + 1, pages: pageCount })}
                  </span>
                  <Button
                    variant="soft"
                    disabled={currentPage >= pageCount - 1}
                    onClick={() => {
                      setPage(currentPage + 1)
                      window.scrollTo({ top: 0 })
                    }}
                  >
                    {t('invoices.pageNext')}
                    <ChevronLeft size={18} />
                  </Button>
                </div>
              )}
              {/* حشوة تمرير سفلية: آخر فاتورة تمرّ بالكامل فوق الـ FAB
                  العائم فلا يحجب الزر صفها ولا شارة حالتها — وفي وضع
                  التحديد تكبر الحشوة حتى لا يحجب شريط الدفع الجماعي
                  الثابت آخر الصفوف أيضاً */}
              <div aria-hidden="true" className={selectMode ? 'h-[180px]' : 'h-[76px]'} />
            </>
          )}
        </>
      )}
      </div>

      {/* لوحة التفاصيل — List-Detail عند ≥1024px فقط */}
      <div className="hidden lg:block min-w-0 sticky top-[76px]">
        {paneInvoiceId ? (
          <InvoiceDetailPage key={paneInvoiceId} invoiceId={paneInvoiceId} />
        ) : (
          <Card>
            <EmptyState
              icon={ReceiptText}
              title={t('invoices.selectTitle')}
              hint={t('invoices.selectHint')}
            />
          </Card>
        )}
      </div>

      {/* الـFAB يختفي في وضع التحديد: الشريط الثابت هو إجراء الشاشة
          الوحيد حينها حتى لا يتداخلا فوق آخر القائمة */}
      {!selectMode && (
        <Fab
          onClick={() => setIssueOpen(true)}
          ariaLabel={t('invoices.fabIssueAria', { month: currentMonthLabel })}
          label={t('invoices.issueAction')}
          icon={ReceiptText}
        />
      )}

      {/* Sheet «تصفية حسب الشهر» — النمط الموحّد (كـSheet مجموعات الطلاب
          حرفياً): «كل الشهور» أولاً ثم الشهور الفعلية الأحدث أولاً،
          والفعّال مميّز بخلفية ناعمة وعلامة ✓ */}
      <Sheet open={monthOpen} onClose={() => setMonthOpen(false)} title={t('invoices.monthFilterTitle')}>
        <div className="flex flex-col gap-2 pb-2">
          {[
            { value: INVOICE_MONTH_ALL, label: t('invoices.monthFilterAll') },
            ...months.map((m) => ({ value: m, label: periodLabel(m) })),
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setMonthChoice(opt.value)
                setPage(0)
                setMonthOpen(false)
              }}
              className={`flex items-center justify-between min-h-[52px] px-3 rounded-xl border text-[15px] font-semibold cursor-pointer ${
                monthFilter === opt.value
                  ? 'bg-soft border-primary/40 text-primary'
                  : 'bg-card border-border text-text'
              }`}
            >
              {opt.label}
              {monthFilter === opt.value && <Check size={19} />}
            </button>
          ))}
        </div>
      </Sheet>

      {/* شريط الدفع الجماعي الثابت (وضع التحديد): عدد المحدد + إجمالي
          متبقيه + زر تسجيل الدفع — فوق شريط تنقّل التطبيق في الموبايل
          (bottom-[88px]) وعند أسفل الشاشة في الديسكتوب حيث لا شريط سفلي،
          مزاحاً بعد الشريط الجانبي (lg:start-[264px]) */}
      {selectMode && (
        <div className="fixed start-0 end-0 bottom-[88px] lg:bottom-5 lg:start-[264px] z-30 px-4">
          <div className="mx-auto max-w-[560px] bg-card border border-border-interactive rounded-2xl shadow-[0_16px_40px_-16px_rgba(15,23,42,0.5)] px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-[14.5px]">
                {t('invoices.bulkBarCount', { count: selTotals.count })}
              </div>
              <div className="text-muted text-[13px]">
                {t('invoices.bulkBarTotal', { total: formatMoney(selTotals.total) })}
              </div>
            </div>
            <Button
              disabled={selTotals.count === 0}
              onClick={() => setBulkConfirmOpen(true)}
            >
              {t('invoices.bulkPayAction')}
            </Button>
          </div>
        </div>
      )}

      {/* تأكيد الدفع الجماعي: خطوة واحدة قبل التنفيذ — عدد + إجمالي +
          طريقة دفع واحدة للكل (من PAYMENT_METHODS، مصدر الدفع الفردي
          نفسه)؛ التاريخ هو اليوم افتراضياً كما في الدفع الفردي */}
      <Sheet
        open={bulkConfirmOpen}
        onClose={() => {
          if (!bulkRunning) setBulkConfirmOpen(false)
        }}
        title={t('invoices.bulkConfirmTitle')}
        footer={
          <>
            <Button full disabled={bulkRunning || selTotals.count === 0} onClick={() => void runBulk()}>
              {bulkRunning ? t('invoices.bulkRunning') : t('invoices.bulkConfirmAction')}
            </Button>
            <Button
              full
              variant="ghost"
              className="mt-2"
              disabled={bulkRunning}
              onClick={() => setBulkConfirmOpen(false)}
            >
              {t('invoices.cancel')}
            </Button>
          </>
        }
      >
        <div className="pb-2">
          <p className="text-[14.5px] leading-[1.9] mb-3">
            {t('invoices.bulkConfirmLine', {
              count: selTotals.count,
              total: formatMoney(selTotals.total),
            })}
          </p>
          <Field label={t('invoices.sheetMethodLabel')}>
            <Select
              value={bulkMethod}
              disabled={bulkRunning}
              onChange={(e) => setBulkMethod(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Sheet>

      {issueOpen && teacherId && (
        <IssueInvoicesSheet teacherId={teacherId} onClose={() => setIssueOpen(false)} />
      )}
    </div>
    </PullToRefresh>
  )
}
