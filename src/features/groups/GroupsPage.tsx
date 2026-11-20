import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Users } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Fab } from '../../components/ui/Fab'
import { Chip, ChipRow } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { BILLING_LABELS, daysLabel, formatMoney, formatTime12 } from '../../lib/format'
import { useEnrollments } from '../students/hooks'
import { countByGroup } from './api'
import { useGroups } from './hooks'
import { GroupFormSheet } from './GroupFormSheet'

/**
 * شاشة المجموعات (المواصفات §3.9): بطاقة لكل مجموعة (نظام الفوترة · السعر ·
 * الأيام · الميعاد والمدة) وشريط سعة عند وجود حد. الضغط يفتح تفاصيل المجموعة.
 */
type GroupFilter = 'active' | 'archived'

export function GroupsPage() {
  const teacher = useCurrentTeacher()
  const [formOpen, setFormOpen] = useState(false)
  const [filter, setFilter] = useState<GroupFilter>('active')

  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const groupsQ = useGroups(teacherId)
  const enrollmentsQ = useEnrollments(teacherId)

  const counts = useMemo(() => countByGroup(enrollmentsQ.data ?? []), [enrollmentsQ.data])

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />
  if (groupsQ.isPending || enrollmentsQ.isPending) return <LoadingState label="بنحمّل المجموعات…" />
  const error = groupsQ.error ?? enrollmentsQ.error
  if (error)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'خطأ غير معروف'}
        onRetry={() => {
          void groupsQ.refetch()
          void enrollmentsQ.refetch()
        }}
      />
    )

  const allGroups = groupsQ.data ?? []
  // القائمة الافتراضية تعرض النشطة فقط؛ المؤرشفة في فلترها الخاص (خطوة 10)
  const groups = allGroups.filter((g) =>
    filter === 'archived' ? g.archived_at != null : g.archived_at == null,
  )
  const hasArchived = allGroups.some((g) => g.archived_at != null)

  return (
    <div>
      {allGroups.length > 0 && (
        <ChipRow>
          <Chip active={filter === 'active'} onClick={() => setFilter('active')}>
            النشطة
          </Chip>
          <Chip active={filter === 'archived'} onClick={() => setFilter('archived')}>
            المؤرشفة
          </Chip>
        </ChipRow>
      )}
      {allGroups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا توجد مجموعات بعد"
          hint="أنشئ أول مجموعة وحدد جدولها ونظام الدفع"
          action={{ label: 'إنشاء مجموعة', onClick: () => setFormOpen(true) }}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filter === 'archived' ? 'لا توجد مجموعات مؤرشفة' : 'لا توجد مجموعات نشطة'}
          hint={
            filter === 'archived'
              ? 'المجموعات التي تؤرشفها من صفحة تفاصيلها ستظهر هنا'
              : hasArchived
                ? 'كل مجموعاتك مؤرشفة حالياً — اعرضها من فلتر «المؤرشفة»'
                : undefined
          }
        />
      ) : (
        groups.map((g) => {
          const cnt = counts.get(g.id) ?? 0
          const pct = g.capacity ? Math.min(100, Math.round((cnt / g.capacity) * 100)) : null
          return (
            <Link key={g.id} to={`/groups/${g.id}`} className="block no-underline text-text">
              <Card className={g.archived_at != null ? 'opacity-70' : ''}>
                {/* التفاف مقصود: اسم مجموعة طويل + شارة مساعد كانا ينضغطان
                    في صف واحد فتلتف الشارة داخل كبسولتها لسطرين */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="shrink-0 w-10 h-10 rounded-full bg-soft text-primary flex items-center justify-center">
                    <Users size={20} />
                  </span>
                  <span className="font-bold text-[16px] min-w-0">{g.name}</span>
                  {g.archived_at != null && (
                    <span className="text-[12px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5 whitespace-nowrap">
                      مؤرشفة
                    </span>
                  )}
                  {g.assistant_name && (
                    <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5 max-w-full truncate">
                      مساعد: {g.assistant_name}
                    </span>
                  )}
                </div>
                <div className="text-muted text-[13.5px] mt-0.5">
                  {BILLING_LABELS[g.billing_type]} · {formatMoney(g.price)} · {daysLabel(g.days)} ·{' '}
                  {formatTime12(g.start_time)} ({g.duration_minutes} د)
                  {g.room ? ` · ${g.room}` : ''}
                </div>
                {g.capacity != null && pct != null ? (
                  <div className="mt-2">
                    <div className="flex justify-between text-[13.5px] text-muted mb-1">
                      <span>
                        {cnt}/{g.capacity} طالب
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-soft overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 100 ? 'bg-bad' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-muted text-[13.5px] mt-1">{cnt} طالب مسجل</div>
                )}
              </Card>
            </Link>
          )
        })
      )}

      <Fab onClick={() => setFormOpen(true)} ariaLabel="إنشاء مجموعة جديدة" label="مجموعة جديدة" />

      {formOpen && (
        <GroupFormSheet
          onClose={() => setFormOpen(false)}
          teacherId={teacher.teacherId}
          groups={groups}
          initial={null}
        />
      )}
    </div>
  )
}
