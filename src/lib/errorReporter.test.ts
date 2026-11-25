import { describe, expect, it } from 'vitest'
import {
  createDedupeGate,
  errorMessageOf,
  errorStackOf,
  sanitizeErrorText,
} from './errorReporter'

// اختبارات تجريد الحمولة وبوابة التكرار — مهمة 11 (فجوة 21):
// لا بريد ولا روابط ولا شبيهات توكنات تصل للسجل أبداً.
describe('تجريد نص الخطأ', () => {
  it('يحذف رسائل البريد', () => {
    expect(sanitizeErrorText('فشل الدخول لـ demo@teacher-app.com الآن', 2000)).toBe(
      'فشل الدخول لـ [email] الآن',
    )
  })
  it('يحذف الروابط كاملة (بما فيها معطيات البحث)', () => {
    expect(
      sanitizeErrorText('طلب https://x.supabase.co/rest/v1/t?apikey=secret فشل', 2000),
    ).toBe('طلب [url] فشل')
  })
  it('يحذف السلاسل الطويلة الشبيهة بالتوكنات', () => {
    expect(sanitizeErrorText('توكن abcdefghijklmnopqrstuvwxyz0123456789 منتهٍ', 2000)).toBe(
      'توكن [token] منتهٍ',
    )
  })
  it('يبقي النص العربي والرسائل القصيرة كما هي', () => {
    expect(sanitizeErrorText('خطأ في تحميل قائمة الطلاب', 2000)).toBe('خطأ في تحميل قائمة الطلاب')
    expect(sanitizeErrorText('Failed to fetch', 2000)).toBe('Failed to fetch')
  })
  it('يقصّ الطول عند الحد', () => {
    expect(sanitizeErrorText('كلمة '.repeat(30), 10)).toHaveLength(10)
  })
})

describe('رسالة الخطأ من أي قيمة', () => {
  it('من Error يأخذ رسالته', () => {
    expect(errorMessageOf(new Error('انكسر التصيير'))).toBe('انكسر التصيير')
  })
  it('من نص يرجعه كما هو', () => {
    expect(errorMessageOf('رسالة خام')).toBe('رسالة خام')
  })
  it('من كائنات/قيم أخرى: وصف عام بلا تسريب محتوى الكائن', () => {
    expect(errorMessageOf({ secret: 'x' })).toBe('unknown error')
    expect(errorMessageOf(null)).toBe('unknown error')
    expect(errorMessageOf(undefined)).toBe('unknown error')
  })
})

describe('أثر المكدّس', () => {
  it('null بلا خطأ Error وبلا أثر مكوّنات', () => {
    expect(errorStackOf('نص فقط')).toBeNull()
    expect(errorStackOf(null)).toBeNull()
  })
  it('يجمع أثر الخطأ وأثر المكوّنات مُجرّدَين', () => {
    const err = new Error('رسالة')
    err.stack = 'Error: رسالة\n    at صفحة (chunk.js:1:1)'
    const out = errorStackOf(err, '\n    in Page')
    expect(out).toContain('Error: رسالة')
    expect(out).toContain('in Page')
  })
})

describe('بوابة منع التكرار والإغراق', () => {
  it('أول بلاغ يمر، وتكراره داخل النافذة يُحجب', () => {
    const gate = createDedupeGate(30_000, 50)
    expect(gate('render:رسالة', 1_000)).toBe(true)
    expect(gate('render:رسالة', 2_000)).toBe(false)
    expect(gate('render:رسالة', 31_000)).toBe(true)
  })
  it('رسالة مختلفة تمر داخل النافذة نفسها', () => {
    const gate = createDedupeGate(30_000, 50)
    expect(gate('render:أ', 1_000)).toBe(true)
    expect(gate('render:ب', 1_500)).toBe(true)
  })
  it('حد الجلسة الأقصى يوقف كل شيء بعده', () => {
    const gate = createDedupeGate(0, 2)
    expect(gate('a', 1)).toBe(true)
    expect(gate('b', 2)).toBe(true)
    expect(gate('c', 3)).toBe(false)
  })
})
