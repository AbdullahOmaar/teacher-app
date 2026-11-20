import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/toast'
import { Button } from '../../components/ui/Button'
import { CalendarDays, CalendarOff, ChevronLeft, RefreshCw } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Fab } from '../../components/ui/Fab'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired, Skeleton } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { DAY_NAMES, formatTime12 } from '../../lib/format'
import { useGroups } from '../groups/hooks'
import { addDaysStr } from '../home/api'
import {
  MONTH_NAMES,
  formatDateLabel,
  formatDayMonth,
  generationWindowMonths,
  monthEndStr,
  monthStartStr,
  monthsCovering,
  parseDate,
  resetGenerationCache,
  todayStr,
  weekDates,
  weekStartStr,
  addMonthsStr,
  type SessionWithGroup,
} from './api'
import {
  useDeleteHoliday,
  useGeneration,
  useHolidays,
  useScheduleSessions,
  useSetSessionStatus,
} from './hooks'
import { ExtraSessionSheet, HolidaySheet, KindBadge, SessionDetailSheet } from './sheets'

type ViewMode = 'week' | 'month'

/**
 * الجدول والتقويم (المواصفات §3.8 + خطوة الجدول):
 * مبدّل (أسبوعي/شهري/+ حصة إضافية)، عرض أسبوعي وتقويم شهري بالحصص الحقيقية
 * من جدول sessions بعد توليدها من جداول المجموعات عبر دالة المخطط،
 * تمييز بصري للملغاة/الإضافية/المنقولة وأيام الإجازات، تنقّل بين الأسابيع
 * والشهور، والنقر على حصة يفتح تفاصيلها وإجراءاتها (نقل/إلغاء/حضور)،
 * وقسم لإدارة الإجازات (إضافة نطاق/يوم — حذف يعيد حصص اليوم).
 */
