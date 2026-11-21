import { describe, expect, it } from 'vitest'
import { isValidEgyptianMobile, normalizeEgyptianPhone } from './phone'

// تطبيع أرقام الموبايل المصرية (P5-3): كل الصيغ الشائعة لصيغة E.164
// واحدة، وأي رقم خارج بادئات الموبايل المصرية يُرفض قبل أي طلب OTP.
describe('normalizeEgyptianPhone', () => {
  it('يقبل الصيغة المحلية 01xxxxxxxxx', () => {
    expect(normalizeEgyptianPhone('01012345678')).toBe('+201012345678')
    expect(normalizeEgyptianPhone('01112345678')).toBe('+201112345678')
    expect(normalizeEgyptianPhone('01212345678')).toBe('+201212345678')
    expect(normalizeEgyptianPhone('01512345678')).toBe('+201512345678')
  })

  it('يقبل الصيغ الدولية +20 و0020 و20', () => {
    expect(normalizeEgyptianPhone('+201012345678')).toBe('+201012345678')
    expect(normalizeEgyptianPhone('00201012345678')).toBe('+201012345678')
    expect(normalizeEgyptianPhone('201012345678')).toBe('+201012345678')
  })

  it('يقبل الجزء الوطني وحده ويتجاهل المسافات والشرطات', () => {
    expect(normalizeEgyptianPhone('1012345678')).toBe('+201012345678')
    expect(normalizeEgyptianPhone('010 1234 5678')).toBe('+201012345678')
    expect(normalizeEgyptianPhone('+20 101-234-5678')).toBe('+201012345678')
  })

  it('يرفض البادئات غير الموبايلية والأطوال الخاطئة', () => {
    expect(normalizeEgyptianPhone('01312345678')).toBeNull() // ليست بادئة موبايل
    expect(normalizeEgyptianPhone('01812345678')).toBeNull()
    expect(normalizeEgyptianPhone('0101234567')).toBeNull() // ناقص رقم
    expect(normalizeEgyptianPhone('010123456789')).toBeNull() // زائد رقم
    expect(normalizeEgyptianPhone('0223456789')).toBeNull() // خط أرضي قاهري
  })

  it('يرفض الأرقام الأجنبية والفراغ والحروف', () => {
    expect(normalizeEgyptianPhone('+441234567890')).toBeNull()
    expect(normalizeEgyptianPhone('')).toBeNull()
    expect(normalizeEgyptianPhone('010abcd5678')).toBeNull()
  })

  it('isValidEgyptianMobile يطابق التطبيع', () => {
    expect(isValidEgyptianMobile('01012345678')).toBe(true)
    expect(isValidEgyptianMobile('01312345678')).toBe(false)
  })
})
