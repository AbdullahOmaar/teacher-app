import { describe, expect, it } from 'vitest'
import { prepaidLeft, prepaidZone } from './api'

describe('prepaidLeft — باقي الباقة (§5.7)', () => {
  it('المدفوع مسبقاً ناقص الحضور الفعلي', () => {
    expect(prepaidLeft(8, 5)).toBe(3)
    expect(prepaidLeft(8, 8)).toBe(0)
  })
  it('لا ينزل تحت الصفر أبداً', () => {
    expect(prepaidLeft(4, 9)).toBe(0)
    expect(prepaidLeft(0, 0)).toBe(0)
  })
})

describe('prepaidZone — تصنيف عرض الباقة (W4 — R-7)', () => {
  it('النفاد تنبيه فردي عاجل', () => {
    expect(prepaidZone(0, 8)).toBe('urgent')
    expect(prepaidZone(0, 0)).toBe('urgent')
  })
  it('باقٍ ≥ 1 ونسبته ≤ 25% يدخل منطقة المتابعة المجمّعة', () => {
    expect(prepaidZone(1, 4)).toBe('follow') // 25% بالضبط
    expect(prepaidZone(2, 8)).toBe('follow') // 25%
    expect(prepaidZone(1, 8)).toBe('follow') // 12.5%
  })
  it('فوق 25% لا تنبيه', () => {
    expect(prepaidZone(1, 3)).toBeNull() // 33%
    expect(prepaidZone(3, 8)).toBeNull() // 37.5%
    expect(prepaidZone(5, 8)).toBeNull()
  })
  it('باقة بحجم صفري لا تُقسّم عليها', () => {
    expect(prepaidZone(1, 0)).toBeNull()
  })
})
