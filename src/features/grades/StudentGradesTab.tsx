import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState } from '../../components/ui/states'
import { formatDateLabel } from '../schedule/api'
import { ASSESSMENT_TYPE_LABELS, TONE_BADGE, fmtScore, pctTone } from './api'
import { useStudentScores } from './hooks'

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

  if (scoresQ.isPending) return <LoadingState label="بنحمّل درجات الطالب…" />
  if (scoresQ.isError) {
    return (
      <ErrorState
        message={scoresQ.error instanceof Error ? scoresQ.error.message : 'خطأ غير معروف'}
      />
    )
  }

  const rows = scoresQ.data ?? []

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="📝"
          title="لا يوجد درجات مسجلة بعد"
          hint="درجات الطالب في الامتحانات والواجبات هتظهر هنا بنسبتها ومتوسطه أول ما تتسجل من شاشة الدرجات."
        />
      </Card>
    )
  }

  return (
    <div>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-[14.5px]">متوسط الدرجات</span>
          <span
            className={`text-[20px] font-extrabold ${
              average == null ? '' : average >= 50 ? 'text-ok-text' : 'text-bad-text'
            }`}
          >
            {average == null ? '—' : `${average}%`}
          </span>
        </div>
        <div className="text-muted text-[13px] mt-1">
          متوسط النسب عبر {rows.length} تقييم مسجل له درجة
        </div>
      </Card>

      {rows.length >= 2 && (
        <Card>
          <div className="font-bold text-[14.5px] mb-2">تطور المستوى عبر الامتحانات</div>
          {chronological.map((r) => (
            <div key={r.assessment_id} className="flex items-center gap-2 mb-2 last:mb-0">
              <span className="w-[38%] min-w-0 truncate text-[12.5px] font-semibold">
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
              <span className="w-[44px] text-left text-[12.5px] font-extrabold">{r.pct}%</span>
            </div>
          ))}
        </Card>
      )}

      <h3 className="text-[14.5px] font-extrabold mb-2 mt-1">الدرجات</h3>
      <Card className="p-0 overflow-hidden">
        {rows.map((r, i) => (
          <Link
            key={r.assessment_id}
            to={`/assessments/${r.assessment_id}`}
            className={`block px-[14px] py-3 no-underline text-text ${i > 0 ? 'border-t border-border' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-[14.5px]">{r.title}</div>
                <div className="text-muted text-[12.5px]">
                  {ASSESSMENT_TYPE_LABELS[r.type]} · {r.group_name} ·{' '}
                  {formatDateLabel(r.assess_date)}
                </div>
              </div>
              <span className="flex items-center gap-2 shrink-0">
                <span className="font-extrabold text-[14px]">
                  {fmtScore(r.score)} من {fmtScore(r.max_score)}
                </span>
                <span
                  className={`min-w-[52px] text-center text-[12.5px] font-extrabold rounded-full px-2 py-1 ${TONE_BADGE[pctTone(r.pct, r)]}`}
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
