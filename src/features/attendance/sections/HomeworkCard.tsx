import { Link } from 'react-router-dom'
import { BookOpenCheck, Check } from 'lucide-react'
import { Card } from '../../../components/ui/Card'
import { Chip } from '../../../components/ui/form'
import type { AttendanceValue, RosterStudent } from '../api'
import { t } from '../../../i18n'

/** تسليم الواجب — رقائق بأسماء الطلاب (المرجع §3.2) */
export function HomeworkCard({
  students,
  groupId,
  sessionId,
  valueOf,
  cancelled,
  onChangeValue,
}: {
  students: RosterStudent[]
  groupId: string
  sessionId: string
  valueOf: (studentId: string) => AttendanceValue
  cancelled: boolean
  onChangeValue: (studentId: string, patch: Partial<AttendanceValue>) => void
}) {
  return (
    <Card className="rise-in" style={{ animationDelay: '140ms' }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="font-bold text-[15px]">{t('attendance.homeworkSectionTitle')}</div>
        <Link
          to={`/homework?group=${groupId}&session=${sessionId}`}
          className="inline-flex items-center gap-1.5 text-primary text-[13.5px] font-bold no-underline min-h-[48px]"
        >
          <BookOpenCheck size={18} />
          {t('attendance.homeworkOrganized')}
        </Link>
      </div>
      <div className="flex gap-2 flex-wrap">
        {students.map((st) => {
          const v = valueOf(st.id)
          return (
            <Chip
              key={st.id}
              active={v.homework_done}
              onClick={() => {
                if (!cancelled) onChangeValue(st.id, { homework_done: !v.homework_done })
              }}
            >
              {v.homework_done && <Check size={16} />}{st.name}
            </Chip>
          )
        })}
      </div>
      <p className="text-muted text-[13.5px] mt-2 mb-0">
        {t('attendance.homeworkHint')}
      </p>
    </Card>
  )
}
