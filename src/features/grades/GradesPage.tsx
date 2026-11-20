import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Chip, ChipRow } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatDateLabel } from '../schedule/api'
import { useGroups } from '../groups/hooks'
import { ASSESSMENT_TYPE_LABELS, type AssessmentListItem } from './api'
import { useAssessments } from './hooks'
import { AssessmentFormSheet } from './sheets'

function AssessmentCard({ item }: { item: AssessmentListItem }) {
  return (
    <Link to={`/assessments/${item.id}`} className="block no-underline text-text">
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div className="font-bold text-[15px]">{item.title}</div>
          {item.avg_pct != null && (
            <span className="shrink-0 text-[12px] font-bold bg-soft text-primary border border-primary/25 rounded-full px-2 py-0.5">
              متوسط {item.avg_pct}%
            </span>
          )}
        </div>
        <div className="text-muted text-[13px] mt-0.5">
          {ASSESSMENT_TYPE_LABELS[item.type]} · {item.group_name} ·{' '}
          {formatDateLabel(item.assess_date)} · النهائية {item.max_score}
          {item.questions_count > 0 ? ` · ${item.questions_count} سؤال` : ''}
        </div>
        <div className="text-muted text-[12.5px] mt-1">
          {item.scored_count > 0
            ? `درجات مسجلة: ${item.scored_count} طالب`
            : 'لسه مفيش درجات مسجلة — اضغط لإدخال الدرجات'}
        </div>
      </Card>
    </Link>
  )
}

/**
 * الامتحانات والدرجات (المواصفات §3.10): زر «+ امتحان أو واجب»، رقائق
 * فلترة بالمجموعة (عند وجود أكثر من مجموعة)، وبطاقة لكل تقييم من جدول
 * assessments فعلياً: العنوان، النوع والمجموعة والتاريخ وعدد الأسئلة،
 * متوسط النسب % وعدد الدرجات المسجلة من scores. الأحدث أولاً، والضغط
 * يفتح تفاصيل التقييم (إدخال الدرجات وبنك الأسئلة وورقة الامتحان).
 */
export function GradesPage() {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined

  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const assessmentsQ = useAssessments(teacherId)
  const groupsQ = useGroups(teacherId)
  const assessments = useMemo(() => assessmentsQ.data ?? [], [assessmentsQ.data])
  const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data])

  const filtered = useMemo(
    () =>
      groupFilter === 'all'
        ? assessments
        : assessments.filter((a) => a.group_id === groupFilter),
    [assessments, groupFilter],
  )

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  const pending = assessmentsQ.isPending || groupsQ.isPending
  const error = assessmentsQ.error ?? groupsQ.error

  return (
    <div>
      <Button full onClick={() => setCreateOpen(true)} className="mb-3">
        + امتحان أو واجب
      </Button>

      {groups.length > 1 && (
        <ChipRow>
          <Chip active={groupFilter === 'all'} onClick={() => setGroupFilter('all')}>
            كل المجموعات
          </Chip>
          {groups.map((g) => (
            <Chip
              key={g.id}
              active={groupFilter === g.id}
              onClick={() => setGroupFilter(g.id)}
            >
              {g.name}
            </Chip>
          ))}
        </ChipRow>
      )}

      {pending ? (
        <LoadingState label="بنحمّل التقييمات…" />
      ) : error ? (
        <ErrorState message={error instanceof Error ? error.message : 'خطأ غير معروف'} />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="📝"
            title={assessments.length === 0 ? 'لسه مفيش امتحانات أو واجبات' : 'مفيش تقييمات للمجموعة دي'}
            hint={
              assessments.length === 0
                ? 'أنشئ أول امتحان أو واجب من الزر اللي فوق، وبعدين سجّل درجات الطلاب وأضف أسئلته من بنك الأسئلة.'
                : 'جرّب مجموعة تانية أو أنشئ تقييماً جديداً لها.'
            }
          />
        </Card>
      ) : (
        filtered.map((a) => <AssessmentCard key={a.id} item={a} />)
      )}

      {createOpen && teacherId && (
        <AssessmentFormSheet
          teacherId={teacherId}
          groups={groups}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {toast && (
        <div className="fixed bottom-[92px] inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
          <div className="bg-text text-bg text-[13.5px] font-semibold rounded-full px-4 py-2.5 shadow-lg max-w-[640px] text-center">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}
