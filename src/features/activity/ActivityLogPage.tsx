import { useMemo, useState } from 'react'
import { History, Search } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, Select, TextInput } from '../../components/ui/form'
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
import { useActivityActors, useActivityLog } from './hooks'

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
  if (amount != null) parts.push(`المبلغ: ${formatMoney(amount)}`)
  const method = str(d.method_label) ?? str(d.method)
  if (method) parts.push(`الطريقة: ${method}`)
  const receipt = str(d.receipt_no)
  if (receipt) parts.push(`إيصال ${receipt}`)
  const period = str(d.period_label) ?? str(d.period)
  if (period) parts.push(`فترة: ${period}`)
  const created = num(d.created)
  if (created != null) parts.push(`أُنشئت ${created} فاتورة`)
  const skipped = num(d.skipped)
  if (skipped != null && skipped > 0) parts.push(`اتخطّت ${skipped} (موجودة)`)
  const studentCount = num(d.student_count)
  if (studentCount != null) parts.push(`${studentCount} طالب`)
  const present = num(d.present_count)
  if (present != null) parts.push(`حاضر/متأخر/تعويضية: ${present}`)
  const absent = num(d.absent_count)
  if (absent != null) parts.push(`غائب: ${absent}`)
  const closingDate = str(d.closing_date)
  if (closingDate) parts.push(`يوم: ${formatDateLabel(closingDate)}`)
  const counted = num(d.counted_total)
  if (counted != null) parts.push(`المعدود: ${formatMoney(counted)}`)
  const expected = num(d.expected_total)
  if (expected != null) parts.push(`المتوقع: ${formatMoney(expected)}`)
  const email = str(d.invited_email)
  if (email) parts.push(email)
  const reason = str(d.reason)
  if (reason) parts.push(`السبب: ${reason}`)
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
  const teacher = useCurrentTeacher()
  const isReady = teacher.status === 'ready'
  const teacherId = isReady ? teacher.teacherId : ''
  const role = isReady ? teacher.role : null

  const [eventType, setEventType] = useState<string>('')
  const [actorId, setActorId] = useState<string>('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [search, setSearch] = useState('')

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

  // تجميع بصري حسب اليوم (الترتيب الزمني من الخادم كما هو)
  const groups: { day: string; items: ActivityLogRow[] }[] = []
  for (const row of rows) {
    const day = row.created_at.slice(0, 10)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(row)
    else groups.push({ day, items: [row] })
  }

  return (
    <div>
      <Card>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2">
          <History size={22} className="text-primary" /> سجل النشاط
        </h2>
        <p className="text-muted text-[13.5px] mt-0 mb-0">
          {role === 'owner'
            ? 'كل الأحداث الجوهرية في حسابك: مين عمل إيه وإمتى — دفعات وفواتير وحضور وعضويات وإثباتات وحذف/أرشفة وإغلاقات خزنة. السجل للقراءة فقط ولا يمكن تعديله أو مسحه من التطبيق.'
            : 'بتشوف هنا نشاطك إنت بس داخل حساب المدرس (تسجيلك للحضور والعمليات اللي عملتها) — نشاط المالك وباقي الفريق محجوب عنك في قاعدة البيانات نفسها.'}
        </p>
      </Card>

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
          <Field label="نوع الحدث">
            <Select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="">كل الأحداث</option>
              {EVENT_TYPE_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الفاعل">
            <Select value={actorId} onChange={(e) => setActorId(e.target.value)}>
              <option value="">الكل</option>
              {(actorsQ.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({ACTOR_ROLE_LABELS[a.role]})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="من تاريخ">
            <TextInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Field>
          <Field label="إلى تاريخ">
            <TextInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </Field>
        </div>
        <Field label="بحث (اسم طالب/مجموعة/فاعل…)">
          <div className="relative">
            <Search
              size={18}
              className="absolute start-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث في السجل…"
              className="ps-10"
            />
          </div>
        </Field>
      </Card>

      {logQ.isPending ? (
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      ) : logQ.isError ? (
        <ErrorState
          message={logQ.error instanceof Error ? logQ.error.message : 'تعذّر تحميل سجل النشاط.'}
          onRetry={() => void logQ.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'مفيش أحداث مطابقة للفلاتر' : 'لسه مفيش نشاط مسجل'}
          hint={
            hasFilters
              ? 'جرّب توسّع المدى الزمني أو تشيل فلتر — الأحداث بتتسجل تلقائياً من العمليات الجوهرية بس.'
              : 'أول ما تسجّل دفعة أو حضور أو أي عملية جوهرية هتظهر هنا بفاعلها ووقتها.'
          }
        />
      ) : (
        groups.map((g) => (
          <div key={g.day} className="mb-4">
            <div className="text-[13.5px] font-bold text-muted mb-2 px-1">
              {formatDateLabel(g.day)}
            </div>
            <Card className="p-0 overflow-hidden">
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
                      {row.actor_name ?? 'مستخدم'} · {ACTOR_ROLE_LABELS[row.actor_role]}
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
    </div>
  )
}
