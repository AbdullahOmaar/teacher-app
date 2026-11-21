import { isUnpaid } from './api'
import { useMemo, useState } from 'react'
import { t } from '../../i18n'
import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/toast'
import { Button } from '../../components/ui/Button'
import { AlertTriangle, Lock, ReceiptText } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Fab } from '../../components/ui/Fab'
import { Chip } from '../../components/ui/form'
import {
  PageToolBar,
  StickyGroupHeader,
  GROUP_HEADER_TOP_WITH_SEARCH,
} from '../../components/ui/PageToolBar'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { Avatar } from '../../components/ui/Avatar'
import { ListRow } from '../../components/ui/ListRow'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatMoney } from '../../lib/format'
import { monthStartStr, todayStr } from '../home/api'
import { payStateOf, periodLabel, periodYm, type InvoiceListItem } from './api'
import { useInvoices } from './hooks'
import { InvoiceDetailPage } from './InvoiceDetailPage'
import { IssueInvoicesSheet } from './sheets'
import { ProofsReviewSection } from '../payment-proofs/components'

type FilterKey = 'all' | 'due' | 'partial' | 'paid'

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
        {t('invoices.badgePaid')}
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
      {t('invoices.badgeDue', { amount: formatMoney(inv.balance) })}
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
      className="block no-underline text-text"
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
        title={inv.student_name}
        secondary={
          <>
            {inv.group_name} · {periodLabel(inv.period_month)} (
            <span dir="ltr">{periodYm(inv.period_month)}</span>) ·{' '}
            {t('invoices.rowTotal', { amount: formatMoney(inv.total) })}
            {inv.paid > 0 ? ` · ${t('invoices.rowPaidPart', { amount: formatMoney(inv.paid) })}` : ''}
          </>
        }
        trailing={stateBadge(inv)}
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
  const teacher = useCurrentTeacher()
  const [params] = useSearchParams()
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined

  const [search, setSearch] = useState('')
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
  const { overdue, currentDue } = useMemo(() => {
    const aggregate = (list: InvoiceListItem[]) => {
      const byStudent = new Map<string, { name: string; total: number }>()
      for (const inv of list) {
        const cur = byStudent.get(inv.student_id) ?? { name: inv.student_name, total: 0 }
        cur.total += inv.balance
        byStudent.set(inv.student_id, cur)
      }
      const rows = [...byStudent.entries()]
        .map(([studentId, v]) => ({ studentId, ...v }))
        .sort((a, b) => b.total - a.total)
      return { rows, total: rows.reduce((s, r) => s + r.total, 0), count: rows.length }
    }
    const unpaid = invoices.filter(isUnpaid)
    return {
      overdue: aggregate(unpaid.filter((inv) => inv.period_month < currentMonth)),
      currentDue: aggregate(unpaid.filter((inv) => inv.period_month >= currentMonth)),
    }
  }, [invoices, currentMonth])

  // تجميع العرض بالشهر (W3 — R-11): الفواتير مرتبة بالفترة تنازلياً
  // أصلاً، فالتجميع المتتالي يحافظ على الترتيب ويضيف عنوان شهر لاصقاً
  const invoiceSections = useMemo(() => {
    const sections: { period: string; items: InvoiceListItem[] }[] = []
    for (const inv of filtered) {
      const last = sections[sections.length - 1]
      if (last && last.period === inv.period_month) last.items.push(inv)
      else sections.push({ period: inv.period_month, items: [inv] })
    }
    return sections
  }, [filtered])

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  if (!isOwner) {
    return (
      <Card className="text-center py-10">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
          <Lock size={28} />
        </div>
        <div className="type-section mb-1">{t('invoices.ownerOnlyTitle')}</div>
        <p className="text-muted text-[13.5px] mb-0">
          {t('invoices.ownerOnlyBody')}
        </p>
      </Card>
    )
  }

  const currentMonthLabel = periodLabel(monthStartStr(todayStr()))
  const paneInvoiceId =
    selectedId && filtered.some((i) => i.invoice_id === selectedId)
      ? selectedId
      : (filtered[0]?.invoice_id ?? null)

  return (
    <div className="lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-5 lg:items-start">
      <div className="min-w-0">
      {/* شريط الأدوات الموحّد (W3 — R-10): بحث + رقائق حالة + عدّاد */}
      <PageToolBar
        bleed={false}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: t('invoices.searchPlaceholder'),
        }}
        chips={FILTERS.map((f) => (
          <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
        resultCount={invoicesQ.isPending ? undefined : filtered.length}
      />

      {teacherId && (
        <ProofsReviewSection teacherId={teacherId} reviewerId={teacherId} />
      )}

      {invoicesQ.isPending ? (
        <LoadingState label={t('invoices.loading')} />
      ) : invoicesQ.isError ? (
        <ErrorState
          message={invoicesQ.error instanceof Error ? invoicesQ.error.message : t('common.unknownError')}
          onRetry={() => void invoicesQ.refetch()}
        />
      ) : (
        <>
          {overdue.count > 0 && (
            <Card className="border-warn/50 bg-warn/5">
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
                  <Button variant="soft" className="flex-1 min-[560px]:flex-none" onClick={() => setShowOverdue((v) => !v)}>
                    {showOverdue ? t('invoices.hideList') : t('invoices.showList')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1 min-[560px]:flex-none"
                    onClick={() => {
                      const text = overdue.rows
                        .map((r) => `${r.name}: ${formatMoney(r.total)}`)
                        .join('\n')
                      void navigator.clipboard
                        ?.writeText(text)
                        .then(() => toast(t('common.copiedOverdueList')))
                        .catch(() => toast(t('common.copyUnavailable')))
                    }}
                  >
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
            <Card>
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
                  <Button variant="soft" className="flex-1 min-[560px]:flex-none" onClick={() => setShowCurrentDue((v) => !v)}>
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
            <Card>
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
                    ? { label: t('invoices.issueAction'), onClick: () => setIssueOpen(true) }
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
                  <Card className="p-0 overflow-hidden">
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
  )
}
