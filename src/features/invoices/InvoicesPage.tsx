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
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, ReceiptText } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Fab } from '../../components/ui/Fab'
import { Chip } from '../../components/ui/form'
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
import { payStateOf, periodLabel, periodYm, type InvoiceListItem } from './api'
import { INV, useInvoices } from './hooks'
import { InvoiceDetailPage } from './InvoiceDetailPage'
import { IssueInvoicesSheet } from './sheets'
import { ProofsReviewSection } from '../payment-proofs/components'

type FilterKey = 'all' | 'due' | 'partial' | 'paid'

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
}: {
  inv: InvoiceListItem
  first?: boolean
  selected?: boolean
  onDesktopSelect?: (id: string) => void
}) {
  return (
    <Link
      to={`/invoices/${inv.invoice_id}`}
      className="block no-underline text-text active:bg-soft"
      onClick={(e) => {
        // عند ≥1024px الاختيار يعرض التفاصيل في اللوحة الجانبية بلا تنقل
        if (onDesktopSelect && window.matchMedia('(min-width: 1024px)').matches) {
          e.preventDefault()
          onDesktopSelect(inv.invoice_id)
        }
      }}
    >
      <ListRow
        first={first}
        className={selected ? 'lg:bg-soft' : ''}
        leading={<Avatar name={inv.student_name} />}
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
 * يفتح على «مستحقة»)، بطاقة متأخرات، وزر إصدار فواتير الشهر.
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
  const [issueOpen, setIssueOpen] = useState(false)
  const [showOverdue, setShowOverdue] = useState(false)
  const [showCurrentDue, setShowCurrentDue] = useState(false)
  // اختيار List-Detail عند ≥1024px — تحت هذا العرض يبقى التنقل لصفحة التفاصيل
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const toast = useToast()

  const invoicesQ = useInvoices(teacherId, isOwner)
  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return invoices.filter((inv) => {
      if (filter === 'due' && !(inv.balance > 0)) return false
      if (filter === 'partial' && !(inv.paid > 0 && inv.balance > 0)) return false
      if (filter === 'paid' && !(inv.balance <= 0)) return false
      if (!q) return true
      return (
        inv.student_name.toLowerCase().includes(q) ||
        periodYm(inv.period_month).includes(q) ||
        periodLabel(inv.period_month).includes(q)
      )
    })
  }, [invoices, search, filter])

  // تعريف «متأخر» المعتمد في التطبيق (تدقيق أول استخدام — M4): فاتورة
  // شهرٍ سابق برصيد موجب — هكذا يحسب الملخص اليومي في migration ‏0015
  // حرفياً (period_month < أول الشهر الحالي). فواتير الشهر الحالي غير
  // المسددة «مستحقات جارية» لا «متأخرات»، فلا تدخل بطاقة المتأخرات
  // (كانت فواتير تُصدر للتوّ تظهر «متأخرات مستحقة» بعد دقيقة من إصدارها).
  const currentMonth = monthStartStr(todayStr())
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
        chips={FILTERS.map((f) => (
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
        resultCount={invoicesQ.isPending ? undefined : filtered.length}
      />

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
                  العائم فلا يحجب الزر صفها ولا شارة حالتها */}
              <div aria-hidden="true" className="h-[76px]" />
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

      <Fab
        onClick={() => setIssueOpen(true)}
        ariaLabel={t('invoices.fabIssueAria', { month: currentMonthLabel })}
        label={t('invoices.issueAction')}
        icon={ReceiptText}
      />

      {issueOpen && teacherId && (
        <IssueInvoicesSheet teacherId={teacherId} onClose={() => setIssueOpen(false)} />
      )}
    </div>
    </PullToRefresh>
  )
}
