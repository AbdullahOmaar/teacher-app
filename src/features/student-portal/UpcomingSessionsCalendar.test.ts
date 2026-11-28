import { describe, expect, it } from 'vitest'
import {
  groupSessionsByDate,
  monthGridDates,
  monthKeyOf,
  shiftMonthKey,
} from './calendarLogic'
import type { StudentPortalSession } from './api'

function session(date: string, start_time: string, group_name = 'مجموعة أ'): StudentPortalSession {
  return { date, start_time, duration_minutes: 60, kind: 'regular', group_name, room: null }
}

describe('monthGridDates — شبكة الشهر', () => {
  it('42 خلية دائماً (6 أسابيع)', () => {
    expect(monthGridDates('2026-11')).toHaveLength(42)
    expect(monthGridDates('2026-02')).toHaveLength(42)
  })

  it('تبدأ من الأحد السابق لأول الشهر أو أوله نفسه', () => {
    // 1 نوفمبر 2026 = الأحد نفسه → الشبكة تبدأ به
    expect(monthGridDates('2026-11')[0]).toBe('2026-11-01')
    // 1 ديسمبر 2026 = الثلاثاء → الشبكة تبدأ من الأحد 29 نوفمبر
    expect(monthGridDates('2026-12')[0]).toBe('2026-11-29')
  })

  it('تحتوي كل أيام الشهر المطلوب', () => {
    const grid = monthGridDates('2026-12')
    expect(grid).toContain('2026-12-01')
    expect(grid).toContain('2026-12-31')
    expect(grid.filter((d) => d.startsWith('2026-12'))).toHaveLength(31)
  })

  it('أيام متتالية بلا فجوات', () => {
    const grid = monthGridDates('2026-11')
    for (let i = 1; i < grid.length; i++) {
      const prev = new Date(`${grid[i - 1]}T00:00:00`).getTime()
      const cur = new Date(`${grid[i]}T00:00:00`).getTime()
      expect(cur - prev).toBe(86_400_000)
    }
  })
})

describe('monthKeyOf / shiftMonthKey', () => {
  it('مفتاح الشهر من التاريخ', () => {
    expect(monthKeyOf('2026-11-28')).toBe('2026-11')
  })

  it('إزاحة عبر حدود السنة', () => {
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01')
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12')
    expect(shiftMonthKey('2026-11', 1)).toBe('2026-12')
  })
})

describe('groupSessionsByDate — تجميع الحصص', () => {
  it('يجمع بالتاريخ ويرتب داخل اليوم بوقت البدء', () => {
    const map = groupSessionsByDate([
      session('2026-11-28', '20:00:00'),
      session('2026-11-28', '17:00:00'),
      session('2026-11-29', '19:30:00'),
    ])
    expect([...map.keys()].sort()).toEqual(['2026-11-28', '2026-11-29'])
    expect(map.get('2026-11-28')?.map((s) => s.start_time)).toEqual(['17:00:00', '20:00:00'])
  })

  it('قائمة فارغة → خريطة فارغة', () => {
    expect(groupSessionsByDate([]).size).toBe(0)
  })
})
