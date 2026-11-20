import { describe, expect, it } from 'vitest'
import { prepaidLeft } from './api'

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
