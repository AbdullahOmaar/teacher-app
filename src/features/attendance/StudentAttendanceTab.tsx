import { useMemo } from 'react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState } from '../../components/ui/states'
import { shortTime } from '../../lib/format'
import type { EnrollmentRow, GroupRow } from '../../types/database'
import { formatDateLabel } from '../schedule/api'
import { STATUS_COLORS, STATUS_LABELS, isAttended } from './api'
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
    return <ErrorState message={error instanceof Error ? error.message : 'خطأ غير معروف'} />

  const stats = statsQ.data ?? { marked: 0, attended: 0, rate: null }
  const records = recordsQ.data ?? []

  return (
    <div>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-[14.5px]">نسبة الالتزام</span>
          <span
            className={`text-[20px] font-extrabold ${
              stats.rate == null ? '' : stats.rate >= 80 ? 'text-ok' : 'text-warn'
            }`}
          >
            {stats.rate == null ? '—' : `${stats.rate}%`}
          </span>
        </div>
        <div className="text-muted text-[13px] mt-1">
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
            <span className="font-bold text-[14.5px]">باقة {c.groupName}</span>
            <span
              className={`text-[13px] font-extrabold ${c.left <= 1 ? 'text-bad' : 'text-ok'}`}
            >
              متبقي {c.left}
            </span>
          </div>
          <div className="text-muted text-[13px] mt-1">
            حضر {c.used} من {c.total} حصة مدفوعة مسبقاً
          </div>
        </Card>
      ))}

      <h3 className="text-[14.5px] font-extrabold mb-2 mt-1">سجل الحصص</h3>
      {records.length === 0 ? (
        <Card>
          <EmptyState
            icon="✅"
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
                  <div className="font-bold text-[14px]">{r.group_name}</div>
                  <div className="text-muted text-[12.5px]">
                    {formatDateLabel(r.session_date)} · {shortTime(r.start_time)}
                  </div>
                </div>
                <span className="flex items-center gap-1.5 shrink-0">
                  {r.starred && <span title="متميز">⭐</span>}
                  {r.status ? (
                    <span
                      className="text-[11.5px] font-bold text-white rounded-full px-2.5 py-0.5"
                      style={{ backgroundColor: STATUS_COLORS[r.status] }}
                    >
                      {STATUS_LABELS[r.status]}
                    </span>
                  ) : (
                    <span className="text-[11.5px] font-bold bg-muted/15 text-muted border border-border rounded-full px-2.5 py-0.5">
                      بلا حالة
                    </span>
                  )}
                </span>
              </div>
              <div className="text-muted text-[12.5px] mt-1">
                الواجب: {r.homework_done ? '✓ سلّم الواجب' : 'لم يسلّم'}
                {r.starred ? ' · ⭐ متميز في الحصة' : ''}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
