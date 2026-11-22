import { describe, expect, it } from 'vitest'
import { EG_MOBILE_RE, normalizeEgPhone } from './api'

describe('normalizeEgPhone — توحيد صيغة الموبايل المصري (بلا تحقق)', () => {
  it('يحذف المسافات والشرطات من رقم صالح', () => {
    expect(normalizeEgPhone('0100 123 4567')).toBe('01001234567')
    expect(normalizeEgPhone('0100-123-4567')).toBe('01001234567')
    expect(normalizeEgPhone(' 01012345678 ')).toBe('01012345678')
    expect(normalizeEgPhone('01 00-123 4567')).toBe('01001234567')
  })

  it('رقم نظيف أصلاً يمر كما هو', () => {
    expect(normalizeEgPhone('01001234567')).toBe('01001234567')
    expect(normalizeEgPhone('01512345678')).toBe('01512345678')
  })

  it('فارغ = فارغ', () => {
    expect(normalizeEgPhone('')).toBe('')
    expect(normalizeEgPhone('   ')).toBe('')
  })

  it('تطبيع فقط لا تحقق: مدخلات غير صالحة تُرجَع بعد حذف الفواصل كما هي', () => {
    // أرقام قصيرة/حروف/أرضي — الدالة لا ترفضها؛ التحقق الخادمي (0019)
    // وEG_MOBILE_RE في النموذج هما الحاكمان، لا هذه الدالة
    expect(normalizeEgPhone('0100')).toBe('0100')
    expect(normalizeEgPhone('abc')).toBe('abc')
    expect(normalizeEgPhone('02 1234 5678')).toBe('0212345678')
  })

  it('المُطبَّع من رقم مصري صالح يطابق EG_MOBILE_RE', () => {
    expect(EG_MOBILE_RE.test(normalizeEgPhone('0100 123 4567'))).toBe(true)
    expect(EG_MOBILE_RE.test(normalizeEgPhone('011-1234-5678'))).toBe(true)
    expect(EG_MOBILE_RE.test(normalizeEgPhone('02 1234 5678'))).toBe(false)
  })
})
