import { describe, expect, it } from 'vitest'
import { fmtScore, passPctOf, pctOf, pctTone } from './api'

describe('نسب الدرجات', () => {
  it('pctOf يقرب للنسبة الصحيحة، وnull عند نهاية صفرية', () => {
    expect(pctOf(50, 100)).toBe(50)
    expect(pctOf(1, 3)).toBe(33)
    expect(pctOf(10, 0)).toBeNull()
    expect(pctOf(10, -5)).toBeNull()
  })
  it('passPctOf', () => {
    expect(passPctOf({ max_score: 100, pass_score: 60 })).toBe(60)
    expect(passPctOf({ max_score: 0, pass_score: 0 })).toBe(0)
  })
  it('pctTone: نجاح/تحذير/منخفض/بلا', () => {
    const a = { max_score: 100, pass_score: 60 }
    expect(pctTone(75, a)).toBe('ok')
    expect(pctTone(55, a)).toBe('warn')
    expect(pctTone(40, a)).toBe('bad')
    expect(pctTone(null, a)).toBe('none')
  })
  it('fmtScore بلا كسور زائدة', () => {
    expect(fmtScore(20)).toBe('20')
    expect(fmtScore(12.5)).toBe('12.5')
    expect(fmtScore(12.25)).toBe('12.25')
  })
})
