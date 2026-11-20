import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Search, Upload, Users } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Fab } from '../../components/ui/Fab'
import { Chip, ChipRow, TextInput } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { Avatar } from '../../components/ui/Avatar'
import { ListRow } from '../../components/ui/ListRow'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatMoney } from '../../lib/format'
import { useGroups } from '../groups/hooks'
import { useEnrollments, useStudentBalances, useStudents } from './hooks'
import { StudentDetailPage } from './StudentDetailPage'
import { StudentFormSheet } from './StudentFormSheet'
import { StudentImportSheet } from './import/StudentImportSheet'

type StatusFilter = 'all' | 'late' | 'ok' | 'paused'

const STATUS_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'النشطين' },
  { key: 'late', label: 'عليه متأخرات' },
  { key: 'ok', label: 'مسدد' },
  { key: 'paused', label: 'موقوف / أرشيف' },
]

/**
 * شاشة الطلاب (المواصفات §3.3): بحث فوري (الاسم/الكود/الموبايل/المدرسة/الصف)،
 * رقائق حالة، ورقائق مجموعة (تظهر عند وجود أكثر من مجموعة).
 * فلتر «موقوف» هو الوحيد الذي يُظهر الموقوفين.
 */
export function StudentsPage() {
  const teacher = useCurrentTeacher()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [formOpen, setFormOpen] = useState(false)
  // استيراد الملفات: يُفتح من زر الشاشة أو من رابط شاشة التصدير (?import=1)
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
      if (status === 'ok' && (balances?.get(s.id) ?? 0) > 0) return false
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
    <div className="lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-5 lg:items-start">
      <div className="min-w-0">
      <Button
        variant="soft"
        full
        className="mb-3"
        onClick={() => setImportOpen(true)}
      >
        <Upload size={20} /> استيراد طلاب من Excel / CSV
      </Button>
      <div className="relative mb-3">
        <Search size={20} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <TextInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو الكود أو الموبايل…"
          className="ps-10"
        />
      </div>

      <ChipRow>
        {STATUS_CHIPS.map((c) => (
          <Chip key={c.key} active={status === c.key} onClick={() => setStatus(c.key)}>
            {c.label}
          </Chip>
        ))}
      </ChipRow>

      {(groupsQ.data?.length ?? 0) > 1 && (
        <ChipRow>
          <Chip
            active={!groupFilter}
            onClick={() => setSearchParams({}, { replace: true })}
          >
            كل المجموعات
          </Chip>
          {(groupsQ.data ?? []).map((g) => (
            <Chip
              key={g.id}
              active={groupFilter === g.id}
              onClick={() => setSearchParams({ group: g.id }, { replace: true })}
            >
              {g.name}
            </Chip>
          ))}
        </ChipRow>
      )}

      {loading ? (
        <LoadingState label="بنحمّل الطلاب…" />
      ) : error ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'خطأ غير معروف'}
          onRetry={() => {
            void studentsQ.refetch()
            void enrollmentsQ.refetch()
            void groupsQ.refetch()
          }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={(studentsQ.data?.length ?? 0) === 0 ? 'لا يوجد طلاب بعد' : 'لا نتائج مطابقة'}
          hint={
            (studentsQ.data?.length ?? 0) === 0
              ? 'ابدأ بإضافة أول طالب من الزر العائم «طالب جديد»'
              : 'جرّب تغيير البحث أو الفلاتر'
          }
          action={
            (studentsQ.data?.length ?? 0) === 0
              ? { label: 'إضافة طالب', onClick: () => setFormOpen(true) }
              : undefined
          }
        />
      ) : (
        <>
        <Card className="p-0 overflow-hidden">
          {filtered.map((s, i) => {
            const balance = balancesQ.data?.get(s.id) ?? 0
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
                        <span className="ms-2 type-badge bg-warn-soft text-warn-text border border-warn/40 rounded-full px-2 py-0.5 align-middle">
                          موقوف
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
                      {names.length ? names.join('، ') : ''}
                    </>
                  }
                  trailing={
                    !isAssistant ? (
                      balance > 0 ? (
                        <span className="shrink-0 type-badge bg-warn-soft text-warn-text border border-warn/40 rounded-full px-2 py-0.5">
                          باقي {formatMoney(balance)}
                        </span>
                      ) : (
                        <span className="shrink-0 type-badge bg-ok-soft text-ok-text border border-ok/30 rounded-full px-2 py-0.5">
                          مسدد
                        </span>
                      )
                    ) : undefined
                  }
                />
              </Link>
            )
          })}
        </Card>
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
          <Card>
            <EmptyState
              icon={Users}
              title="اختر طالباً من القائمة"
              hint="تفاصيل الطالب المحدد هتظهر هنا — أو عدّل البحث والفلاتر."
            />
          </Card>
        )}
      </div>

      <Fab onClick={() => setFormOpen(true)} ariaLabel="إضافة طالب جديد" label="طالب جديد" />

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
    </div>
  )
}
