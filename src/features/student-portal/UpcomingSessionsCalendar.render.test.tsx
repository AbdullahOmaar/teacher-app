import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { UpcomingSessionsCalendar } from './UpcomingSessionsCalendar'
import type { StudentPortalSession } from './api'

// كاليندر الحصص القادمة (ملاحظة المالك 2026-11-28): شبكة شهر بنقاط
// للحصص، واليوم المختار يعرض حصصه تحت الشبكة — نفس البيانات، عرض فقط
function session(date: string, start_time: string, group_name: string, kind = 'regular'): StudentPortalSession {
  return { date, start_time, duration_minutes: 60, kind, group_name, room: 'قاعة 2' }
}

const SESSIONS: StudentPortalSession[] = [
  session('2026-11-28', '17:00:00', 'فيزياء — أولى ثانوي'),
  session('2026-11-28', '20:00:00', 'فيزياء — أولى ثانوي', 'extra'),
  session('2026-12-02', '19:30:00', 'كيمياء — أولى ثانوي', 'extra'),
]

describe('UpcomingSessionsCalendar — العرض والتفاعل', () => {
  afterEach(() => {
    cleanup()
  })

  it('يعرض شبكة الشهر الأول وعلامات على أيام الحصص فقط', () => {
    const { container } = render(<UpcomingSessionsCalendar sessions={SESSIONS} />)
    expect(container.querySelector('[data-cal-grid]')).toBeTruthy()
    const marked = container.querySelectorAll('[data-has-sessions="true"]')
    // في شبكة نوفمبر: 28 نوفمبر فقط (2 ديسمبر خارج شبكة نوفمبر الظاهرة؟ شبكة نوفمبر تمتد لـ 12 ديسمبر)
    expect([...marked].map((c) => c.getAttribute('data-cal-date'))).toContain('2026-11-28')
    expect(container.querySelector('[data-cal-date="2026-11-15"]')?.getAttribute('data-has-sessions')).toBe('false')
  })

  it('اليوم المختار افتراضياً هو أول يوم فيه حصة وحصصه ظاهرة', () => {
    render(<UpcomingSessionsCalendar sessions={SESSIONS} />)
    expect(screen.getByText(/السبت 28 نوفمبر 2026/)).toBeTruthy()
    expect(screen.getByText('حصة إضافية')).toBeTruthy()
  })

  it('الضغط على يوم آخر يبدّل قائمة حصصه', () => {
    const { container } = render(<UpcomingSessionsCalendar sessions={SESSIONS} />)
    const cell = container.querySelector('[data-cal-date="2026-11-29"]')
    expect(cell).toBeTruthy()
    fireEvent.click(cell!)
    expect(screen.getByText('مفيش حصص في اليوم ده')).toBeTruthy()
  })

  it('التنقّل للشهر التالي يعرض شبكة ديسمبر', () => {
    render(<UpcomingSessionsCalendar sessions={SESSIONS} />)
    fireEvent.click(screen.getByRole('button', { name: 'الشهر التالي' }))
    expect(screen.getByText('ديسمبر 2026')).toBeTruthy()
  })
})
