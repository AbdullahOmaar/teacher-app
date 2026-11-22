import { describe, expect, it } from 'vitest'
import { fmtScore, passPctOf, pctOf, pctTone, scoreWaUrl } from './api'
import type { RosterStudent } from '../attendance/api'

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

describe('scoreWaUrl — رابط درجة واتساب (PAT-4أ)', () => {
  const student: RosterStudent = {
    id: 's1',
    name: 'أحمد سمير',
    public_code: 'ST-1',
    phone: '01001234567',
    guardian_name: 'محمد سمير',
    guardian_phone: '01112223334',
  }
  const assessment = { title: 'اختبار نوفمبر', max_score: 20 }
  const textOf = (url: string | null): string =>
    decodeURIComponent((url ?? '').split('?text=')[1] ?? '')

  it('النص الحرفي §5.6: الدرجة والنهائية والنسبة', () => {
    const url = scoreWaUrl(student, undefined, assessment, 15)
    expect(url?.startsWith('https://wa.me/201112223334?text=')).toBe(true)
    expect(textOf(url)).toBe('أهلاً محمد سمير، درجة أحمد سمير في اختبار نوفمبر هي 15 من 20 (75%).')
  })
  it('درجة كسرية تُنسّق بلا أصفار زائدة ونسبتها مقربة', () => {
    expect(textOf(scoreWaUrl(student, undefined, assessment, 12.5))).toBe(
      'أهلاً محمد سمير، درجة أحمد سمير في اختبار نوفمبر هي 12.5 من 20 (63%).',
    )
  })
  it('رقم جهة الاتصال المرتبطة يتقدّم', () => {
    const url = scoreWaUrl(student, { name: 'فاطمة علي', phone: '01099998888' }, assessment, 20)
    expect(url?.startsWith('https://wa.me/201099998888?text=')).toBe(true)
    expect(textOf(url)).toContain('أهلاً فاطمة علي،')
    expect(textOf(url)).toContain('(100%)')
  })
  it('null عند غياب أي رقم صالح', () => {
    const noPhones: RosterStudent = { ...student, guardian_phone: null, phone: null }
    expect(scoreWaUrl(noPhones, undefined, assessment, 15)).toBeNull()
  })
})
