import { describe, expect, it } from 'vitest'
import { shortAccountCode } from './shortCode'

describe('shortAccountCode — كود العرض القصير لمعرّف الحساب', () => {
  it('يشتق ثلاث مجموعات من أول 12 رقماً سداسياً بأحرف كبيرة', () => {
    expect(shortAccountCode('a8cfc920-dd1d-4191-8ac0-fec303b0d5bd')).toBe(
      'A8CF-C920-DD1D',
    )
  })

  it('حتمي: نفس المعرّف يدي نفس الكود، ومعرّفات مختلفة في الرأس تدي أكواداً مختلفة', () => {
    const a = '11111111-2222-4333-8444-555555555555'
    const b = '11111111-2222-4333-8444-666666666666'
    const c = '99991111-2222-4333-8444-555555555555'
    expect(shortAccountCode(a)).toBe(shortAccountCode(a))
    // الذيل المختلف لا يغيّر الكود (الاشتقاق من الرأس فقط — بصمة عرض)
    expect(shortAccountCode(a)).toBe(shortAccountCode(b))
    expect(shortAccountCode(a)).not.toBe(shortAccountCode(c))
  })

  it('يتجاهل الشرطات وأي فواصل ويقبل الأحرف الكبيرة أصلاً', () => {
    expect(shortAccountCode('A8CFC920DD1D41918AC0')).toBe('A8CF-C920-DD1D')
  })

  it('مدخل أقصر من اللازم أو غير سداسي يرجع كما هو بلا كسر', () => {
    expect(shortAccountCode('abc')).toBe('abc')
    expect(shortAccountCode('')).toBe('')
  })
})
