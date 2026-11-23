import { invalidatePrefixes } from '../../lib/invalidate'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { t } from '../../i18n'
import { Link, useSearchParams } from 'react-router-dom'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import { Card } from '../../components/ui/Card'
import { Check, UserPlus, Users, X } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Fab } from '../../components/ui/Fab'
import {
  PageToolBar,
  StickyGroupHeader,
  GROUP_HEADER_TOP_WITH_SEARCH,
} from '../../components/ui/PageToolBar'
import { Sheet } from '../../components/ui/Sheet'
import { Chip } from '../../components/ui/form'
import { ErrorState, ListLoadingState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { Avatar } from '../../components/ui/Avatar'
import { ListRow } from '../../components/ui/ListRow'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatMoney } from '../../lib/format'
import { useGroups } from '../groups/hooks'
import { SG, useEnrollments, useStudentBalances, useStudents } from './hooks'
import { StudentDetailPage } from './StudentDetailPage'
import { StudentFormSheet } from './StudentFormSheet'
import { StudentImportSheet } from './import/StudentImportSheet'

type StatusFilter = 'all' | 'late' | 'ok' | 'paused'

const STATUS_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: t('students.statusAll') },
  { key: 'late', label: t('students.statusLate') },
  { key: 'ok', label: t('common.paid') },
  { key: 'paused', label: t('students.statusPaused') },
]

/**
 * شاشة الطلاب (المواصفات §3.3): بحث فوري (الاسم/الكود/الموبايل/المدرسة/الصف)،
 * رقائق حالة، ورقائق مجموعة (تظهر عند وجود أكثر من مجموعة).
 * فلتر «موقوف» هو الوحيد الذي يُظهر الموقوفين.
 */
