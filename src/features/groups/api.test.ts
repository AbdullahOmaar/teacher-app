import { describe, expect, it } from 'vitest'
import type { EnrollmentRow } from '../../types/database'
import { countByGroup } from './api'

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
