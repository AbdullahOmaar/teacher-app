import { Card } from '../../../components/ui/Card'
import {
  absenceWaUrl,
  type AttendanceValue,
  type GuardianContact,
  type RosterStudent,
} from '../api'
import type { QueuedAttendanceItem } from '../offlineQueue'
import { StudentRow } from './StudentRow'

/** بطاقة قائمة الطلاب: صف توقيعي لكل طالب (انظر StudentRow) */
export function RosterCard({
  students,
  valueOf,
  queueMap,
  leftMap,
  contacts,
  sessionDate,
  flashId,
  cancelled,
  online,
  markLeftPending,
  clearLeftPending,
  onChangeValue,
  onToggleLeft,
}: {
  students: RosterStudent[]
  valueOf: (studentId: string) => AttendanceValue
  queueMap: Map<string, QueuedAttendanceItem>
  leftMap: Map<string, string>
  contacts: Map<string, GuardianContact> | undefined
  sessionDate: string
  flashId: string | null
  cancelled: boolean
  online: boolean
  markLeftPending: boolean
  clearLeftPending: boolean
  onChangeValue: (studentId: string, patch: Partial<AttendanceValue>) => void
  onToggleLeft: (studentId: string) => void
}) {
  return (
    <Card className="rise-in p-0 overflow-hidden" style={{ animationDelay: '90ms' }}>
      {students.map((st, i) => {
        const v = valueOf(st.id)
        const wa = v.status === 'a'
          ? absenceWaUrl(st, contacts?.get(st.id), sessionDate)
          : null
        return (
          <StudentRow
            key={st.id}
            student={st}
            first={i === 0}
            value={v}
            queueItem={queueMap.get(st.id)}
            leftAt={leftMap.get(st.id)}
            flash={flashId === st.id}
            cancelled={cancelled}
            online={online}
            absenceWa={wa}
            markLeftPending={markLeftPending}
            clearLeftPending={clearLeftPending}
            onChangeValue={onChangeValue}
            onToggleLeft={onToggleLeft}
          />
        )
      })}
    </Card>
  )
}
