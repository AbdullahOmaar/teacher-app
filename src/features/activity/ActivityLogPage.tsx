import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { t } from '../../i18n'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import { History, Search, X } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import {
  PageToolBar,
  StickyGroupHeader,
  GROUP_HEADER_TOP_WITH_SEARCH,
} from '../../components/ui/PageToolBar'
import { Sheet } from '../../components/ui/Sheet'
import { Chip, Field, Select, TextInput } from '../../components/ui/form'
import {
  ErrorState,
  LoadingState,
  NoTeacherProfile,
  SignInRequired,
  SkeletonRows,
} from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatClock12, formatMoney } from '../../lib/format'
import type { ActivityEventType, ActivityLogRow } from '../../types/database'
import { formatDateLabel } from '../schedule/api'
import {
  ACTOR_ROLE_LABELS,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_OPTIONS,
  type ActivityFilters,
} from './api'
import { ACTIVITY, useActivityActors, useActivityLog } from './hooks'

/** وقت الحدث بصيغة محلية مختصرة (ساعة:دقيقة) */
function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return formatClock12(d)
}

/**
 * سطر تفاصيل مقروء من jsonb المختصر — مفاتيح معروفة فقط وبصياغة عربية،
 * وأي مفتاح غير معروف يُتجاهل بدل عرض JSON خام في الواجهة.
 */
