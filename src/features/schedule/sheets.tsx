import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import { Field, Select, TextInput } from '../../components/ui/form'
import { shortTime } from '../../lib/format'
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
        <span className="text-[11px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
          إضافية
        </span>
      )}
      {session.kind === 'moved' && (
        <span className="text-[11px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
          منقولة
        </span>
      )}
      {session.status === 'cancelled' && (
        <span className="text-[11px] font-bold bg-muted/15 text-muted border border-border rounded-full px-2 py-0.5">
          ملغاة
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
    if (!moveDate) return setError('اختار التاريخ الجديد')
    if (!moveTime) return setError('اختار الميعاد الجديد')
    if (session.kind === 'regular' && moveDate === session.session_date) {
      // المرجع §4 مودال move: النقل لنفس التاريخ مرفوض للحصة المنتظمة
      return setError('النقل لازم يكون لتاريخ مختلف عن تاريخ الحصة الأصلي')
    }
    if (moveDate === session.session_date && moveTime === shortTime(session.start_time)) {
      return setError('الموعد الجديد هو نفس الموعد الحالي')
    }
    try {
      await moveMut.mutateAsync({ session: session as SessionRow, date: moveDate, time: moveTime })
      onDone('اتنقلت الحصة للموعد الجديد')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حصلت مشكلة أثناء النقل')
    }
  }

  const toggleStatus = async () => {
    setError(null)
    try {
      await statusMut.mutateAsync({
        sessionId: session.id,
        status: cancelled ? 'scheduled' : 'cancelled',
      })
      onDone(cancelled ? 'تم استرجاع الحصة' : 'تم إلغاء الحصة')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حصلت مشكلة أثناء الحفظ')
    }
  }

  return (
    <Sheet open title="تفاصيل الحصة" onClose={onClose}>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="font-extrabold text-[16px]">{session.group_name}</span>
        <KindBadge session={session} />
        {isHoliday && (
          <span className="text-[11px] font-bold bg-warn/15 text-warn border border-warn/40 rounded-full px-2 py-0.5">
            🏖️ يوم إجازة
          </span>
        )}
      </div>
      <div className="text-muted text-[13.5px] mb-1">{formatDateLabel(session.session_date)}</div>
      <div className="text-[13.5px] mb-1">
        الساعة {shortTime(session.start_time)} · {session.duration_minutes} دقيقة
        {session.group_room ? ` · ${session.group_room}` : ''}
      </div>
      {session.kind === 'moved' && (
        <div className="text-muted text-[13px] mb-1">
          {originLabel ? `منقولة من حصة ${originLabel}` : 'حصة منقولة من موعد أصلي آخر'}
        </div>
      )}
      {session.note && <div className="text-[13.5px] mb-1">📝 {session.note}</div>}

      <div className="flex flex-col gap-2 mt-4">
        {!cancelled && (
          <Link to={`/attendance?session=${session.id}`} className="no-underline">
            <Button full variant="soft">
              ✅ فتح الحضور
            </Button>
          </Link>
        )}
        {!cancelled && !showMove && (
          <Button full onClick={() => setShowMove(true)}>
            🔀 نقل الحصة لموعد تاني
          </Button>
        )}
        {showMove && (
          <div className="border border-border rounded-xl p-3">
            <div className="font-bold text-[14px] mb-2">نقل الحصة</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="التاريخ الجديد">
                <TextInput
                  type="date"
                  dir="ltr"
                  value={moveDate}
                  onChange={(e) => setMoveDate(e.target.value)}
                />
              </Field>
              <Field label="الميعاد الجديد">
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
                ? 'الحصة الأصلية هتتعلّم ملغاة وهتتنشأ نسخة منقولة في الموعد الجديد.'
                : 'هيتعدّل موعد الحصة دي نفسها (إضافية/منقولة أصلاً).'}
            </p>
            <div className="flex gap-2">
              <Button full onClick={doMove} disabled={busy}>
                {moveMut.isPending ? 'بننقل…' : 'تأكيد النقل'}
              </Button>
              <Button variant="ghost" onClick={() => setShowMove(false)}>
                إلغاء
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
          {statusMut.isPending ? 'بنحفظ…' : cancelled ? '↩️ استرجاع الحصة' : 'إلغاء الحصة'}
        </Button>
      </div>

      {error && <p className="text-bad text-[13px] mt-3">{error}</p>}
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
    if (!groupId) return setError('اختار المجموعة')
    if (!date) return setError('اختار تاريخ الحصة')
    if (!time) return setError('اختار ميعاد الحصة')
    const dur = Number(duration)
    if (!Number.isInteger(dur) || dur <= 0) return setError('المدة لازم تكون عدد دقائق صحيح وموجب')
    try {
      await createMut.mutateAsync({
        group_id: groupId,
        session_date: date,
        start_time: time,
        duration_minutes: dur,
        note: note.trim() === '' ? null : note.trim(),
      })
      onDone(onHoliday ? 'اتضافت الحصة الإضافية (ملغاة — اليوم إجازة)' : 'اتضافت الحصة الإضافية')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حصلت مشكلة أثناء الحفظ')
    }
  }

  return (
    <Sheet open title="حصة إضافية / مراجعة" onClose={onClose}>
      {groups.length === 0 ? (
        <p className="text-muted text-[13.5px]">
          مفيش مجموعات لسه — أنشئ مجموعة الأول من شاشة المجموعات وبعدين ارجع ضيف حصتها الإضافية.
        </p>
      ) : (
        <>
          <Field label="المجموعة *">
            <Select value={groupId} onChange={(e) => pickGroup(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="التاريخ *">
              <TextInput type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="الميعاد *">
              <TextInput type="time" dir="ltr" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المدة (دقيقة)">
              <TextInput
                type="number"
                min={15}
                step={15}
                inputMode="numeric"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </Field>
            <Field label="ملحوظة (اختياري)">
              <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="مراجعة نهائية…" />
            </Field>
          </div>
          {selectedGroup && (
            <p className="text-muted text-[12.5px] mb-3">
              حصة لمرة واحدة لمجموعة «{selectedGroup.name}» — مش هتغيّر جدولها الأسبوعي الثابت.
            </p>
          )}
          {onHoliday && (
            <div className="border border-warn/50 bg-warn/10 rounded-xl px-3 py-2 mb-3 text-[13px]">
              ⚠️ اليوم المختار إجازة رسمية — الحصة هتتنشأ بحالة «ملغاة» زي ما المخطط بيعامل حصص
              أيام الإجازات.
            </div>
          )}
          {error && <p className="text-bad text-[13px] mb-3">{error}</p>}
          <div className="flex gap-2">
            <Button full onClick={save} disabled={createMut.isPending}>
              {createMut.isPending ? 'بنحفظ…' : 'إضافة الحصة'}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
          </div>
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
    if (!from || !to) return setError('اختار بداية ونهاية الإجازة')
    if (to < from) return setError('تاريخ النهاية قبل البداية')
    if (dates.length > MAX_HOLIDAY_DAYS)
      return setError(`النطاق كبير — الحد الأقصى ${MAX_HOLIDAY_DAYS} يوم في المرة`)
    try {
      await addMut.mutateAsync({ dates, name: name.trim() === '' ? null : name.trim() })
      onDone(
        dates.length === 1
          ? 'اتسجلت الإجازة واتلغت حصص اليوم'
          : `اتسجلت الإجازة (${dates.length} يوم) واتلغت الحصص الواقعة فيها`,
      )
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حصلت مشكلة أثناء الحفظ')
    }
  }

  return (
    <Sheet open title="إجازة رسمية" onClose={onClose}>
      <Field label="اسم الإجازة (اختياري)">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="عيد الفطر، إجازة نصف العام…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="من يوم *">
          <TextInput type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="إلى يوم *">
          <TextInput type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <p className="text-muted text-[12.5px] mb-3">
        {dates.length > 0
          ? `${dates.length} ${dates.length === 1 ? 'يوم' : 'يوم'} — حصص كل المجموعات في الأيام دي هتتعلّم «ملغاة» (مش هتتمسح)، وحذف الإجازة بعد كده بيرجّعها.`
          : 'اختار نطاقاً صحيحاً — ليوم واحد بس خلّي البداية والنهاية نفس اليوم.'}
      </p>
      {error && <p className="text-bad text-[13px] mb-3">{error}</p>}
      <div className="flex gap-2">
        <Button full onClick={save} disabled={addMut.isPending}>
          {addMut.isPending ? 'بنحفظ…' : 'حفظ الإجازة'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          إلغاء
        </Button>
      </div>
    </Sheet>
  )
}
