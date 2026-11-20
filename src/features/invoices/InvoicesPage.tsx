import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/toast'
import { Button } from '../../components/ui/Button'
import { AlertTriangle, Lock, ReceiptText } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Fab } from '../../components/ui/Fab'
import { Chip, ChipRow, TextInput } from '../../components/ui/form'
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

type FilterKey = 'all' | 'due' | 'partial' | 'paid'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'due', label: 'مستحقة' },
  { key: 'partial', label: 'جزئية' },
  { key: 'paid', label: 'مسددة' },
]

function stateBadge(inv: InvoiceListItem) {
  const state = payStateOf(inv)
  if (state === 'paid')
    return (
      <span className="shrink-0 type-badge bg-ok-soft text-ok-text border border-ok/30 rounded-full px-2 py-0.5">
        مسدد
      </span>
    )
  if (state === 'partial')
    return (
      <span className="shrink-0 type-badge bg-soft text-primary border border-primary/30 rounded-full px-2 py-0.5">
        جزئي — باقي {formatMoney(inv.balance)}
      </span>
    )
  return (
    <span className="shrink-0 type-badge bg-warn-soft text-warn-text border border-warn/40 rounded-full px-2 py-0.5">
      باقي {formatMoney(inv.balance)}
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
            <span dir="ltr">{periodYm(inv.period_month)}</span>) · الإجمالي{' '}
            {formatMoney(inv.total)}
            {inv.paid > 0 ? ` · مدفوع ${formatMoney(inv.paid)}` : ''}
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

  // المتأخرات: تجميع أرصدة الطلاب المستحقة من نفس view الأرصدة
  const overdue = useMemo(() => {
    const byStudent = new Map<string, { name: string; total: number }>()
    for (const inv of invoices) {
      if (inv.balance <= 0) continue
      const cur = byStudent.get(inv.student_id) ?? { name: inv.student_name, total: 0 }
      cur.total += inv.balance
      byStudent.set(inv.student_id, cur)
    }
    const rows = [...byStudent.entries()]
      .map(([studentId, v]) => ({ studentId, ...v }))
      .sort((a, b) => b.total - a.total)
    return { rows, total: rows.reduce((s, r) => s + r.total, 0), count: rows.length }
  }, [invoices])

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  if (!isOwner) {
    return (
      <Card className="text-center py-10">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
          <Lock size={28} />
        </div>
        <div className="type-section mb-1">الفواتير والمالية للمالك فقط</div>
        <p className="text-muted text-[13.5px] mb-0">
          حساب المساعد لا يملك صلاحية مالية — الفواتير والدفعات محجوبة في قاعدة البيانات نفسها
          (RLS) وليس في الواجهة فقط.
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
      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <TextInput
            placeholder="ابحث باسم الطالب أو الشهر (2026-11)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <ChipRow>
        {FILTERS.map((f) => (
          <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
      </ChipRow>

      {invoicesQ.isPending ? (
        <LoadingState label="بنحمّل الفواتير…" />
      ) : invoicesQ.isError ? (
        <ErrorState
          message={invoicesQ.error instanceof Error ? invoicesQ.error.message : 'خطأ غير معروف'}
          onRetry={() => void invoicesQ.refetch()}
        />
      ) : (
        <>
          {overdue.count > 0 && (
            <Card className="border-warn/50 bg-warn/5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-extrabold text-[16px] flex items-center gap-2"><AlertTriangle size={20} className="text-warn-text" /> متأخرات مستحقة</div>
                  <div className="text-muted text-[13.5px]">
                    {overdue.count} طالب · إجمالي {formatMoney(overdue.total)}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="soft" onClick={() => setShowOverdue((v) => !v)}>
                    {showOverdue ? 'إخفاء القائمة' : 'عرض القائمة'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const text = overdue.rows
                        .map((r) => `${r.name}: ${formatMoney(r.total)}`)
                        .join('\n')
                      void navigator.clipboard
                        ?.writeText(text)
                        .then(() => toast('اتنسخت قائمة المتأخرات'))
                        .catch(() => toast('النسخ مش متاح في المتصفح ده'))
                    }}
                  >
                    نسخ المتأخرات
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
            </Card>
          )}

          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon={ReceiptText}
                title={invoices.length === 0 ? 'لسه مفيش فواتير' : 'مفيش فواتير مطابقة'}
                hint={
                  invoices.length === 0
                    ? 'اصدر فواتير الشهر من الزر العائم — لكل طالب نشط بسعره الفعلي وحسب نظام فوترة مجموعته.'
                    : 'جرّب كلمة بحث أو فلتر تاني.'
                }
                action={
                  invoices.length === 0
                    ? { label: 'إصدار فواتير الشهر', onClick: () => setIssueOpen(true) }
                    : undefined
                }
              />
            </Card>
          ) : (
            <Card className="p-0 overflow-hidden">
              {filtered.map((inv, i) => (
                <InvoiceCard
                  key={inv.invoice_id}
                  inv={inv}
                  first={i === 0}
                  selected={paneInvoiceId === inv.invoice_id}
                  onDesktopSelect={setSelectedId}
                />
              ))}
            </Card>
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
              title="اختر فاتورة من القائمة"
              hint="تفاصيل الفاتورة المحددة هتظهر هنا — أو عدّل البحث والفلاتر."
            />
          </Card>
        )}
      </div>

      <Fab
        onClick={() => setIssueOpen(true)}
        ariaLabel={`إصدار فواتير ${currentMonthLabel}`}
        label={`إصدار فواتير ${currentMonthLabel}`}
        icon={ReceiptText}
      />

      {issueOpen && teacherId && (
        <IssueInvoicesSheet teacherId={teacherId} onClose={() => setIssueOpen(false)} />
      )}
    </div>
  )
}
