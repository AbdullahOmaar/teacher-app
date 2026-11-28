import { describe, expect, it } from 'vitest'
import {
  groupSlotsOf,
  parseGroupSlots,
  slotProblem,
  slotsFromLegacy,
  slotsOverlap,
  slotsToMirrors,
} from './slots'

const legacy = { days: [6, 1], start_time: '16:00:00', duration_minutes: 90 }

describe('slotsFromLegacy — اشتقاق المواعيد من الأعمدة القديمة', () => {
  it('موعد لكل يوم مرتب تصاعدياً وبوقت مقصوص لـ HH:MM', () => {
    expect(slotsFromLegacy(legacy)).toEqual([
      { day: 1, start_time: '16:00', duration_minutes: 90 },
      { day: 6, start_time: '16:00', duration_minutes: 90 },
    ])
  })

  it('بلا أيام = بلا مواعيد', () => {
    expect(slotsFromLegacy({ days: [], start_time: '10:00', duration_minutes: 60 })).toEqual([])
  })
})

describe('parseGroupSlots — تفسير jsonb الخام مع السقوط للقديم', () => {
  it('مواعيد صالحة تُقرأ كما هي (والوقت يُقصّ)', () => {
    const raw = [
      { day: 6, start_time: '12:00:00', duration_minutes: 60 },
      { day: 1, start_time: '16:30', duration_minutes: 45 },
    ]
    expect(parseGroupSlots(raw, legacy)).toEqual([
      { day: 6, start_time: '12:00', duration_minutes: 60 },
      { day: 1, start_time: '16:30', duration_minutes: 45 },
    ])
  })

  it('قيمة غائبة أو فارغة تسقط للاشتقاق القديم', () => {
    expect(parseGroupSlots(null, legacy)).toEqual(slotsFromLegacy(legacy))
    expect(parseGroupSlots([], legacy)).toEqual(slotsFromLegacy(legacy))
    expect(parseGroupSlots('x', legacy)).toEqual(slotsFromLegacy(legacy))
  })

  it('عناصر مشوّهة تُرمى؛ وإن لم يبقَ صالح سقطنا للقديم', () => {
    const mixed = [
      { day: 9, start_time: '12:00', duration_minutes: 60 },
      { day: 3, start_time: '09:00', duration_minutes: 60 },
      { day: 'x', start_time: '12:00', duration_minutes: 60 },
      null,
    ]
    expect(parseGroupSlots(mixed, legacy)).toEqual([
      { day: 3, start_time: '09:00', duration_minutes: 60 },
    ])
    expect(parseGroupSlots([{ day: 9 }], legacy)).toEqual(slotsFromLegacy(legacy))
  })
})

describe('groupSlotsOf — قراءة صف مجموعة', () => {
  it('يفضّل slots على المرايا', () => {
    const g = {
      slots: [{ day: 2, start_time: '18:00', duration_minutes: 60 }],
      days: [1, 6],
      start_time: '16:00',
      duration_minutes: 90,
    }
    expect(groupSlotsOf(g)).toEqual([{ day: 2, start_time: '18:00', duration_minutes: 60 }])
  })
})

describe('slotsToMirrors — المرايا القديمة المشتقة', () => {
  it('الأيام فريدة مرتبة والوقت/المدة من أول موعد (يوماً ثم وقتاً)', () => {
    const mirrors = slotsToMirrors([
      { day: 6, start_time: '12:00', duration_minutes: 60 },
      { day: 1, start_time: '16:00', duration_minutes: 90 },
      { day: 6, start_time: '18:00', duration_minutes: 30 },
    ])
    expect(mirrors.days).toEqual([1, 6])
    expect(mirrors.start_time).toBe('16:00')
    expect(mirrors.duration_minutes).toBe(90)
  })

  it('قائمة فارغة = بدائل آمنة بلا أيام', () => {
    const mirrors = slotsToMirrors([])
    expect(mirrors.days).toEqual([])
    expect(mirrors.start_time).toBe('15:00')
  })
})

describe('slotProblem — تحقق المواعيد قبل الحفظ', () => {
  it('سليمة = null', () => {
    expect(slotProblem([{ day: 0, start_time: '10:00', duration_minutes: 30 }])).toBeNull()
  })
  it('فارغة = empty', () => {
    expect(slotProblem([])).toBe('empty')
  })
  it('وقت غائب = time', () => {
    expect(slotProblem([{ day: 0, start_time: '', duration_minutes: 60 }])).toBe('time')
  })
  it('مدة أقل من 30 أو كسرية = duration', () => {
    expect(slotProblem([{ day: 0, start_time: '10:00', duration_minutes: 15 }])).toBe('duration')
    expect(slotProblem([{ day: 0, start_time: '10:00', duration_minutes: 45.5 }])).toBe('duration')
  })
})

describe('slotsOverlap — تداخل موعدين', () => {
  const sat = { day: 6, start_time: '12:00', duration_minutes: 60 }
  it('نفس اليوم وفترات متقاطعة = تداخل', () => {
    expect(slotsOverlap(sat, { day: 6, start_time: '12:30', duration_minutes: 60 })).toBe(true)
  })
  it('نفس اليوم بلا تقاطع = لا تداخل (ملامسة الطرف لا تتداخل)', () => {
    expect(slotsOverlap(sat, { day: 6, start_time: '13:00', duration_minutes: 60 })).toBe(false)
    expect(slotsOverlap(sat, { day: 6, start_time: '10:00', duration_minutes: 60 })).toBe(false)
  })
  it('أيام مختلفة = لا تداخل مهما تقاطعت الأوقات', () => {
    expect(slotsOverlap(sat, { day: 1, start_time: '12:00', duration_minutes: 60 })).toBe(false)
  })
})
