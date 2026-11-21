import { useMemo, useState } from 'react'
import { t } from '../../i18n'
import { Link } from 'react-router-dom'
import { Sheet } from '../../components/ui/Sheet'
import { AlertTriangle, CalendarCheck2, MoveHorizontal, NotebookPen, Undo2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Field, FormError, Select, TextInput } from '../../components/ui/form'
import { formatTime12, shortTime } from '../../lib/format'
import type { GroupRow, SessionRow } from '../../types/database'
import { datesBetween, formatDateLabel, todayStr, type SessionWithGroup } from './api'
import {
  useCreateExtraSession,
  useAddHolidays,
  useMoveSession,
  useSetSessionStatus,
} from './hooks'

export function KindBadge({ session }: { session: { kind: string; status: string } }) {
  return (
    <>
      {session.kind === 'extra' && (
        <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
          {t('schedule.kindExtra')}
        </span>
      )}
      {session.kind === 'moved' && (
        <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
          {t('schedule.kindMoved')}
        </span>
      )}
      {session.status === 'cancelled' && (
        <span className="text-[12px] font-bold bg-muted/15 text-muted border border-border rounded-full px-2 py-0.5">
          {t('schedule.badgeCancelled')}
        </span>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// تفاصيل حصة + إجراءاتها: فتح الحضور، نقل، إلغاء/استرجاع (المرجع §3.2/§3.8)
// ---------------------------------------------------------------------------

interface SessionDetailSheetProps {
  session: SessionWithGroup
  /** تسمية الحصة الأصلية إن كانت هذه منقولة وأصلها داخل المدى المحمّل */
  originLabel: string | null
  isHoliday: boolean
  teacherId: string
  onClose: () => void
  onDone: (msg: string) => void
}

export function SessionDetailSheet({
  session,
  originLabel,
  isHoliday,
  teacherId,
  onClose,
  onDone,
}: SessionDetailSheetProps) {
  const [showMove, setShowMove] = useState(false)
  const [moveDate, setMoveDate] = useState(session.session_date)
  const [moveTime, setMoveTime] = useState(shortTime(session.start_time))
  const [error, setError] = useState<string | null>(null)

  const moveMut = useMoveSession(teacherId)
  const statusMut = useSetSessionStatus(teacherId)
  const busy = moveMut.isPending || statusMut.isPending
  const cancelled = session.status === 'cancelled'

  const doMove = async () => {
    setError(null)
    if (!moveDate) return setError(t('schedule.moveDateRequired'))
    if (!moveTime) return setError(t('schedule.moveTimeRequired'))
    if (session.kind === 'regular' && moveDate === session.session_date) {
      // المرجع §4 مودال move: النقل لنفس التاريخ مرفوض للحصة المنتظمة
      return setError(t('schedule.moveSameDateError'))
    }
    if (moveDate === session.session_date && moveTime === shortTime(session.start_time)) {
      return setError(t('schedule.moveSameSlotError'))
    }
    try {
      await moveMut.mutateAsync({ session: session as SessionRow, date: moveDate, time: moveTime })
      onDone(t('schedule.movedToast'))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('schedule.moveError'))
    }
  }

  const toggleStatus = async () => {
    setError(null)
    try {
      await statusMut.mutateAsync({
        sessionId: session.id,
        status: cancelled ? 'scheduled' : 'cancelled',
      })
      onDone(cancelled ? t('schedule.sessionRestoredToast') : t('schedule.sessionCancelledToast'))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('schedule.saveError'))
    }
  }

  return (
    <Sheet open title={t('schedule.detailTitle')} onClose={onClose}>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="font-extrabold text-[16px]">{session.group_name}</span>
        <KindBadge session={session} />
        {isHoliday && (
          <span className="text-[12px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5">
            {t('schedule.detailHolidayBadge')}
          </span>
        )}
      </div>
      <div className="text-muted text-[13.5px] mb-1">{formatDateLabel(session.session_date)}</div>
      <div className="text-[13.5px] mb-1">
        {t('schedule.detailTimeLine', { time: formatTime12(session.start_time), duration: session.duration_minutes })}
        {session.group_room ? ` · ${session.group_room}` : ''}
      </div>
      {session.kind === 'moved' && (
        <div className="text-muted text-[13.5px] mb-1">
          {originLabel ? t('schedule.detailMovedFrom', { origin: originLabel }) : t('schedule.detailMovedFallback')}
        </div>
      )}
      {session.note && (
        <div className="text-[13.5px] mb-1 flex items-center gap-1.5">
          <NotebookPen size={16} className="text-muted shrink-0" />
          {session.note}
        </div>
      )}

      <div className="flex flex-col gap-2 mt-4">
        {!cancelled && (
          <Link to={`/attendance?session=${session.id}`} className="no-underline">
            <Button full variant="soft">
              <CalendarCheck2 size={20} />
              {t('schedule.openAttendance')}
            </Button>
          </Link>
        )}
        {!cancelled && !showMove && (
          <Button full onClick={() => setShowMove(true)}>
            <MoveHorizontal size={20} />
            {t('schedule.moveBtn')}
          </Button>
        )}
        {showMove && (
          <div className="border border-border rounded-xl p-3">
            <div className="font-bold text-[15px] mb-2">{t('schedule.moveTitle')}</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('schedule.moveDateLabel')}>
                <TextInput
                  type="date"
                  dir="ltr"
                  value={moveDate}
                  onChange={(e) => setMoveDate(e.target.value)}
                />
              </Field>
              <Field label={t('schedule.moveTimeLabel')}>
                <TextInput
                  type="time"
                  dir="ltr"
                  value={moveTime}
                  onChange={(e) => setMoveTime(e.target.value)}
                />
              </Field>
            </div>
            <p className="text-muted text-[12px] mb-3">
              {session.kind === 'regular'
                ? t('schedule.moveNoteRegular')
                : t('schedule.moveNoteOther')}
            </p>
            <div className="flex gap-2">
              <Button full onClick={doMove} disabled={busy}>
                {moveMut.isPending ? t('schedule.moving') : t('schedule.moveConfirm')}
              </Button>
              <Button variant="ghost" onClick={() => setShowMove(false)}>
                {t('schedule.cancel')}
              </Button>
            </div>
          </div>
        )}
        <Button
          full
          variant={cancelled ? 'primary' : 'danger'}
          onClick={toggleStatus}
          disabled={busy}
        >
          {statusMut.isPending ? t('schedule.saving') : cancelled ? (<><Undo2 size={20} /> {t('schedule.restoreSessionBtn')}</>) : t('schedule.cancelSessionBtn')}
        </Button>
      </div>

      {error && <FormError message={error} />}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// حصة إضافية / مراجعة لمرة واحدة (المرجع §4 مودال extraSess)
// ---------------------------------------------------------------------------

interface ExtraSessionSheetProps {
  groups: GroupRow[]
  holidayDates: Set<string>
  teacherId: string
  onClose: () => void
  onDone: (msg: string) => void
}

export function ExtraSessionSheet({
  groups,
  holidayDates,
  teacherId,
  onClose,
  onDone,
}: ExtraSessionSheetProps) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '')
  const [date, setDate] = useState(() => todayStr())
  const [time, setTime] = useState('15:00')
  const [duration, setDuration] = useState('60')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const createMut = useCreateExtraSession(teacherId)

  const selectedGroup = useMemo(() => groups.find((g) => g.id === groupId), [groups, groupId])
  const onHoliday = holidayDates.has(date)

  const pickGroup = (id: string) => {
    setGroupId(id)
    const g = groups.find((x) => x.id === id)
    if (g) {
      setTime(shortTime(g.start_time))
      setDuration(String(g.duration_minutes))
    }
  }

  const save = async () => {
    setError(null)
    if (!groupId) return setError(t('schedule.extraGroupRequired'))
    if (!date) return setError(t('schedule.extraDateRequired'))
    if (!time) return setError(t('schedule.extraTimeRequired'))
    const dur = Number(duration)
    if (!Number.isInteger(dur) || dur <= 0) return setError(t('schedule.extraDurationInvalid'))
    try {
      await createMut.mutateAsync({
        group_id: groupId,
        session_date: date,
        start_time: time,
        duration_minutes: dur,
        note: note.trim() === '' ? null : note.trim(),
      })
      onDone(onHoliday ? t('schedule.extraAddedHoliday') : t('schedule.extraAdded'))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('schedule.saveError'))
    }
  }

  return (
    <Sheet
      open
      title={t('schedule.extraTitle')}
      onClose={onClose}
      footer={
        groups.length > 0 ? (
          <div className="flex gap-2">
            <Button full onClick={save} disabled={createMut.isPending}>
              {createMut.isPending ? t('schedule.saving') : t('schedule.extraAddBtn')}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {t('schedule.cancel')}
            </Button>
          </div>
        ) : undefined
      }
    >
      {groups.length === 0 ? (
        <p className="text-muted text-[13.5px]">
          {t('schedule.extraNoGroups')}
        </p>
      ) : (
        <>
          <Field label={t('schedule.extraGroupLabel')}>
            <Select value={groupId} onChange={(e) => pickGroup(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('schedule.extraDateLabel')}>
              <TextInput type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t('schedule.extraTimeLabel')}>
              <TextInput type="time" dir="ltr" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('schedule.extraDurationLabel')}>
              <TextInput
                type="number"
                min={15}
                step={15}
                inputMode="numeric"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </Field>
            <Field label={t('schedule.extraNoteLabel')}>
              <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('schedule.extraNotePlaceholder')} />
            </Field>
          </div>
          {selectedGroup && (
            <p className="text-muted text-[13.5px] mb-3">
              {t('schedule.extraOnceNote', { name: selectedGroup.name })}
            </p>
          )}
          {onHoliday && (
            <div className="border border-warn/50 bg-warn/10 rounded-xl px-3 py-2 mb-3 text-[13.5px] flex items-start gap-2">
              <AlertTriangle size={20} className="shrink-0 mt-0.5 text-warn-text" />
              <span>{t('schedule.extraHolidayWarn')}</span>
            </div>
          )}
          {error && <FormError message={error} />}
        </>
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// إضافة إجازة — يوم واحد أو نطاق (المخطط: صف لكل يوم في holidays)
// ---------------------------------------------------------------------------

interface HolidaySheetProps {
  teacherId: string
  onClose: () => void
  onDone: (msg: string) => void
}

const MAX_HOLIDAY_DAYS = 62

export function HolidaySheet({ teacherId, onClose, onDone }: HolidaySheetProps) {
  const today = todayStr()
  const [name, setName] = useState('')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const addMut = useAddHolidays(teacherId)

  const dates = useMemo(() => {
    if (!from || !to || to < from) return []
    return datesBetween(from, to)
  }, [from, to])

  const save = async () => {
    setError(null)
    if (!from || !to) return setError(t('schedule.holidayRangeRequired'))
    if (to < from) return setError(t('schedule.holidayEndBeforeStart'))
    if (dates.length > MAX_HOLIDAY_DAYS)
      return setError(t('schedule.holidayTooLong', { max: MAX_HOLIDAY_DAYS }))
    try {
      await addMut.mutateAsync({ dates, name: name.trim() === '' ? null : name.trim() })
      onDone(t('schedule.holidaySaved', { count: dates.length }))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('schedule.saveError'))
    }
  }

  return (
    <Sheet
      open
      title={t('schedule.holidayDefaultName')}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button full onClick={save} disabled={addMut.isPending}>
            {addMut.isPending ? t('schedule.saving') : t('schedule.holidaySaveBtn')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('schedule.cancel')}
          </Button>
        </div>
      }
    >
      <Field label={t('schedule.holidayNameLabel')}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('schedule.holidayNamePlaceholder')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('schedule.holidayFromLabel')}>
          <TextInput type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t('schedule.holidayToLabel')}>
          <TextInput type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <p className="text-muted text-[13.5px] mb-3">
        {dates.length > 0
          ? t('schedule.holidayDaysNote', { count: dates.length })
          : t('schedule.holidayInvalidRange')}
      </p>
      {error && <FormError message={error} />}
    </Sheet>
  )
}
