import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { formatTime12 } from '../../lib/format'
import { t } from '../../i18n'
import { MONTH_NAMES, formatDateLabel, parseDate } from '../schedule/api'
import { todayStr } from '../home/api'
import {
  groupSessionsByDate,
  monthGridDates,
  monthKeyOf,
  shiftMonthKey,
} from './calendarLogic'
import type { StudentPortalSession } from './api'

/**
 * كاليندر «حصصي القادمة» في بوابة الطالب (ملاحظة المالك الحية
 * 2026-11-28): عرض تقويم شهري بدل قائمة الحصص الطويلة — نفس بيانات
 * upcoming_sessions كما هي من الـ RPC، بلا أي تغيير في المصدر.
 * شبكة الشهر بنفس لغة تقويم شاشة الجدول عند المدرس (الأسبوع يبدأ
 * الأحد، نقاط للحصص، اليوم الحالي بخط عريض ملوّن، واليوم المختار
 * بإطار/خلفية) — والتنقّل محصور بين شهر اليوم وشهر آخر حصة حتى لا
 * يتيه الطالب في شهور فارغة. تحت الشبكة تظهر حصص اليوم المختار
 * بتخطيط كروت البوابة الموحّد (الاسم وشارة النوع في سطر، والميعاد
 * في سطر).
 */

const WEEKDAY_KEYS = [
  'studentPortal.calWeekdaySun',
  'studentPortal.calWeekdayMon',
  'studentPortal.calWeekdayTue',
  'studentPortal.calWeekdayWed',
  'studentPortal.calWeekdayThu',
  'studentPortal.calWeekdayFri',
  'studentPortal.calWeekdaySat',
] as const

export function UpcomingSessionsCalendar({ sessions }: { sessions: StudentPortalSession[] }) {
  const today = todayStr()
  // التجميع رخيص (حصص قادمة معدودة) — بلا memo يدوي
  const byDate = groupSessionsByDate(sessions)
  const sortedDates = [...byDate.keys()].sort()
  const firstDate = sortedDates[0] ?? today
  const lastDate = sortedDates[sortedDates.length - 1] ?? today
  const minMonth = monthKeyOf(today)
  const maxMonth = monthKeyOf(lastDate)

  const [selected, setSelected] = useState(firstDate)
  const [cursor, setCursor] = useState(monthKeyOf(firstDate))

  const dates = monthGridDates(cursor)
  const [cursorYear, cursorMonth] = cursor.split('-').map(Number)
  const daySessions = byDate.get(selected) ?? []

  const goMonth = (n: number) => {
    const next = shiftMonthKey(cursor, n)
    if (next < minMonth || next > maxMonth) return
    setCursor(next)
  }

  return (
    <>
      <Card data-cal-grid>
        <div className="flex items-center justify-between gap-2 mb-2">
          <button
            type="button"
            aria-label={t('studentPortal.calPrevMonth')}
            disabled={cursor <= minMonth}
            onClick={() => goMonth(-1)}
            className="w-10 h-10 rounded-full bg-soft text-primary flex items-center justify-center border-0 cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            <ChevronRight size={20} />
          </button>
          <div className="font-extrabold text-[15px]">
            {MONTH_NAMES[cursorMonth - 1]} {cursorYear}
          </div>
          <button
            type="button"
            aria-label={t('studentPortal.calNextMonth')}
            disabled={cursor >= maxMonth}
            onClick={() => goMonth(1)}
            className="w-10 h-10 rounded-full bg-soft text-primary flex items-center justify-center border-0 cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            <ChevronLeft size={20} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_KEYS.map((k) => (
            <div key={k} className="text-center text-[12px] font-bold text-muted py-1">
              {t(k)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dates.map((date) => {
            const d = parseDate(date)
            const inMonth = monthKeyOf(date) === cursor
            const dayList = byDate.get(date) ?? []
            const isToday = date === today
            const isSelected = date === selected
            return (
              <button
                key={date}
                type="button"
                data-cal-date={date}
                data-has-sessions={dayList.length > 0 ? 'true' : 'false'}
                onClick={() => setSelected(date)}
                className={`relative min-h-[48px] rounded-xl border cursor-pointer flex flex-col items-center justify-start pt-1.5 px-0.5 ${
                  isSelected
                    ? 'border-primary bg-soft'
                    : isToday
                      ? 'border-primary/50 bg-card'
                      : 'border-transparent bg-transparent hover:bg-soft'
                } ${inMonth ? 'text-text' : 'text-muted opacity-50'}`}
              >
                <span
                  className={`text-[13.5px] leading-none ${isToday ? 'font-extrabold text-primary' : 'font-semibold'}`}
                >
                  {d.getDate()}
                </span>
                {dayList.length > 0 && (
                  <span className="flex gap-0.5 mt-1.5">
                    {dayList.slice(0, 3).map((s) => (
                      <span key={`${s.start_time}-${s.group_name}`} className="w-1.5 h-1.5 rounded-full bg-primary" />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </Card>

      <div className="flex items-center justify-between gap-2 mt-3 mb-2">
        <h4 className="text-[15px] font-extrabold m-0" data-cal-selected-day>
          {formatDateLabel(selected)}
        </h4>
      </div>
      {daySessions.length === 0 ? (
        <Card>
          <p className="text-muted text-[13.5px] mb-0">{t('studentPortal.calNoSessionsDay')}</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          {daySessions.map((s, i) => (
            <div
              key={`${s.date}-${s.start_time}-${s.group_name}-${i}`}
              className={`px-[14px] py-2.5 ${i < daySessions.length - 1 ? 'border-b border-border' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[15px] flex-1 min-w-0 truncate">{s.group_name}</span>
                {s.kind === 'extra' ? (
                  <span className="shrink-0 text-[12px] font-bold bg-soft text-primary rounded-full px-2.5 py-1 whitespace-nowrap">
                    {t('studentPortal.pageSessionExtraBadge')}
                  </span>
                ) : s.kind === 'moved' ? (
                  <span className="shrink-0 text-[12px] font-bold bg-soft text-primary rounded-full px-2.5 py-1 whitespace-nowrap">
                    {t('studentPortal.pageSessionMovedBadge')}
                  </span>
                ) : null}
              </div>
              <div className="text-muted text-[12px] mt-0.5">
                {t('studentPortal.pageSessionTimeLine', {
                  time: formatTime12(s.start_time),
                  duration: s.duration_minutes,
                })}
                {s.room ? ` · ${s.room}` : ''}
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  )
}
