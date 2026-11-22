import { describe, expect, it } from 'vitest'
import {
  addMonthsStr,
  datesBetween,
  formatDateLabel,
  formatDayMonth,
  generationWindowMonths,
  monthsCovering,
  parseDate,
  periodLabel,
  weekDates,
  weekStartStr,
} from './api'

// اختبارات دوال التاريخ النقية في وحدة الجدول — كانت بلا أي تغطية رغم أن
// formatDateLabel وحده مستورَد في ~10 ملفات (فجوة أغلقتها المراجعة 3A-314).
// المرجع الزمني: 2026-11-22 يوافق الأحد فعلاً (مطابق للتقويم).
describe('parseDate', () => {
  it('يفكّ التاريخ لمكوّناته المحلية بلا إزاحة منطقة زمنية', () => {
    const d = parseDate('2026-11-22')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 22])
    expect([d.getHours(), d.getMinutes()]).toEqual([0, 0])
  })
})

describe('weekStartStr — بداية الأسبوع (الأحد)', () => {
  it('الأحد نفسه يرجع كما هو', () => {
    expect(weekStartStr('2026-11-22')).toBe('2026-11-22')
  })
  it('الأربعاء والسبت يرجعان لأحد نفس الأسبوع', () => {
    expect(weekStartStr('2026-11-25')).toBe('2026-11-22')
    expect(weekStartStr('2026-11-28')).toBe('2026-11-22')
  })
  it('عبور نهاية الشهر: الثلاثاء 1 ديسمبر يرجع لأحد 29 نوفمبر', () => {
    expect(weekStartStr('2026-12-01')).toBe('2026-11-29')
  })
})

describe('weekDates', () => {
  it('سبعة أيام متتالية من بداية الأسبوع', () => {
    expect(weekDates('2026-11-22')).toEqual([
      '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25',
      '2026-11-26', '2026-11-27', '2026-11-28',
    ])
  })
})

describe('addMonthsStr — أول الشهر مزاحاً', () => {
  it('إزاحة موجبة وسالبة وعبر السنة، والناتج دائماً أول الشهر', () => {
    expect(addMonthsStr('2026-11-15', 1)).toBe('2026-12-01')
    expect(addMonthsStr('2026-11-15', -1)).toBe('2026-10-01')
    expect(addMonthsStr('2026-12-15', 1)).toBe('2027-01-01')
    expect(addMonthsStr('2026-01-31', 1)).toBe('2026-02-01')
  })
})

describe('monthsCovering', () => {
  it('يغطي كل الشهور بين الطرفين شاملاً', () => {
    expect(monthsCovering('2026-10-15', '2026-12-02')).toEqual([
      '2026-10-01', '2026-11-01', '2026-12-01',
    ])
  })
  it('نفس الشهر = عنصر واحد', () => {
    expect(monthsCovering('2026-11-03', '2026-11-20')).toEqual(['2026-11-01'])
  })
})

describe('datesBetween', () => {
  it('مدى عابر لنهاية الشهر شامل الطرفين', () => {
    expect(datesBetween('2026-11-29', '2026-12-02')).toEqual([
      '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02',
    ])
  })
  it('يوم واحد = عنصر واحد، ومدى معكوس = فارغ', () => {
    expect(datesBetween('2026-11-22', '2026-11-22')).toEqual(['2026-11-22'])
    expect(datesBetween('2026-11-22', '2026-11-21')).toEqual([])
  })
})

describe('formatDateLabel / formatDayMonth', () => {
  it('تسمية كاملة باسم اليوم والشهر من القاموس', () => {
    expect(formatDateLabel('2026-11-22')).toBe('الأحد 22 نوفمبر 2026')
  })
  it('تسمية مختصرة بيوم وشهر', () => {
    expect(formatDayMonth('2026-11-05')).toBe('5 نوفمبر')
  })
})

describe('periodLabel — التسمية الموحّدة (3A-314)', () => {
  it('بداية شهر → اسم الشهر والسنة', () => {
    expect(periodLabel('2026-11-01')).toBe('نوفمبر 2026')
    expect(periodLabel('2027-01-01')).toBe('يناير 2027')
  })
})

describe('generationWindowMonths', () => {
  it('الماضي + الحالي + القادم حول المرساة', () => {
    expect(generationWindowMonths('2026-11-22')).toEqual([
      '2026-10-01', '2026-11-01', '2026-12-01',
    ])
  })
  it('عبور السنة في ديسمبر', () => {
    expect(generationWindowMonths('2026-12-10')).toEqual([
      '2026-11-01', '2026-12-01', '2027-01-01',
    ])
  })
})
