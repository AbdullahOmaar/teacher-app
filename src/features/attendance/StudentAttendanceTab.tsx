import { useMemo } from 'react'
import { Card } from '../../components/ui/Card'
import { CalendarCheck2, Check, Star } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState } from '../../components/ui/states'
import { shortTime } from '../../lib/format'
import type { EnrollmentRow, GroupRow } from '../../types/database'
import { formatDateLabel } from '../schedule/api'
import { STATUS_BADGE_CLASS, STATUS_LABELS, isAttended } from './api'
import { useStudentAttendance, useStudentAttendanceStats } from './hooks'

/**
 * تبويب الحضور في ملف الطالب (المرجع §3.4): نسبة الالتزام من view
 * ‏student_attendance_stats، بطاقة باقة لكل تسجيل مدفوع مسبقاً
 * (المستهلك = حصص p/l/m في المجموعة)، وسجل الحصص من جدول attendance
 * فعلياً مع الحالة والواجب والتمييز.
 */
export function StudentAttendanceTab({
  teacherId,
  studentId,
  enrollments,
  groupById,
}: {
  teacherId: string
  studentId: string
  enrollments: EnrollmentRow[]
  groupById: Map<string, GroupRow>
}) {
  const recordsQ = useStudentAttendance(teacherId, studentId)
  const statsQ = useStudentAttendanceStats(teacherId, studentId)

  const prepaidCards = useMemo(() => {
    const records = recordsQ.data ?? []
    return enrollments
      .filter((e) => {
        const g = groupById.get(e.group_id)
        return g?.billing_type === 'per_session_prepaid' && e.prepaid_sessions != null
      })
      .map((e) => {
        const used = records.filter(
          (r) => r.group_id === e.group_id && isAttended(r.status),
        ).length
        const totalP = e.prepaid_sessions ?? 0
        return {
          enrollment: e,
          groupName: groupById.get(e.group_id)?.name ?? '—',
          used,
          total: totalP,
          left: Math.max(0, totalP - used),
        }
      })
  }, [enrollments, groupById, recordsQ.data])

  if (recordsQ.isPending || statsQ.isPending)
    return <LoadingState label="بنحمّل سجل الحضور…" />
  const error = recordsQ.error ?? statsQ.error
  if (error)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'خطأ غير معروف'}
        onRetry={() => {
          void recordsQ.refetch()
          void statsQ.refetch()
        }}
      />
    )

  const stats = statsQ.data ?? { marked: 0, attended: 0, rate: null }
  const records = recordsQ.data ?? []

  return (
    <div>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-[16px]">نسبة الالتزام</span>
          <span
            className={`text-[20px] font-extrabold ${
              stats.rate == null ? '' : stats.rate >= 80 ? 'text-ok-text' : 'text-warn-text'
            }`}
          >
            {stats.rate == null ? '—' : `${stats.rate}%`}
          </span>
        </div>
        <div className="text-muted text-[13.5px] mt-1">
          {stats.marked > 0
            ? `حضر ${stats.attended} من ${stats.marked} حصة مسجلة`
            : 'لسه مفيش حصص مسجلة للطالب ده'}
        </div>
        {stats.marked > 0 && (
          <div className="h-2 rounded-full bg-soft overflow-hidden mt-2">
            <div
              className={`h-full rounded-full ${(stats.rate ?? 0) >= 80 ? 'bg-ok' : 'bg-warn'}`}
              style={{ width: `${stats.rate ?? 0}%` }}
            />
          </div>
        )}
      </Card>

      {prepaidCards.map((c) => (
        <Card key={c.enrollment.id}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-[16px]">باقة {c.groupName}</span>
            <span
              className={`text-[13.5px] font-extrabold ${c.left <= 1 ? 'text-bad-text' : 'text-ok-text'}`}
            >
              متبقي {c.left}
            </span>
          </div>
          <div className="text-muted text-[13.5px] mt-1">
            حضر {c.used} من {c.total} حصة مدفوعة مسبقاً
          </div>
        </Card>
      ))}

      <h3 className="text-[16px] font-extrabold mb-2 mt-1">سجل الحصص</h3>
      {records.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarCheck2}
            title="لا يوجد سجل حضور بعد"
            hint="هيظهر هنا كل حصة اتسجلت للطالب بحالتها وواجبها وتمييزها."
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          {records.map((r, i) => (
            <div
              key={r.session_id}
              className={`px-[14px] py-3 ${i > 0 ? 'border-t border-border' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-[15px]">{r.group_name}</div>
                  <div className="text-muted text-[13.5px]">
                    {formatDateLabel(r.session_date)} · {shortTime(r.start_time)}
                  </div>
                </div>
                <span className="flex items-center gap-1.5 shrink-0">
                  {r.starred && (
                    <span title="متميز" className="inline-flex">
                      <Star size={20} className="text-accent" fill="currentColor" />
                    </span>
                  )}
                  {r.status ? (
                    <span
                      className={`type-badge rounded-full px-2.5 py-0.5 ${STATUS_BADGE_CLASS[r.status]}`}
                    >
                      {STATUS_LABELS[r.status]}
                    </span>
                  ) : (
                    <span className="text-[12px] font-bold bg-muted/15 text-muted border border-border rounded-full px-2.5 py-0.5">
                      بلا حالة
                    </span>
                  )}
                </span>
              </div>
              <div className="text-muted text-[13.5px] mt-1 flex items-center gap-1 flex-wrap">
                <span>الواجب:</span>
                {r.homework_done ? (
                  <span className="inline-flex items-center gap-1 text-ok-text font-semibold">
                    <Check size={16} />
                    سلّم الواجب
                  </span>
                ) : (
                  <span>لم يسلّم</span>
                )}
                {r.starred && <span>· متميز في الحصة</span>}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
