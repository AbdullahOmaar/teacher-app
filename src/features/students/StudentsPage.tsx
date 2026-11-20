import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Search, Users } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Fab } from '../../components/ui/Fab'
import { Chip, ChipRow, TextInput } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatMoney } from '../../lib/format'
import { useGroups } from '../groups/hooks'
import { useEnrollments, useStudentBalances, useStudents } from './hooks'
import { StudentFormSheet } from './StudentFormSheet'

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

  return (
    <div>
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
        filtered.map((s) => {
          const balance = balancesQ.data?.get(s.id) ?? 0
          const names = groupNamesByStudent.get(s.id) ?? []
          return (
            <Link key={s.id} to={`/students/${s.id}`} className="block no-underline text-text">
              <Card className={s.paused ? 'opacity-60' : ''}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-[16px]">
                    {s.name}
                    {s.paused && (
                      <span className="ms-2 text-[12px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5 align-middle">
                        موقوف
                      </span>
                    )}
                  </div>
                  {!isAssistant &&
                    (balance > 0 ? (
                      <span className="shrink-0 text-[12px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5">
                        باقي {formatMoney(balance)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[12px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-2 py-0.5">
                        مسدد
                      </span>
                    ))}
                </div>
                <div className="text-muted text-[13.5px] mt-0.5">
                  <span dir="ltr">{s.public_code}</span>
                  {s.grade ? ` · ${s.grade}` : ''}
                  {names.length ? ` · ${names.join('، ')}` : ''}
                </div>
              </Card>
            </Link>
          )
        })
      )}

      <Fab onClick={() => setFormOpen(true)} ariaLabel="إضافة طالب جديد" label="طالب جديد" />

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
