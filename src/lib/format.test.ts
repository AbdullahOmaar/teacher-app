import { describe, expect, it } from 'vitest'
import {
  attendanceRatePct,
  daysLabel,
  formatClock12,
  formatDateTimeAr,
  formatMoney,
  formatTime12,
  safeExternalUrl,
  shortTime,
  timeToMin,
  waLink,
} from './format'

describe('attendanceRatePct — نسبة الحضور الموحّدة (PAT-4ب)', () => {
  it('عُشر واحد دائماً لنفس البسط/المقام', () => {
    expect(attendanceRatePct(7, 8)).toBe(87.5)
    expect(attendanceRatePct(1, 3)).toBe(33.3)
    expect(attendanceRatePct(2, 3)).toBe(66.7)
    expect(attendanceRatePct(200, 226)).toBe(88.5)
  })
  it('الطرفان: الكل ولا أحد', () => {
    expect(attendanceRatePct(10, 10)).toBe(100)
    expect(attendanceRatePct(0, 10)).toBe(0)
  })
  it('null عند غياب أي تعليم', () => {
    expect(attendanceRatePct(0, 0)).toBeNull()
  })
})

describe('formatMoney', () => {
  it('يفصّل الآلاف ويلحق «ج»', () => {
    expect(formatMoney(1200)).toBe('1,200\u00A0ج')
    expect(formatMoney(75)).toBe('75\u00A0ج')
  })
  it('يقبل نصاً رقمياً', () => {
    expect(formatMoney('250.5')).toBe('250.5\u00A0ج')
  })
  it('القيم الغائبة/الفاسدة = صفر', () => {
    expect(formatMoney(null)).toBe('0\u00A0ج')
    expect(formatMoney(undefined)).toBe('0\u00A0ج')
    expect(formatMoney('abc')).toBe('0\u00A0ج')
  })
  it('الفاصل قبل العملة مسافة غير قابلة للكسر — المبلغ وحدة واحدة (3A-324)', () => {
    // أي مسافة عادية هنا تعني أن المبلغ قد ينشطر على سطرين في العروض الضيقة
    expect(formatMoney(400)).not.toContain(' ج')
    expect(formatMoney(400)).toContain('400\u00A0ج')
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

describe('formatDateTimeAr — النسخة الموحّدة الوحيدة (COD-3)', () => {
  it('تاريخ صالح يُنسَّق عربياً متوسطاً مع الوقت', () => {
    const out = formatDateTimeAr('2026-11-22T15:30:00.000Z')
    expect(out).not.toBe('2026-11-22')
    expect(out.length).toBeGreaterThan(10)
  })
  it('قيمة غير صالحة (NaN) تسقط افتراضياً لأول 10 أحرف من النص كما هو', () => {
    // هذا هو سلوك كل المستدعين الحاليين (شيتا البوابتين + Cashbox +
    // WhatsAppSettingsCard) — لا مستدعي يمرّر fallback مختلفاً.
    expect(formatDateTimeAr('not-a-date-xx')).toBe('not-a-date')
    expect(formatDateTimeAr('2026-13-45')).toBe('2026-13-45')
  })
  it('fallback صريح يتقدم الافتراضي عند تمريره', () => {
    expect(formatDateTimeAr('xx', '—')).toBe('—')
  })
})
