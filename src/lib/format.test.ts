import { describe, expect, it } from 'vitest'
import {
  daysLabel,
  formatClock12,
  formatMoney,
  formatTime12,
  safeExternalUrl,
  shortTime,
  timeToMin,
  waLink,
} from './format'

describe('formatMoney', () => {
  it('يفصّل الآلاف ويلحق «ج»', () => {
    expect(formatMoney(1200)).toBe('1,200 ج')
    expect(formatMoney(75)).toBe('75 ج')
  })
  it('يقبل نصاً رقمياً', () => {
    expect(formatMoney('250.5')).toBe('250.5 ج')
  })
  it('القيم الغائبة/الفاسدة = صفر', () => {
    expect(formatMoney(null)).toBe('0 ج')
    expect(formatMoney(undefined)).toBe('0 ج')
    expect(formatMoney('abc')).toBe('0 ج')
  })
})

describe('أوقات 12 ساعة', () => {
  it('shortTime يقصّ الثواني', () => {
    expect(shortTime('16:00:30')).toBe('16:00')
  })
  it('formatTime12 يحوّل مساءً وصباحاً ومنتصف الليل/النهار', () => {
    expect(formatTime12('16:00')).toBe('4:00 م')
    expect(formatTime12('09:30')).toBe('9:30 ص')
    expect(formatTime12('00:15')).toBe('12:15 ص')
    expect(formatTime12('12:00')).toBe('12:00 م')
    expect(formatTime12('13:05')).toBe('1:05 م')
  })
  it('formatClock12 من كائن Date', () => {
    expect(formatClock12(new Date(2026, 10, 20, 18, 5))).toBe('6:05 م')
    expect(formatClock12(new Date(2026, 10, 20, 0, 0))).toBe('12:00 ص')
  })
  it('timeToMin', () => {
    expect(timeToMin('01:30')).toBe(90)
    expect(timeToMin('00:00')).toBe(0)
  })
})

describe('daysLabel', () => {
  it('يرتّب الأيام ويصلها بفاصلة عربية', () => {
    expect(daysLabel([5, 1])).toBe('الاثنين، الجمعة')
    expect(daysLabel([0])).toBe('الأحد')
  })
  it('الفارغ = شرطة', () => {
    expect(daysLabel([])).toBe('—')
  })
})

describe('safeExternalUrl (مراجعة أمان C-01)', () => {
  it('يقبل http/https فقط', () => {
    expect(safeExternalUrl('https://example.com/x')).toBe('https://example.com/x')
    expect(safeExternalUrl('http://example.com')).toBe('http://example.com')
  })
  it('يرفض schemes خطرة ونصوصاً غير صالحة', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('data:text/html;base64,xx')).toBeNull()
    expect(safeExternalUrl('  ')).toBeNull()
    expect(safeExternalUrl('not a url')).toBeNull()
  })
})

describe('waLink', () => {
  it('يحوّل الرقم المصري المحلي لصيغة دولية', () => {
    expect(waLink('01012345678')).toBe('https://wa.me/201012345678')
  })
  it('يبقي الدولي كما هو ويتجاهل الرموز', () => {
    expect(waLink('+20 101 234 5678')).toBe('https://wa.me/201012345678')
    expect(waLink('00201012345678')).toBe('https://wa.me/201012345678')
  })
  it('غياب الرقم = null', () => {
    expect(waLink(null)).toBeNull()
    expect(waLink('')).toBeNull()
    expect(waLink('لا أرقام')).toBeNull()
  })
})
