import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadCelebratedMilestones,
  pickStarCelebration,
  reachedMilestones,
  saveCelebratedMilestones,
  starCheerStorageKey,
} from './starCheer'

describe('reachedMilestones — اشتقاق المحطات من البيانات', () => {
  it('تحت أول عتبة: لا محطات', () => {
    expect(reachedMilestones({ students: 9, sessions: 9 })).toEqual([])
  })
  it('عند العتبة تماماً تُحتسب المحطة', () => {
    const reached = reachedMilestones({ students: 10, sessions: 10 })
    expect(reached.map((m) => m.id)).toEqual(['students-10', 'sessions-10'])
  })
  it('التراكمية: ٢٥ طالباً تعني محطتي ١٠ و٢٥ معاً', () => {
    const reached = reachedMilestones({ students: 25, sessions: 0 })
    expect(reached.map((m) => m.id)).toEqual(['students-10', 'students-25'])
  })
  it('نوع بلا بيانات (null) لا يُقيَّم ولا يُنتج محطات', () => {
    expect(reachedMilestones({ students: null, sessions: null })).toEqual([])
    expect(reachedMilestones({ students: 60, sessions: null }).map((m) => m.id)).toEqual([
      'students-10',
      'students-25',
      'students-50',
    ])
  })
})

describe('pickStarCelebration — اختيار الأعلى غير المحتفَل به', () => {
  it('لا محطات محققة = لا احتفال', () => {
    expect(pickStarCelebration([], new Set())).toBeNull()
  })
  it('كل المحقق محتفَل به = لا احتفال', () => {
    const reached = reachedMilestones({ students: 30, sessions: 40 })
    expect(pickStarCelebration(reached, new Set(reached.map((m) => m.id)))).toBeNull()
  })
  it('يختار الأعلى عتبة بين غير المحتفَل بهم', () => {
    const reached = reachedMilestones({ students: 30, sessions: 12 })
    expect(pickStarCelebration(reached, new Set(['students-10']))?.id).toBe('students-25')
  })
  it('عند تعادل العتبة يقدّم محطة الطلاب على الحصص', () => {
    const reached = reachedMilestones({ students: 10, sessions: 10 })
    expect(pickStarCelebration(reached, new Set())?.id).toBe('students-10')
  })
})

describe('تخزين المحتفَل به — مفتاح مدرس+مجموعة', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  it('المفتاح يحمل المدرس والمجموعة', () => {
    expect(starCheerStorageKey('t1', 'g1')).toBe('teacher-app-star-cheer:t1:g1')
  })
  it('حفظ ثم تحميل يعيد نفس المجموعة، ومجموعة أخرى فارغة', () => {
    saveCelebratedMilestones('t1', 'g1', new Set(['students-10', 'sessions-10']))
    expect(loadCelebratedMilestones('t1', 'g1')).toEqual(new Set(['students-10', 'sessions-10']))
    expect(loadCelebratedMilestones('t1', 'g2')).toEqual(new Set())
    expect(loadCelebratedMilestones('t2', 'g1')).toEqual(new Set())
  })
  it('قيمة فاسدة في التخزين تسقط لمجموعة فارغة بلا كسر', () => {
    localStorage.setItem(starCheerStorageKey('t1', 'g1'), '{broken json')
    expect(loadCelebratedMilestones('t1', 'g1')).toEqual(new Set())
    localStorage.setItem(starCheerStorageKey('t1', 'g1'), '{"not":"array"}')
    expect(loadCelebratedMilestones('t1', 'g1')).toEqual(new Set())
  })
})
