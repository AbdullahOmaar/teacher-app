import { describe, expect, it } from 'vitest'
import type { EnrollmentRow, GroupRow } from '../../types/database'
import { countByGroup, isMissingSlotsColumn, withSlotsFromLegacy } from './api'

const enrol = (group_id: string, student_id: string): EnrollmentRow =>
  ({
    id: `enr-${group_id}-${student_id}`,
    teacher_id: 't1',
    student_id,
    group_id,
    price_override: null,
    prepaid_sessions: null,
    created_at: '2026-11-01T00:00:00.000Z',
  }) as EnrollmentRow

describe('countByGroup — عدّاد طلاب كل مجموعة', () => {
  it('يعدّ كل مجموعة على حدة', () => {
    const counts = countByGroup([
      enrol('g1', 's1'),
      enrol('g1', 's2'),
      enrol('g2', 's3'),
    ])
    expect(counts.get('g1')).toBe(2)
    expect(counts.get('g2')).toBe(1)
    expect(counts.size).toBe(2)
  })

  it('مجموعة واحدة بطلاب كثيرين', () => {
    const counts = countByGroup([enrol('g1', 's1'), enrol('g1', 's2'), enrol('g1', 's3')])
    expect(counts.get('g1')).toBe(3)
    expect(counts.size).toBe(1)
  })

  it('قائمة فارغة = خريطة فارغة', () => {
    expect(countByGroup([]).size).toBe(0)
  })

  it('مجموعة بلا تسجيلات لا تظهر في الخريطة', () => {
    const counts = countByGroup([enrol('g1', 's1')])
    expect(counts.has('g2')).toBe(false)
  })
})

describe('isMissingSlotsColumn — كشف غياب عمود slots (0070)', () => {
  it('PGRST204 = عمود مفقود', () => {
    expect(isMissingSlotsColumn({ code: 'PGRST204', message: 'Could not find the slots column' })).toBe(true)
  })
  it('رسالة تذكر slots = عمود مفقود', () => {
    expect(isMissingSlotsColumn({ code: '23505', message: 'column "slots" does not exist' })).toBe(true)
  })
  it('خطأ آخر = ليس غياب عمود', () => {
    expect(isMissingSlotsColumn({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isMissingSlotsColumn(null)).toBe(false)
  })
})

describe('withSlotsFromLegacy — إكمال صف قديم بمواعيده المشتقة', () => {
  const legacyRow = {
    id: 'g1',
    teacher_id: 't1',
    name: 'مجموعة أ',
    days: [1, 3],
    start_time: '16:00',
    duration_minutes: 60,
  } as unknown as GroupRow

  it('يشتق المواعيد من المرايا عند غياب slots', () => {
    const out = withSlotsFromLegacy(legacyRow)
    expect(out.slots).toEqual([
      { day: 1, start_time: '16:00', duration_minutes: 60 },
      { day: 3, start_time: '16:00', duration_minutes: 60 },
    ])
  })

  it('يُبقي slots الصالحة كما هي', () => {
    const row = { ...legacyRow, slots: [{ day: 2, start_time: '10:30', duration_minutes: 45 }] } as unknown as GroupRow
    expect(withSlotsFromLegacy(row).slots).toEqual([
      { day: 2, start_time: '10:30', duration_minutes: 45 },
    ])
  })
})
