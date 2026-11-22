import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { t } from '../../i18n'
import { Card } from '../../components/ui/Card'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import { NotebookPen } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Fab } from '../../components/ui/Fab'
import { Chip, ChipRow } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatDateLabel } from '../schedule/api'
import { useGroups } from '../groups/hooks'
import { SG } from '../students/hooks'
import { ASSESSMENT_TYPE_LABELS, type AssessmentListItem } from './api'
import { GRADES, useAssessments } from './hooks'
import { AssessmentFormSheet } from './sheets'

function AssessmentCard({ item, index }: { item: AssessmentListItem; index: number }) {
  return (
    <Link to={`/assessments/${item.id}`} className="block no-underline text-text">
      <Card className="rise-in" style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
        <div className="flex items-start justify-between gap-2">
          <div className="font-bold text-[15px]">{item.title}</div>
          {item.avg_pct != null && (
            <span className="shrink-0 text-[12px] font-bold bg-soft text-primary border border-primary/25 rounded-full px-2 py-0.5">
              {t('grades.cardAvg', { pct: item.avg_pct })}
            </span>
          )}
        </div>
        <div className="text-muted text-[13.5px] mt-0.5">
          {t('grades.cardMeta', {
            type: ASSESSMENT_TYPE_LABELS[item.type],
            group: item.group_name,
            date: formatDateLabel(item.assess_date),
            max: item.max_score,
          })}
          {item.questions_count > 0
            ? t('grades.cardQuestionsSuffix', { count: item.questions_count })
            : ''}
        </div>
        <div className="text-muted text-[13.5px] mt-1">
          {item.scored_count > 0
            ? t('grades.cardScored', { count: item.scored_count })
            : t('grades.cardNoScores')}
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
  const qc = useQueryClient()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined

  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [createOpen, setCreateOpen] = useState(false)

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
    <PullToRefresh
      onRefresh={async () => {
        await qc.invalidateQueries({ queryKey: [GRADES] })
        await qc.invalidateQueries({ queryKey: [SG] })
      }}
    >
    <div>
      {groups.length > 1 && (
        <ChipRow>
          <Chip active={groupFilter === 'all'} onClick={() => setGroupFilter('all')}>
            {t('grades.allGroups')}
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
        <LoadingState label={t('grades.loading')} />
      ) : error ? (
        <ErrorState
          message={error instanceof Error ? error.message : t('common.unknownError')}
          onRetry={() => {
            void assessmentsQ.refetch()
            void groupsQ.refetch()
          }}
        />
      ) : filtered.length === 0 ? (
        <Card className="rise-in">
          <EmptyState
            mascot
            mascotPose="writing"
            icon={NotebookPen}
            title={assessments.length === 0 ? t('grades.emptyNoneTitle') : t('grades.emptyFilteredTitle')}
            hint={
              assessments.length === 0
                ? t('grades.emptyNoneHint')
                : t('grades.emptyFilteredHint')
            }
            action={
              assessments.length === 0
                ? { label: t('grades.createAction'), onClick: () => setCreateOpen(true) }
                : undefined
            }
          />
        </Card>
      ) : (
        filtered.map((a, i) => <AssessmentCard key={a.id} item={a} index={i} />)
      )}

      <Fab onClick={() => setCreateOpen(true)} ariaLabel={t('grades.fabAria')} label={t('grades.fabLabel')} />

      {createOpen && teacherId && (
        <AssessmentFormSheet
          teacherId={teacherId}
          groups={groups}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
    </PullToRefresh>
  )
}
