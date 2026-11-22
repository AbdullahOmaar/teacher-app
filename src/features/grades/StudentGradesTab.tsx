import { invalidatePrefixes } from '../../lib/invalidate'
import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { t } from '../../i18n'
import { Card } from '../../components/ui/Card'
import { NotebookPen } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState } from '../../components/ui/states'
import { formatDateLabel } from '../schedule/api'
import { ASSESSMENT_TYPE_LABELS, TONE_BADGE, fmtScore, pctTone } from './api'
import { GRADES, useStudentScores } from './hooks'

/**
 * تبويب الدرجات في ملف الطالب (المرجع §3.4): درجات الطالب فعلياً من جدول
 * scores مع بيانات تقييماتها — بطاقة المتوسط (متوسط النسب % عبر كل
 * التقييمات المسجلة)، مخطط «تطور المستوى عبر الامتحانات» بأشرطة أفقية
 * بالنسبة عند وجود درجتين فأكثر (بترتيب زمني تصاعدي)، وقائمة الدرجات
 * الأحدث أولاً: العنوان والتاريخ والدرجة من النهائية والنسبة ملوّنة
 * (أخضر ≥ نسبة النجاح، أحمر < 50%، وإلا كهرماني).
 */
export function StudentGradesTab({
  teacherId,
  studentId,
}: {
  teacherId: string
  studentId: string
}) {
  const qc = useQueryClient()
  const scoresQ = useStudentScores(teacherId, studentId)

  const { average, chronological } = useMemo(() => {
    const rows = scoresQ.data ?? []
    const avg =
      rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length) : null
    return {
      average: avg,
      chronological: [...rows].sort((a, b) => a.assess_date.localeCompare(b.assess_date)),
    }
  }, [scoresQ.data])

  if (scoresQ.isPending) return <LoadingState label={t('grades.tabLoading')} />
  if (scoresQ.isError) {
    return (
      <ErrorState
        message={scoresQ.error instanceof Error ? scoresQ.error.message : t('common.unknownError')}
        onRetry={() => void invalidatePrefixes(qc, [GRADES])}
      />
    )
  }

  const rows = scoresQ.data ?? []

  if (rows.length === 0) {
    return (
      <Card className="rise-in">
        <EmptyState
          mascot
          mascotPose="writing"
          icon={NotebookPen}
          title={t('grades.tabEmptyTitle')}
          hint={t('grades.tabEmptyHint')}
        />
      </Card>
    )
  }

  return (
    <div>
      <Card className="rise-in">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-[16px]">{t('grades.tabAverageTitle')}</span>
          <span
            className={`text-[20px] font-extrabold ${
              average == null ? '' : average >= 50 ? 'text-ok-text' : 'text-bad-text'
            }`}
          >
            {average == null ? '—' : `${average}%`}
          </span>
        </div>
        <div className="text-muted text-[13.5px] mt-1">
          {t('grades.tabAverageLine', { count: rows.length })}
        </div>
      </Card>

      {rows.length >= 2 && (
        <Card className="rise-in" style={{ animationDelay: '50ms' }}>
          <div className="font-bold text-[16px] mb-2">{t('grades.tabProgressTitle')}</div>
          {chronological.map((r) => (
            <div key={r.assessment_id} className="flex items-center gap-2 mb-2 last:mb-0">
              <span className="w-[38%] min-w-0 truncate text-[13.5px] font-semibold">
                {r.title}
              </span>
              <div className="flex-1 h-2.5 rounded-full bg-soft overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    pctTone(r.pct, r) === 'ok'
                      ? 'bg-ok'
                      : pctTone(r.pct, r) === 'bad'
                        ? 'bg-bad'
                        : 'bg-warn'
                  }`}
                  style={{ width: `${Math.min(100, r.pct)}%` }}
                />
              </div>
              <span className="w-[44px] text-left text-[13.5px] font-extrabold">{r.pct}%</span>
            </div>
          ))}
        </Card>
      )}

      <h3 className="text-[16px] font-extrabold mb-2 mt-1">{t('grades.tabGradesHeading')}</h3>
      <Card className="rise-in p-0 overflow-hidden" style={{ animationDelay: '90ms' }}>
        {rows.map((r, i) => (
          <Link
            key={r.assessment_id}
            to={`/assessments/${r.assessment_id}`}
            className={`block px-[14px] py-3 no-underline text-text ${i > 0 ? 'border-t border-border' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-[16px]">{r.title}</div>
                <div className="text-muted text-[13.5px]">
                  {ASSESSMENT_TYPE_LABELS[r.type]} · {r.group_name} ·{' '}
                  {formatDateLabel(r.assess_date)}
                  {r.source === 'online_exam' && (
                    <span className="inline-block font-bold bg-soft text-primary border border-primary/30 rounded-full px-2 py-0.5 text-[11px] ms-1 align-middle">
                      {t('grades.tabOnlineBadge')}
                    </span>
                  )}
                </div>
              </div>
              <span className="flex items-center gap-2 shrink-0">
                <span className="font-extrabold text-[15px]">
                  {t('grades.tabScoreOf', { score: fmtScore(r.score), max: fmtScore(r.max_score) })}
                </span>
                <span
                  className={`min-w-[52px] text-center text-[13.5px] font-extrabold rounded-full px-2 py-1 ${TONE_BADGE[pctTone(r.pct, r)]}`}
                >
                  {r.pct}%
                </span>
              </span>
            </div>
          </Link>
        ))}
      </Card>
    </div>
  )
}