export function StudentsPage() {
  const qc = useQueryClient()
  const teacher = useCurrentTeacher()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [formOpen, setFormOpen] = useState(false)
  // Sheet «تصفية» النمط الموحّد (W3): فلتر المجموعة المتقدم كان صف رقائق
  // ثانياً مكدّساً فوق المحتوى — انتقل هنا، والمفعّل منه يظهر رقاقة إزالة
  const [filterOpen, setFilterOpen] = useState(false)
  // استيراد الملفات: يُفتح من الرابط العميق (?import=1) — صف «المزيد»
  // أو رابط شاشة التصدير (و-8: لا زر أعلى القائمة بعد الآن)
  const [importOpen, setImportOpen] = useState(() => searchParams.get('import') === '1')
  // اختيار List-Detail عند ≥1024px — تحت هذا العرض يبقى التنقل لصفحة التفاصيل
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const studentsQ = useStudents(teacherId)
  const enrollmentsQ = useEnrollments(teacherId)
  const groupsQ = useGroups(teacherId)
  const balancesQ = useStudentBalances(teacherId)

  const groupFilter = searchParams.get('group') ?? ''

  const filtered = useMemo(() => {
    const students = studentsQ.data ?? []
    const enrollments = enrollmentsQ.data ?? []
    const balances = balancesQ.data
    const q = search.trim().toLowerCase()

    const groupIdsByStudent = new Map<string, string[]>()
    for (const e of enrollments) {
      const arr = groupIdsByStudent.get(e.student_id) ?? []
      arr.push(e.group_id)
      groupIdsByStudent.set(e.student_id, arr)
    }

    return students.filter((s) => {
      // فلتر الحالة — الموقوفون لا يظهرون إلا في فلترهم
      if (status === 'paused') {
        if (!s.paused) return false
      } else if (s.paused) {
        return false
      }
      if (status === 'late' && !((balances?.get(s.id) ?? 0) > 0)) return false
      // «مسدد» تعني فواتير موجودة ومُسوّاة: طالب بلا أي فاتورة (لا صف له
      // في student_balances) حالته محايدة «{t('students.badgeNoInvoices')}» لا «مسدد» (L1)
      if (
        status === 'ok' &&
        balances &&
        !(balances.has(s.id) && (balances.get(s.id) ?? 0) <= 0)
      )
        return false
      // فلتر المجموعة
      if (groupFilter && !(groupIdsByStudent.get(s.id) ?? []).includes(groupFilter)) return false
      // البحث
      if (q) {
        const hay = [s.name, s.public_code, s.phone ?? '', s.guardian_phone ?? '', s.school ?? '', s.grade ?? '']
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [studentsQ.data, enrollmentsQ.data, balancesQ.data, search, status, groupFilter])

  const groupNameById = useMemo(
    () => new Map((groupsQ.data ?? []).map((g) => [g.id, g.name])),
    [groupsQ.data],
  )
  const groupNamesByStudent = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const e of enrollmentsQ.data ?? []) {
      const arr = map.get(e.student_id) ?? []
      const name = groupNameById.get(e.group_id)
      if (name) arr.push(name)
      map.set(e.student_id, arr)
    }
    return map
  }, [enrollmentsQ.data, groupNameById])

  // تجميع العرض بمجموعة الطالب الأولى (W3 — R-11: عناوين مجموعات لاصقة
  // في قوائم السجلات): يعمل فقط بلا فلتر مجموعة صريح وعند تعدد المجموعات،
  // وإلا قائمة واحدة كما كانت. ترتيب الأقسام = أول ظهور في القائمة
  // المفلترة، و«بلا مجموعة» أخيراً دائماً.
  const sections = useMemo(() => {
    const multi = (groupsQ.data?.length ?? 0) > 1
    if (!multi || groupFilter) {
      return [{ title: null as string | null, items: filtered }]
    }
    const order: string[] = []
    const byTitle = new Map<string, typeof filtered>()
    for (const s of filtered) {
      const title = (groupNamesByStudent.get(s.id) ?? [])[0] ?? t('students.noGroup')
      if (!byTitle.has(title)) {
        byTitle.set(title, [])
        order.push(title)
      }
      byTitle.get(title)!.push(s)
    }
    const noGroupIdx = order.indexOf(t('students.noGroup'))
    if (noGroupIdx >= 0) {
      order.splice(noGroupIdx, 1)
      order.push(t('students.noGroup'))
    }
    return order.map((title) => ({ title: title as string | null, items: byTitle.get(title)! }))
  }, [filtered, groupsQ.data, groupFilter, groupNamesByStudent])

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  const isAssistant = teacher.role === 'assistant'
  const loading = studentsQ.isPending || enrollmentsQ.isPending || groupsQ.isPending
  const error = studentsQ.error ?? enrollmentsQ.error ?? groupsQ.error

  const paneStudentId =
    selectedId && filtered.some((s) => s.id === selectedId)
      ? selectedId
      : (filtered[0]?.id ?? null)

  return (
    <PullToRefresh onRefresh={() => invalidatePrefixes(qc, [SG])}>
    <div className="lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-5 lg:items-start">
      <div className="min-w-0">
      {/* شريط الأدوات الموحّد (W3 — R-10): بحث + رقائق حالة + تصفية
          المجموعة من Sheet، وفلتر المجموعة المفعّل رقاقة قابلة للإزالة */}
      <PageToolBar
        bleed={false}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: t('students.searchPlaceholder'),
        }}
        chips={
          <>
            {groupFilter && (
              <Chip
                active
                onClick={() => setSearchParams({}, { replace: true })}
              >
                {groupNameById.get(groupFilter) ?? t('groups.groupFallback')} <X size={14} />
              </Chip>
            )}
            {STATUS_CHIPS.map((c) => (
              <Chip key={c.key} active={status === c.key} onClick={() => setStatus(c.key)}>
                {c.label}
              </Chip>
            ))}
          </>
        }
        onFilter={(groupsQ.data?.length ?? 0) > 1 ? () => setFilterOpen(true) : undefined}
        activeFilterCount={groupFilter ? 1 : 0}
        resultCount={loading ? undefined : filtered.length}
      />

      {/* زر الاستيراد كان هنا أعلى القائمة (يدفعها 64px كل زيارة) —
          انتقل لصف في قائمة «المزيد» برابط عميق /students?import=1 (و-8)،
          ونفس الرابط من شاشة التصدير ما زال يعمل */}
      {loading ? (
        <ListLoadingState label={t('students.loading')} />
      ) : error ? (
        <ErrorState
          message={error instanceof Error ? error.message : t('common.unknownError')}
          onRetry={() => {
            // PAT-1 (3A-377): إعادة محاولة موجّهة للاستعلامات الفاشلة نفسها — إبطال 'sg' كان سيعيد جلب الأرصدة السليمة أيضاً.
            void studentsQ.refetch()
            void enrollmentsQ.refetch()
            void groupsQ.refetch()
          }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          mascot
          icon={Users}
          title={(studentsQ.data?.length ?? 0) === 0 ? t('students.emptyNoneTitle') : t('students.emptyNoMatchTitle')}
          hint={
            (studentsQ.data?.length ?? 0) === 0
              ? t('students.emptyNoneHint')
              : t('students.emptyNoMatchHint')
          }
          action={
            (studentsQ.data?.length ?? 0) === 0
              ? { label: t('students.addStudent'), onClick: () => setFormOpen(true), icon: UserPlus }
              : undefined
          }
        />
      ) : (
        <>
        {sections.map((section, si) => (
          <div key={section.title ?? '__all'}>
            {section.title && (
              <StickyGroupHeader bleed={false} top={GROUP_HEADER_TOP_WITH_SEARCH}>
                {t('students.sectionHeader', { title: section.title, count: section.items.length })}
              </StickyGroupHeader>
            )}
            <Card
              className="rise-in p-0 overflow-hidden"
              style={{ animationDelay: `${Math.min(si, 8) * 35}ms` }}
            >
              {section.items.map((s, i) => {
            const balance = balancesQ.data?.get(s.id) ?? 0
            // وجود صف في خريطة الأرصدة = للطالب فواتير أصلاً (الـ view
            // يجمع invoice_balances فقط) — غيابه حالة محايدة (L1)
            const hasInvoices = balancesQ.data?.has(s.id) ?? false
            const names = groupNamesByStudent.get(s.id) ?? []
            const selected = paneStudentId === s.id
            return (
              <Link
                key={s.id}
                to={`/students/${s.id}`}
                className="block no-underline text-text"
                onClick={(e) => {
                  // عند ≥1024px الاختيار يعرض التفاصيل في اللوحة الجانبية بلا تنقل؛
                  // تحت هذا العرض يبقى الرابط تنقلاً عادياً لصفحة التفاصيل
                  if (window.matchMedia('(min-width: 1024px)').matches) {
                    e.preventDefault()
                    setSelectedId(s.id)
                  }
                }}
              >
                <ListRow
                  first={i === 0}
                  className={`${s.paused ? 'opacity-60' : ''} ${selected ? 'lg:bg-soft' : ''}`}
                  leading={<Avatar name={s.name} />}
                  title={
                    <>
                      {s.name}
                      {s.paused && (
                        /* (3A-651): نفس تشريح شارة «خصم» — inline-flex
                           بدل span inline حتى لا تنكسر الكبسولة داخل سطر
                           الاسم */
                        <span className="ms-2 inline-flex items-center whitespace-nowrap leading-none type-badge bg-warn-soft text-warn-text border border-warn/40 rounded-full px-2 py-1 align-middle">
                          {t('students.badgePaused')}
                        </span>
                      )}
                    </>
                  }
                  secondary={
                    /* الصف والمجموعة فقط — كود الطالب أُخرج من هذا السطر
                       حتى لا يزاحم أسماء المجموعات (يبقى في ملف الطالب
                       والبحث به يعمل كما هو) */
                    <>
                      {s.grade ?? ''}
                      {s.grade && names.length ? ' · ' : ''}
                      {names.length ? names.join(t('students.nameSeparator')) : ''}
                    </>
                  }
                  trailing={
                    !isAssistant && balancesQ.data ? (
                      balance > 0 ? (
                        <span className="shrink-0 type-badge bg-warn-soft text-warn-text border border-warn/40 rounded-full px-2 py-0.5">
                          {t('common.remaining', { amount: formatMoney(balance) })}
                        </span>
                      ) : hasInvoices ? (
                        <span className="shrink-0 type-badge bg-ok-soft text-ok-text border border-ok/30 rounded-full px-2 py-0.5">
                          {t('common.paid')}
                        </span>
                      ) : (
                        <span className="shrink-0 type-badge bg-soft text-muted border border-border rounded-full px-2 py-0.5">
                          {t('students.badgeNoInvoices')}
                        </span>
                      )
                    ) : undefined
                  }
                />
              </Link>
                )
              })}
            </Card>
          </div>
        ))}
        {/* حشوة تمرير سفلية: آخر صف يمرّ بالكامل فوق الـ FAB العائم
            فلا يحجب الزر الصف الأخير ولا شاراته */}
        <div aria-hidden="true" className="h-[76px]" />
        </>
      )}
      </div>

      {/* لوحة التفاصيل — List-Detail عند ≥1024px فقط */}
      <div className="hidden lg:block min-w-0 sticky top-[76px]">
        {paneStudentId ? (
          <StudentDetailPage key={paneStudentId} studentId={paneStudentId} />
        ) : (
          <Card className="rise-in" style={{ animationDelay: '50ms' }}>
            <EmptyState
              icon={Users}
              title={t('students.selectTitle')}
              hint={t('students.selectHint')}
            />
          </Card>
        )}
      </div>

      <Fab onClick={() => setFormOpen(true)} ariaLabel={t('students.fabAddAria')} label={t('students.fabNew')} />

      {importOpen && (
        <StudentImportSheet
          onClose={() => {
            setImportOpen(false)
            if (searchParams.get('import')) {
              const next = new URLSearchParams(searchParams)
              next.delete('import')
              setSearchParams(next, { replace: true })
            }
          }}
          teacherId={teacher.teacherId}
          groups={groupsQ.data ?? []}
          students={studentsQ.data ?? []}
        />
      )}

      {formOpen && (
        <StudentFormSheet
          onClose={() => setFormOpen(false)}
          teacherId={teacher.teacherId}
          groups={groupsQ.data ?? []}
          initial={null}
          initialEnrollments={[]}
        />
      )}

      {/* Sheet «تصفية» النمط الموحّد (W3): اختيار المجموعة — الفلاتر
          المتقدمة لا تكدَّس فوق المحتوى بعد اليوم */}
      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title={t('students.filterByGroup')}>
        <div className="flex flex-col gap-2 pb-2">
          <button
            type="button"
            onClick={() => {
              setSearchParams({}, { replace: true })
              setFilterOpen(false)
            }}
            className={`flex items-center justify-between min-h-[52px] px-3 rounded-xl border text-[15px] font-semibold cursor-pointer ${
              !groupFilter ? 'bg-soft border-primary/40 text-primary' : 'bg-card border-border text-text'
            }`}
          >
            {t('students.allGroups')}
            {!groupFilter && <Check size={19} />}
          </button>
          {(groupsQ.data ?? []).map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setSearchParams({ group: g.id }, { replace: true })
                setFilterOpen(false)
              }}
              className={`flex items-center justify-between min-h-[52px] px-3 rounded-xl border text-[15px] font-semibold cursor-pointer ${
                groupFilter === g.id
                  ? 'bg-soft border-primary/40 text-primary'
                  : 'bg-card border-border text-text'
              }`}
            >
              {g.name}
              {groupFilter === g.id && <Check size={19} />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
    </PullToRefresh>
  )
}