function detailsText(row: ActivityLogRow): string | null {
  const d = row.details ?? {}
  const parts: string[] = []
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

  const amount = num(d.amount)
  if (amount != null) parts.push(t('activity.detail.amount', { amount: formatMoney(amount) }))
  const method = str(d.method_label) ?? str(d.method)
  if (method) parts.push(t('activity.detail.method', { method }))
  const receipt = str(d.receipt_no)
  if (receipt) parts.push(t('activity.detail.receipt', { receipt }))
  const period = str(d.period_label) ?? str(d.period)
  if (period) parts.push(t('activity.detail.period', { period }))
  const created = num(d.created)
  if (created != null) parts.push(t('activity.detail.created', { count: created }))
  const skipped = num(d.skipped)
  if (skipped != null && skipped > 0) parts.push(t('activity.detail.skipped', { count: skipped }))
  const studentCount = num(d.student_count)
  if (studentCount != null) parts.push(t('activity.detail.students', { count: studentCount }))
  const present = num(d.present_count)
  if (present != null) parts.push(t('activity.detail.present', { count: present }))
  const absent = num(d.absent_count)
  if (absent != null) parts.push(t('activity.detail.absent', { count: absent }))
  const closingDate = str(d.closing_date)
  if (closingDate) parts.push(t('activity.detail.closingDay', { date: formatDateLabel(closingDate) }))
  const counted = num(d.counted_total)
  if (counted != null) parts.push(t('activity.detail.counted', { amount: formatMoney(counted) }))
  const expected = num(d.expected_total)
  if (expected != null) parts.push(t('activity.detail.expected', { amount: formatMoney(expected) }))
  const email = str(d.invited_email)
  if (email) parts.push(email)
  const reason = str(d.reason)
  if (reason) parts.push(t('activity.detail.reason', { reason }))
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * شاشة «سجل النشاط» (Phase 3 — الخطوة 2): قائمة زمنية أحدث أولاً بفلاتر
 * (نوع الحدث، الفاعل، من/إلى تاريخ) وبحث نصي خفيف على اسم الكيان/الفاعل.
 *
 * النطاق تفرضه RLS في قاعدة البيانات لا الواجهة:
 * • المالك يرى كل نشاط مدرسته.
 * • المساعد يرى نشاطه هو فقط (سياسة activity_log_assistant_select_own) —
 *   وتظهر له ملحوظة توضح النطاق، وفلتر الفاعل عنده = نفسه فقط بطبيعة
 *   البيانات المرجعة.
 * السجل للقراءة فقط: لا تعديل ولا حذف من التطبيق (لا سياسات لهما أصلاً).
 */
export function ActivityLogPage() {
  const qc = useQueryClient()
  const teacher = useCurrentTeacher()
  const isReady = teacher.status === 'ready'
  const teacherId = isReady ? teacher.teacherId : ''
  const role = isReady ? teacher.role : null

  const [eventType, setEventType] = useState<string>('')
  const [actorId, setActorId] = useState<string>('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [search, setSearch] = useState('')
  // Sheet «تصفية» النمط الموحّد (W3 — R-10): الفلاتر المتقدمة كانت بطاقة
  // كاملة تملأ أول شاشة قبل أي سجل — انتقلت هنا، والمفعّل منها رقائق إزالة
  const [filterOpen, setFilterOpen] = useState(false)

  const filters: ActivityFilters = useMemo(
    () => ({
      eventType: (eventType || null) as ActivityEventType | null,
      actorId: actorId || null,
      fromDate: fromDate || null,
      toDate: toDate || null,
      search: search.trim() || null,
    }),
    [eventType, actorId, fromDate, toDate, search],
  )

  const logQ = useActivityLog(teacherId || undefined, filters, isReady)
  const actorsQ = useActivityActors(teacherId || undefined, isReady)

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  const rows = logQ.data ?? []
  const hasFilters = Boolean(eventType || actorId || fromDate || toDate || search.trim())
  const advancedCount = [eventType, actorId, fromDate, toDate].filter(Boolean).length
  const clearAdvanced = () => {
    setEventType('')
    setActorId('')
    setFromDate('')
    setToDate('')
  }
  const actorName = (id: string) =>
    (actorsQ.data ?? []).find((a) => a.id === id)?.name ?? t('activity.page.actorFallback')
  const eventTypeLabel = (code: string) =>
    EVENT_TYPE_OPTIONS.find((o) => o.code === code)?.label ?? code

  // تجميع بصري حسب اليوم (الترتيب الزمني من الخادم كما هو)
  const groups: { day: string; items: ActivityLogRow[] }[] = []
  for (const row of rows) {
    const day = row.created_at.slice(0, 10)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(row)
    else groups.push({ day, items: [row] })
  }

  return (
    <PullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: [ACTIVITY] })}>
    <div>
      {/* شريط الأدوات الموحّد (W3 — R-10): بحث + فلاتر مفعّلة + تصفية */}
      <PageToolBar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: t('activity.page.searchPlaceholder'),
        }}
        chips={
          <>
            {eventType && (
              <Chip active onClick={() => setEventType('')}>
                {eventTypeLabel(eventType)} <X size={14} />
              </Chip>
            )}
            {actorId && (
              <Chip active onClick={() => setActorId('')}>
                {actorName(actorId)} <X size={14} />
              </Chip>
            )}
            {fromDate && (
              <Chip active onClick={() => setFromDate('')}>
                {t('activity.page.fromChip', { date: formatDateLabel(fromDate) })} <X size={14} />
              </Chip>
            )}
            {toDate && (
              <Chip active onClick={() => setToDate('')}>
                {t('activity.page.toChip', { date: formatDateLabel(toDate) })} <X size={14} />
              </Chip>
            )}
            {advancedCount > 0 && (
              <Chip active={false} onClick={clearAdvanced}>
                {t('activity.page.clearAll')}
              </Chip>
            )}
          </>
        }
        onFilter={() => setFilterOpen(true)}
        activeFilterCount={advancedCount}
        resultCount={logQ.isPending ? undefined : rows.length}
      />

      <Card className="rise-in" style={{ animationDelay: '0ms' }}>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2">
          <History size={22} className="text-primary" /> {t('activity.page.title')}
        </h2>
        <p className="text-muted text-[13.5px] mt-0 mb-0">
          {role === 'owner'
            ? t('activity.page.introOwner')
            : t('activity.page.introAssistant')}
        </p>
      </Card>

      {logQ.isPending ? (
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      ) : logQ.isError ? (
        <ErrorState
          message={logQ.error instanceof Error ? logQ.error.message : t('activity.page.loadError')}
          onRetry={() => void logQ.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          mascot
          title={hasFilters ? t('activity.page.emptyFilteredTitle') : t('activity.page.emptyTitle')}
          hint={
            hasFilters
              ? t('activity.page.emptyFilteredHint')
              : t('activity.page.emptyHint')
          }
        />
      ) : (
        groups.map((g) => (
          <div key={g.day} className="mb-4">
            <StickyGroupHeader top={GROUP_HEADER_TOP_WITH_SEARCH}>{formatDateLabel(g.day)}</StickyGroupHeader>
            <Card className="p-0 overflow-hidden rise-in" style={{ animationDelay: '50ms' }}>
              {g.items.map((row, i) => {
                const details = detailsText(row)
                return (
                  <div
                    key={row.id}
                    className={`px-4 py-3 ${i < g.items.length - 1 ? 'border-b border-border' : ''}`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold text-[15px]">
                        {EVENT_TYPE_LABELS[row.event_type] ?? row.event_type}
                        {row.entity_label ? (
                          <span className="text-primary"> — {row.entity_label}</span>
                        ) : null}
                      </span>
                      <span className="text-muted text-[12.5px] shrink-0">{timeLabel(row.created_at)}</span>
                    </div>
                    <div className="text-muted text-[13px] mt-0.5">
                      {row.actor_name ?? t('activity.page.userFallback')} · {ACTOR_ROLE_LABELS[row.actor_role]}
                      {details ? ` · ${details}` : ''}
                    </div>
                  </div>
                )
              })}
            </Card>
          </div>
        ))
      )}
      {rows.length > 0 && (
        <p className="text-muted text-[12.5px] text-center mb-0">
          معروض أحدث {rows.length} حدث مطابق — ضيّق الفلاتر لو بتدور على حدث أقدم.
        </p>
      )}

      {/* Sheet «تصفية» النمط الموحّد (W3): نوع/فاعل/مدى زمني — تطبق فوراً
          وتظهر رقائقها القابلة للإزالة في الشريط */}
      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title={t('activity.page.filterTitle')}>
        <div className="pb-2">
          <Field label={t('activity.page.typeLabel')}>
            <Select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="">{t('activity.page.allEvents')}</option>
              {EVENT_TYPE_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('activity.page.actorLabel')}>
            <Select value={actorId} onChange={(e) => setActorId(e.target.value)}>
              <option value="">{t('activity.page.allActors')}</option>
              {(actorsQ.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({ACTOR_ROLE_LABELS[a.role]})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('activity.page.fromLabel')}>
            <TextInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Field>
          <Field label={t('activity.page.toLabel')}>
            <TextInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </Field>
          <div className="flex gap-2 mt-1">
            <Button full variant="ghost" onClick={clearAdvanced} disabled={advancedCount === 0}>
              {t('activity.page.clearAll')}
            </Button>
            <Button full onClick={() => setFilterOpen(false)}>
              <Search size={18} />
              {t('activity.page.showResults')}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
    </PullToRefresh>
  )
}
