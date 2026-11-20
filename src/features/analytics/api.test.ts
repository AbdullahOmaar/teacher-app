import { describe, expect, it } from 'vitest'
import { buildInsights, type AnalyticsMonth } from './api'

function month(monthStr: string, collected: number): AnalyticsMonth {
  return {
    month: monthStr,
    collected,
    attendanceRate: null,
    attended: 0,
    marked: 0,
    overdue: 0,
    newStudents: 0,
    cumulativeStudents: 0,
  }
}

const empty = { overdueByGroup: [], absenceByGroup: [], absenceByStudent: [] }

describe('buildInsights — أهم 3 رؤى (W5 — R-14)', () => {
  it('أعلى مجموعة متأخرات', () => {
    const ins = buildInsights({
      ...empty,
      months: [month('2026-11-01', 0)],
      overdueByGroup: [
        { name: 'أ', amount: 300 },
        { name: 'ب', amount: 900 },
        { name: 'ج', amount: 0 },
      ],
    })
    expect(ins.topOverdueGroup).toEqual({ name: 'ب', amount: 900 })
  })

  it('أكبر تغيّر تحصيل بين الشهور المكتملة فقط — الشهر الجاري مستبعد', () => {
    const ins = buildInsights({
      ...empty,
      months: [
        month('2026-08-01', 1000),
        month('2026-09-01', 1500), // +50%
        month('2026-10-01', 1200), // −20%
        month('2026-11-01', 100), // الشهر الجاري: هبوط حاد لكنه ناقص — يُستبعد
      ],
    })
    expect(ins.biggestCollectionChange).toEqual({
      fromMonth: '2026-08-01',
      toMonth: '2026-09-01',
      pct: 50,
      delta: 500,
    })
  })

  it('لا تغيّر محسوب من قاعدة صفرية', () => {
    const ins = buildInsights({
      ...empty,
      months: [month('2026-09-01', 0), month('2026-10-01', 500), month('2026-11-01', 700)],
    })
    expect(ins.biggestCollectionChange).toBeNull()
  })

  it('الأكثر غياباً مجموعة وطالباً', () => {
    const ins = buildInsights({
      ...empty,
      months: [month('2026-11-01', 0)],
      absenceByGroup: [
        { name: 'أ', absences: 4 },
        { name: 'ب', absences: 11 },
      ],
      absenceByStudent: [{ name: 'طالب س', absences: 6 }],
    })
    expect(ins.mostAbsentGroup).toEqual({ name: 'ب', absences: 11 })
    expect(ins.mostAbsentStudent).toEqual({ name: 'طالب س', absences: 6 })
  })

  it('بيانات فارغة: كل الرؤى null', () => {
    const ins = buildInsights({ ...empty, months: [] })
    expect(ins).toEqual({
      topOverdueGroup: null,
      biggestCollectionChange: null,
      mostAbsentGroup: null,
      mostAbsentStudent: null,
    })
  })
})
