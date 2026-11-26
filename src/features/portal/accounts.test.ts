import { describe, expect, it } from 'vitest'
import {
  accessSettingsFromRow,
  accessSettingsToColumns,
  normalizePhoneDigits,
  normalizeStudentCode,
  portalPasswordProblem,
  resolveClaimOutcome,
} from './accounts'

// اختبارات وحدة حسابات البوابات (3A-385) — الدوال النقية فقط؛ مسارات
// الـ RPC والجلسات تُغطّى باختبارات التفويض الحية والدخان اليدوي.

describe('normalizePhoneDigits (مرآة portal_norm_phone في 0041)', () => {
  it('الصيغة المحلية تبقى كما هي', () => {
    expect(normalizePhoneDigits('01134309805')).toBe('01134309805')
  })
  it('البادئة الدولية 20 مع 12 رقماً ترجع للمحلية', () => {
    expect(normalizePhoneDigits('+201134309805')).toBe('01134309805')
    expect(normalizePhoneDigits('201134309805')).toBe('01134309805')
  })
  it('البادئة 0020 ترجع للمحلية', () => {
    expect(normalizePhoneDigits('00201134309805')).toBe('01134309805')
  })
  it('المسافات والشرطات تُزال', () => {
    expect(normalizePhoneDigits('0113 430-9805')).toBe('01134309805')
  })
  it('أرقام قصيرة/غريبة تمر كما هي بعد التنظيف (الخادم يحسم)', () => {
    expect(normalizePhoneDigits('123')).toBe('123')
    expect(normalizePhoneDigits('')).toBe('')
  })
})

describe('normalizeStudentCode', () => {
  it('أحرف كبيرة وقصّ للمسافات', () => {
    expect(normalizeStudentCode(' fqssg6p7 ')).toBe('FQSSG6P7')
    expect(normalizeStudentCode('FQSSG6P7')).toBe('FQSSG6P7')
  })
})

describe('portalPasswordProblem (حدود 0041: 6..72)', () => {
  it('أقصر من 6 = too-short', () => {
    expect(portalPasswordProblem('')).toBe('too-short')
    expect(portalPasswordProblem('12345')).toBe('too-short')
  })
  it('أطول من 72 = too-long', () => {
    expect(portalPasswordProblem('x'.repeat(73))).toBe('too-long')
  })
  it('داخل الحدود = null', () => {
    expect(portalPasswordProblem('123456')).toBeNull()
    expect(portalPasswordProblem('x'.repeat(72))).toBeNull()
  })
})

describe('accessSettingsFromRow / accessSettingsToColumns', () => {
  it('غياب الصف = الافتراضي الآمن: 30 يوماً وكل الأقسام ظاهرة', () => {
    const s = accessSettingsFromRow(null)
    expect(s.ttlDays).toBe(30)
    expect(Object.values(s.guardian).every(Boolean)).toBe(true)
    expect(Object.values(s.student).every(Boolean)).toBe(true)
  })
  it('false الصريحة وحدها تُخفي قسمها', () => {
    const s = accessSettingsFromRow({
      portal_link_ttl_days: 90,
      portal_guardian_show_money: false,
      portal_student_show_grades: false,
    })
    expect(s.ttlDays).toBe(90)
    expect(s.guardian.money).toBe(false)
    expect(s.guardian.attendance).toBe(true)
    expect(s.student.grades).toBe(false)
    expect(s.student.money).toBe(true)
  })
  it('ذهاب وإياب يحفظ القيم (مع ضبط المدة)', () => {
    const s = accessSettingsFromRow({
      portal_link_ttl_days: 1000,
      portal_guardian_show_notes: false,
      portal_student_show_schedule: false,
    })
    const cols = accessSettingsToColumns(s)
    expect(cols.portal_link_ttl_days).toBe(365)
    expect(cols.portal_guardian_show_notes).toBe(false)
    expect(cols.portal_student_show_schedule).toBe(false)
    expect(cols.portal_guardian_show_money).toBe(true)
  })
})

describe('resolveClaimOutcome (شكلا الـ claim: 0056 بجلسة / 0044 بلا جلسة)', () => {
  it('إجابة 0056 الكاملة ← جلسة', () => {
    expect(
      resolveClaimOutcome({
        session_token: 'tok-123',
        account_id: 'acc-1',
        username: '01134309805',
        role: 'guardian',
        teacher_id: 't1',
        student_id: null,
        students: [],
      }),
    ).toEqual({
      kind: 'session',
      username: '01134309805',
      sessionToken: 'tok-123',
      accountId: 'acc-1',
    })
  })
  it('إجابة 0044 القديمة ({username} فقط) ← legacy بلا جلسة', () => {
    expect(resolveClaimOutcome({ username: '01134309805' })).toEqual({
      kind: 'legacy',
      username: '01134309805',
    })
  })
  it('توكن فارغ أو غائب ← legacy (لا جلسة ناقصة)', () => {
    expect(resolveClaimOutcome({ username: 'FQSSG6P7', session_token: '' })).toEqual({
      kind: 'legacy',
      username: 'FQSSG6P7',
    })
    expect(resolveClaimOutcome({ username: 'FQSSG6P7', session_token: null })).toEqual({
      kind: 'legacy',
      username: 'FQSSG6P7',
    })
    expect(resolveClaimOutcome(null)).toEqual({ kind: 'legacy', username: '' })
  })
})