export function SchedulePage() {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined

  const today = todayStr()
  const [view, setView] = useState<ViewMode>('week')
  const [weekAnchor, setWeekAnchor] = useState(today)
  const [monthCursor, setMonthCursor] = useState(() => monthStartStr(today))
  const [selectedDay, setSelectedDay] = useState(today)
  const [selectedSession, setSelectedSession] = useState<SessionWithGroup | null>(null)
  const [extraOpen, setExtraOpen] = useState(false)
  const [holidayOpen, setHolidayOpen] = useState(false)
  const toast = useToast()

  const groupsQ = useGroups(teacherId)
  const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data])
  const holidaysQ = useHolidays(teacherId)

  // مدى العرض الحالي
  const weekStart = weekStartStr(weekAnchor)
  const monthGridStart = weekStartStr(monthCursor)
  const monthGridEnd = addDaysStr(weekStartStr(monthEndStr(monthCursor)), 6)
  const range = useMemo(
    () =>
      view === 'week'
        ? { from: weekStart, to: addDaysStr(weekStart, 6) }
        : { from: monthGridStart, to: monthGridEnd },
    [view, weekStart, monthGridStart, monthGridEnd],
  )

  // شهور التوليد: النافذة الافتراضية (ماضٍ/حالي/قادم) + شهور مدى العرض —
  // فالتنقّل لأي أسبوع/شهر يولّد حصصه عند الحاجة
  const neededMonths = useMemo(() => {
    const set = new Set<string>([
      ...generationWindowMonths(today),
      ...monthsCovering(range.from, range.to),
    ])
    return [...set].sort()
  }, [today, range])

  const genQ = useGeneration(teacherId, groupsQ.data, neededMonths)
  const sessionsQ = useScheduleSessions(teacherId, range.from, range.to, genQ.isSuccess)
  const sessions = useMemo(() => sessionsQ.data ?? [], [sessionsQ.data])

  const holidayByDate = useMemo(() => {
    const map = new Map<string, { id: string; name: string | null }>()
    for (const h of holidaysQ.data ?? []) map.set(h.holiday_date, { id: h.id, name: h.name })
    return map
  }, [holidaysQ.data])

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, SessionWithGroup[]>()
    for (const s of sessions) {
      const arr = map.get(s.session_date) ?? []
      arr.push(s)
      map.set(s.session_date, arr)
    }
    return map
  }, [sessions])

  const deleteHolidayMut = useDeleteHoliday(teacherId ?? '')
  const statusMut = useSetSessionStatus(teacherId ?? '')

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  const tid = teacher.teacherId
  const primaryError = groupsQ.error ?? genQ.error ?? sessionsQ.error ?? holidaysQ.error
  const primaryPending =
    groupsQ.isPending || holidaysQ.isPending || genQ.isPending || sessionsQ.isPending

  const refreshAll = async () => {
    // إعادة توليد كاملة: مسح ذاكرة الجلسة ثم RPC ثم إعادة قراءة الحصص
    resetGenerationCache()
    toast('بيتم تحديث الحصص من جداول المجموعات…')
    await genQ.refetch()
    await sessionsQ.refetch()
    toast('اتحدّثت الحصص من جداول المجموعات')
  }

  const originLabelFor = (s: SessionWithGroup): string | null => {
    if (!s.origin_session_id) return null
    const origin = sessions.find((x) => x.id === s.origin_session_id)
    return origin ? formatDateLabel(origin.session_date) : null
  }

  const upcomingHolidays = (holidaysQ.data ?? []).filter(
    (h) => h.holiday_date >= addDaysStr(today, -30),
  )

  return (
    <div>
      {/* المبدّل الثلاثي (المرجع §3.8) */}
      <div className="flex gap-2 mb-3">
        <div className="flex w-full bg-soft rounded-full p-1">
          {(
            [
              { key: 'week', label: 'الجدول الأسبوعي' },
              { key: 'month', label: 'التقويم الشهري' },
            ] as { key: ViewMode; label: string }[]
          ).map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`flex-1 min-h-[48px] rounded-full text-[13.5px] font-bold cursor-pointer border-0 ${
                view === v.key ? 'bg-card text-primary shadow-card' : 'bg-transparent text-muted'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {primaryPending ? (
        <>
          <Skeleton className="h-[52px] mb-3" />
          <Skeleton className="h-[180px] mb-3" />
          <Skeleton className="h-[120px]" />
        </>
      ) : primaryError ? (
        <ErrorState
          message={primaryError instanceof Error ? primaryError.message : 'خطأ غير معروف'}
          onRetry={() => {
            void groupsQ.refetch()
            void holidaysQ.refetch()
            void genQ.refetch()
            void sessionsQ.refetch()
          }}
        />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="لا توجد مجموعات بعد — فلا حصص تُولّد"
            hint="الحصص بتتولّد تلقائياً من الجدول الأسبوعي لكل مجموعة. أنشئ أول مجموعة وحدد أيامها وميعادها وهتظهر حصصها هنا."
          />
          <div className="text-center pb-2">
            <Link to="/groups" className="no-underline">
              <Button>إنشاء مجموعة</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {view === 'week' ? (
            <WeekView
              weekStart={weekStart}
              today={today}
              sessionsByDate={sessionsByDate}
              holidayByDate={holidayByDate}
              onPrev={() => setWeekAnchor(addDaysStr(weekAnchor, -7))}
              onNext={() => setWeekAnchor(addDaysStr(weekAnchor, 7))}
              onToday={() => setWeekAnchor(today)}
              onPick={(s) => setSelectedSession(s)}
            />
          ) : (
            <MonthView
              monthCursor={monthCursor}
              gridStart={monthGridStart}
              gridEnd={monthGridEnd}
              today={today}
              selectedDay={selectedDay}
              sessionsByDate={sessionsByDate}
              holidayByDate={holidayByDate}
              onPrevMonth={() => setMonthCursor(addMonthsStr(monthCursor, -1))}
              onNextMonth={() => setMonthCursor(addMonthsStr(monthCursor, 1))}
              onToday={() => {
                setMonthCursor(monthStartStr(today))
                setSelectedDay(today)
              }}
              onSelectDay={setSelectedDay}
              selectedSessions={sessionsByDate.get(selectedDay) ?? []}
              selectedIsHoliday={holidayByDate.has(selectedDay)}
              onToggleHoliday={async () => {
                const h = (holidaysQ.data ?? []).find((x) => x.holiday_date === selectedDay)
                try {
                  if (h) {
                    await deleteHolidayMut.mutateAsync(h)
                    toast('اتلغت الإجازة واترجعت حصص اليوم')
                  } else {
                    setHolidayOpen(true)
                  }
                } catch {
                  toast('حصلت مشكلة — حاول تاني')
                }
              }}
              holidayBusy={deleteHolidayMut.isPending}
              onPick={(s) => setSelectedSession(s)}
              onQuickToggle={async (s) => {
                try {
                  await statusMut.mutateAsync({
                    sessionId: s.id,
                    status: s.status === 'cancelled' ? 'scheduled' : 'cancelled',
                  })
                  toast(s.status === 'cancelled' ? 'تم استرجاع الحصة' : 'تم إلغاء الحصة')
                } catch {
                  toast('حصلت مشكلة — حاول تاني')
                }
              }}
              quickBusy={statusMut.isPending}
            />
          )}

          <div className="flex justify-end mt-1 mb-2">
            <button
              onClick={refreshAll}
              className="inline-flex items-center gap-2 min-h-[48px] text-[13.5px] font-semibold text-primary bg-transparent border-0 cursor-pointer px-1"
            >
              <RefreshCw size={18} />
              تحديث الحصص من جداول المجموعات
            </button>
          </div>

          {/* إدارة الإجازات */}
          <h2 className="type-section mb-2 mt-2">الإجازات الرسمية</h2>
          <Button full variant="soft" className="mb-3" onClick={() => setHolidayOpen(true)}>
            <CalendarOff size={20} />
            إضافة إجازة (يوم أو نطاق)
          </Button>
          {upcomingHolidays.length === 0 ? (
            <Card>
              <div className="text-muted text-[13.5px] text-center py-2">
                مفيش إجازات مسجلة قريب — حصص أيام الإجازة بتتعلّم «ملغاة» تلقائياً.
              </div>
            </Card>
          ) : (
            upcomingHolidays.map((h) => (
              <Card key={h.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-[15px]">{formatDateLabel(h.holiday_date)}</div>
                    <div className="text-muted text-[13.5px]">
                      {h.name ?? 'إجازة رسمية'} — حصص اليوم ملغاة
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await deleteHolidayMut.mutateAsync(h)
                        toast('اتحذفت الإجازة واترجعت حصص اليوم')
                      } catch {
                        toast('حصلت مشكلة — حاول تاني')
                      }
                    }}
                    disabled={deleteHolidayMut.isPending}
                    className="shrink-0 inline-flex items-center text-[13.5px] font-bold text-bad-text bg-transparent border border-bad/40 rounded-full px-3 min-h-[48px] cursor-pointer disabled:opacity-50"
                  >
                    حذف
                  </button>
                </div>
              </Card>
            ))
          )}
        </>
      )}

      <Fab onClick={() => setExtraOpen(true)} ariaLabel="إضافة حصة إضافية" label="حصة إضافية" />

      {selectedSession && (
        <SessionDetailSheet
          session={selectedSession}
          originLabel={originLabelFor(selectedSession)}
          isHoliday={holidayByDate.has(selectedSession.session_date)}
          teacherId={tid}
          onClose={() => setSelectedSession(null)}
          onDone={toast}
        />
      )}
      {extraOpen && (
        <ExtraSessionSheet
          groups={groups}
          holidayDates={new Set(holidayByDate.keys())}
          teacherId={tid}
          onClose={() => setExtraOpen(false)}
          onDone={toast}
        />
      )}
      {holidayOpen && (
        <HolidaySheet teacherId={tid} onClose={() => setHolidayOpen(false)} onDone={toast} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// العرض الأسبوعي — حصص حقيقية لأسبوع يبدأ الأحد، بتنقّل بين الأسابيع
// ---------------------------------------------------------------------------

function WeekView({
  weekStart,
  today,
  sessionsByDate,
  holidayByDate,
  onPrev,
  onNext,
  onToday,
  onPick,
}: {
  weekStart: string
  today: string
  sessionsByDate: Map<string, SessionWithGroup[]>
  holidayByDate: Map<string, { id: string; name: string | null }>
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onPick: (s: SessionWithGroup) => void
}) {
  const dates = weekDates(weekStart)
  const isCurrentWeek = weekStart === weekStartStr(today)
  return (
    <div>
      {/* مدى الأسبوع طويل («15 نوفمبر – 21 نوفمبر 2026»): صف كامل على
          الموبايل والزرّان نصفان تحته بدل انضغاطه بينهما على سطرين */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <button
          onClick={onPrev}
          className="flex-1 min-[480px]:flex-none text-[13.5px] font-bold text-primary bg-soft border-0 rounded-full px-3 min-h-[48px] cursor-pointer whitespace-nowrap"
        >
          الأسبوع السابق
        </button>
        <div className="order-first w-full min-[480px]:order-none min-[480px]:w-auto font-extrabold text-[15px] text-center">
          {formatDayMonth(dates[0])} – {formatDayMonth(dates[6])}{' '}
          {parseDate(dates[6]).getFullYear()}
        </div>
        <button
          onClick={onNext}
          className="flex-1 min-[480px]:flex-none text-[13.5px] font-bold text-primary bg-soft border-0 rounded-full px-3 min-h-[48px] cursor-pointer whitespace-nowrap"
        >
          الأسبوع التالي
        </button>
      </div>
      {!isCurrentWeek && (
        <div className="text-center mb-3">
          <button
            onClick={onToday}
            className="inline-flex items-center text-[13.5px] font-bold text-primary bg-transparent border border-primary/40 rounded-full px-3 min-h-[48px] cursor-pointer"
          >
            رجوع لأسبوع النهاردة
          </button>
        </div>
      )}

      {dates.map((date) => {
        const daySessions = sessionsByDate.get(date) ?? []
        const holiday = holidayByDate.get(date)
        const isToday = date === today
        return (
          <div key={date} className="mb-3">
            <div className="flex items-center gap-2 mb-1.5 px-0.5">
              <span className={`font-extrabold text-[15px] ${isToday ? 'text-primary' : ''}`}>
                {DAY_NAMES[parseDate(date).getDay()]} {formatDayMonth(date)}
              </span>
              {isToday && (
                <span className="text-[12px] font-bold bg-primary text-on-primary rounded-full px-2 py-0.5">
                  اليوم
                </span>
              )}
              {holiday && (
                <span className="text-[12px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5">
                  إجازة{holiday.name ? `: ${holiday.name}` : ''}
                </span>
              )}
            </div>
            {daySessions.length === 0 ? (
              <div className="text-muted text-[13.5px] px-0.5 pb-1">
                {holiday ? 'إجازة — مفيش حصص' : 'متاح بالكامل'}
              </div>
            ) : (
              daySessions.map((s) => (
                <SessionCard key={s.id} session={s} onPick={onPick} />
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// التقويم الشهري — شبكة الشهر + قسم اليوم المختار (المرجع §3.8)
// ---------------------------------------------------------------------------

function MonthView({
  monthCursor,
  gridStart,
  gridEnd,
  today,
  selectedDay,
  sessionsByDate,
  holidayByDate,
  onPrevMonth,
  onNextMonth,
  onToday,
  onSelectDay,
  selectedSessions,
  selectedIsHoliday,
  onToggleHoliday,
  holidayBusy,
  onPick,
  onQuickToggle,
  quickBusy,
}: {
  monthCursor: string
  gridStart: string
  gridEnd: string
  today: string
  selectedDay: string
  sessionsByDate: Map<string, SessionWithGroup[]>
  holidayByDate: Map<string, { id: string; name: string | null }>
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  onSelectDay: (d: string) => void
  selectedSessions: SessionWithGroup[]
  selectedIsHoliday: boolean
  onToggleHoliday: () => void
  holidayBusy: boolean
  onPick: (s: SessionWithGroup) => void
  onQuickToggle: (s: SessionWithGroup) => void
  quickBusy: boolean
}) {
  const cursorDate = parseDate(monthCursor)
  const dates: string[] = []
  for (let d = gridStart; d <= gridEnd; d = addDaysStr(d, 1)) dates.push(d)
  const isCurrentMonth = monthCursor === monthStartStr(today)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <button
          onClick={onPrevMonth}
          className="flex-1 min-[480px]:flex-none text-[13.5px] font-bold text-primary bg-soft border-0 rounded-full px-3 min-h-[48px] cursor-pointer whitespace-nowrap"
        >
          الشهر السابق
        </button>
        <div className="order-first w-full text-center min-[480px]:order-none min-[480px]:w-auto font-extrabold text-[15px]">
          {MONTH_NAMES[cursorDate.getMonth()]} {cursorDate.getFullYear()}
        </div>
        <button
          onClick={onNextMonth}
          className="flex-1 min-[480px]:flex-none text-[13.5px] font-bold text-primary bg-soft border-0 rounded-full px-3 min-h-[48px] cursor-pointer whitespace-nowrap"
        >
          الشهر التالي
        </button>
      </div>
      {!isCurrentMonth && (
        <div className="text-center mb-3">
          <button
            onClick={onToday}
            className="inline-flex items-center text-[13.5px] font-bold text-primary bg-transparent border border-primary/40 rounded-full px-3 min-h-[48px] cursor-pointer"
          >
            اليوم
          </button>
        </div>
      )}

      <Card>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map((n) => (
            <div key={n} className="text-center text-[12px] font-bold text-muted py-1">
              {n}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dates.map((date) => {
            const d = parseDate(date)
            const inMonth = d.getMonth() === cursorDate.getMonth()
            const daySessions = sessionsByDate.get(date) ?? []
            const scheduled = daySessions.filter((s) => s.status === 'scheduled').length
            const allCancelled = daySessions.length > 0 && scheduled === 0
            const holiday = holidayByDate.has(date)
            const isToday = date === today
            const isSelected = date === selectedDay
            return (
              <button
                key={date}
                onClick={() => onSelectDay(date)}
                className={`relative min-h-[48px] rounded-xl border cursor-pointer flex flex-col items-center justify-start pt-1.5 px-0.5 ${
                  isSelected
                    ? 'border-primary bg-soft'
                    : isToday
                      ? 'border-primary/50 bg-card'
                      : 'border-transparent bg-transparent hover:bg-soft'
                } ${inMonth ? 'text-text' : 'text-muted opacity-50'}`}
              >
                <span className={`text-[13.5px] leading-none ${isToday ? 'font-extrabold text-primary' : 'font-semibold'}`}>
                  {d.getDate()}
                </span>
                {holiday ? (
                  <span className="text-[12px] font-bold text-warn-text mt-1">إجازة</span>
                ) : daySessions.length > 0 ? (
                  allCancelled ? (
                    <span className="text-[12px] font-bold text-muted mt-1">ملغاة</span>
                  ) : (
                    <span className="flex gap-0.5 mt-1.5">
                      {daySessions.slice(0, 3).map((s) => (
                        <span
                          key={s.id}
                          className={`w-1.5 h-1.5 rounded-full ${s.status === 'cancelled' ? 'bg-muted' : 'bg-primary'}`}
                        />
                      ))}
                    </span>
                  )
                ) : null}
              </button>
            )
          })}
        </div>
      </Card>

      {/* قسم اليوم المختار */}
      <div className="flex items-center justify-between gap-2 mt-1 mb-2">
        <h2 className="text-[15px] font-extrabold">{formatDateLabel(selectedDay)}</h2>
        <button
          onClick={onToggleHoliday}
          disabled={holidayBusy}
          className="shrink-0 text-[13.5px] font-bold text-primary bg-soft border-0 rounded-full px-3 min-h-[48px] cursor-pointer disabled:opacity-50"
        >
          {selectedIsHoliday ? 'إلغاء الإجازة' : 'إجازة رسمية'}
        </button>
      </div>
      {selectedIsHoliday && (
        <div className="border border-warn/50 bg-warn/10 rounded-xl px-3 py-2 mb-3 text-[13.5px]">
          اليوم ده إجازة رسمية — حصصه متعلّمة «ملغاة». إلغاء الإجازة بيرجّعها.
        </div>
      )}
      {selectedSessions.length === 0 ? (
        <Card>
          <div className="text-muted text-[13.5px] text-center py-2">
            {selectedIsHoliday ? 'إجازة — مفيش حصص اليوم ده.' : 'مفيش حصص مجدولة اليوم ده.'}
          </div>
        </Card>
      ) : (
        selectedSessions.map((s) => (
          <SessionCard key={s.id} session={s} onPick={onPick}>
            <div className="flex gap-2 mt-2.5">
              {s.status !== 'cancelled' && (
                <Link to={`/attendance?session=${s.id}`} className="no-underline flex-1" onClick={(e) => e.stopPropagation()}>
                  <Button full variant="soft" className="min-h-[48px] text-[13.5px]">
                    الحضور
                  </Button>
                </Link>
              )}
              <Button
                full={s.status === 'cancelled'}
                variant={s.status === 'cancelled' ? 'primary' : 'ghost'}
                className="min-h-[48px] text-[13.5px] flex-1"
                disabled={quickBusy}
                onClick={(e) => {
                  e.stopPropagation()
                  onQuickToggle(s)
                }}
              >
                {s.status === 'cancelled' ? 'استرجاع' : 'إلغاء الحصة'}
              </Button>
            </div>
          </SessionCard>
        ))
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// بطاقة حصة — تُستخدم في العرضين؛ الضغط يفتح التفاصيل
// ---------------------------------------------------------------------------

function SessionCard({
  session: s,
  onPick,
  children,
}: {
  session: SessionWithGroup
  onPick: (s: SessionWithGroup) => void
  children?: React.ReactNode
}) {
  const cancelled = s.status === 'cancelled'
  return (
    <Card
      className={`cursor-pointer ${cancelled ? 'opacity-70' : ''}`}
      onClick={() => onPick(s)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[15px]">{s.group_name}</span>
            <KindBadge session={s} />
          </div>
          <div className="text-muted text-[13.5px] mt-0.5">
            {formatTime12(s.start_time)} · {s.duration_minutes} دقيقة
            {s.group_room ? ` · ${s.group_room}` : ''}
            {s.note ? ` · ${s.note}` : ''}
          </div>
        </div>
        <ChevronLeft size={24} className="text-muted shrink-0" />
      </div>
      {children}
    </Card>
  )
}
