import { describe, expect, it } from 'vitest'
import {
  buildCentreLink,
  buildEnrolLink,
  EG_MOBILE_RE,
  isValidEgMobile,
  normalizeEgPhone,
} from './api'

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

describe('isValidEgMobile — تحقق حقل الموبايل (ملاحظة مالك 2026-11-28)', () => {
  it('أرقام مصرية سليمة تمر — نظيفة أو بفواصل', () => {
    expect(isValidEgMobile('01001234567')).toBe(true)
    expect(isValidEgMobile('01112345678')).toBe(true)
    expect(isValidEgMobile('01212345678')).toBe(true)
    expect(isValidEgMobile('01512345678')).toBe(true)
    expect(isValidEgMobile('0100 123 4567')).toBe(true)
    expect(isValidEgMobile('0100-123-4567')).toBe(true)
  })

  it('رقم غير مكتمل يُرفض (حالة المالك: الرقم مش كامل)', () => {
    expect(isValidEgMobile('0100')).toBe(false)
    expect(isValidEgMobile('0100123456')).toBe(false) // 10 أرقام
    expect(isValidEgMobile('')).toBe(false)
    expect(isValidEgMobile('   ')).toBe(false)
  })

  it('بادئة خاطئة أو رقم أرضي أو طول زائد يُرفض', () => {
    expect(isValidEgMobile('01312345678')).toBe(false)
    expect(isValidEgMobile('02 1234 5678')).toBe(false)
    expect(isValidEgMobile('010012345678')).toBe(false) // 12 رقماً
    expect(isValidEgMobile('0100abc4567')).toBe(false)
  })
})

describe('buildEnrolLink / buildCentreLink (مهمة 12 — ج10-4)', () => {
  it('يبني رابط الحجز بترميز الرمز', () => {
    expect(buildEnrolLink('https://app.example', 'tok en/1')).toBe(
      'https://app.example/book?t=tok%20en%2F1',
    )
  })

  it('يشتق رابط صفحة السنتر من رابط الحجز بنفس الرمز', () => {
    expect(buildCentreLink('https://app.example/book?t=abc123')).toBe(
      'https://app.example/centre?t=abc123',
    )
  })

  it('يحافظ على بقية الاستعلام كما هو', () => {
    expect(buildCentreLink('https://app.example/book?t=x&utm=fb')).toBe(
      'https://app.example/centre?t=x&utm=fb',
    )
  })

  it('يرفض رابطاً ليس رابط حجز', () => {
    expect(buildCentreLink('https://app.example/portal?t=abc')).toBeNull()
    expect(buildCentreLink('https://app.example/bookish?t=abc')).toBeNull()
  })

  it('يرفض نصاً ليس رابطاً', () => {
    expect(buildCentreLink('مش رابط')).toBeNull()
    expect(buildCentreLink('')).toBeNull()
  })
})
