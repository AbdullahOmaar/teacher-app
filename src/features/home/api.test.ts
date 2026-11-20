import { describe, expect, it } from 'vitest'
import {
  addDaysStr,
  monthEndStr,
  monthStartStr,
  relLabel,
  sessionEnd,
  sessionStart,
  toDateStr,
} from './api'

// اختبارات مساعدات التاريخ النقية (بالتوقيت المحلي، صيغة 'YYYY-MM-DD')
describe('مساعدات التاريخ', () => {
  it('toDateStr يصفّر الشهر واليوم', () => {
    expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toDateStr(new Date(2026, 10, 20))).toBe('2026-11-20')
  })
  it('addDaysStr يعبر حدود الشهور والسنوات ذهاباً وإياباً', () => {
    expect(addDaysStr('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDaysStr('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDaysStr('2026-11-20', 0)).toBe('2026-11-20')
    expect(addDaysStr('2026-11-20', -29)).toBe('2026-10-22')
  })
  it('monthStartStr / monthEndStr', () => {
    expect(monthStartStr('2026-11-20')).toBe('2026-11-01')
    expect(monthEndStr('2026-11-20')).toBe('2026-11-30')
    expect(monthEndStr('2026-02-10')).toBe('2026-02-28')
    expect(monthEndStr('2024-02-10')).toBe('2024-02-29') // سنة كبيسة
    expect(monthEndStr('2026-12-15')).toBe('2026-12-31')
  })
})

describe('أوقات الحصص النسبية', () => {
  const sess = { session_date: '2026-11-20', start_time: '10:00:00', duration_minutes: 60 }
  it('sessionStart/sessionEnd', () => {
    expect(sessionStart(sess).getHours()).toBe(10)
    expect(sessionEnd(sess).getTime() - sessionStart(sess).getTime()).toBe(60 * 60_000)
  })
  it('relLabel: قبل/أثناء/بعد', () => {
    expect(relLabel(sess, new Date(2026, 10, 20, 9, 0))).toBe('بعد ساعة')
    expect(relLabel(sess, new Date(2026, 10, 20, 8, 30))).toBe('بعد ساعة و30 دقيقة')
    expect(relLabel(sess, new Date(2026, 10, 20, 10, 30))).toBe('بدأت من 30 دقيقة')
    expect(relLabel(sess, new Date(2026, 10, 20, 12, 0))).toBe('خلصت')
  })
})
