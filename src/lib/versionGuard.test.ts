import { describe, expect, it } from 'vitest'
import { decideVersionAction, versionPairKey } from './versionGuard'

/**
 * حارس النسخة (3A-903): القرار النقي — إعادة تحميل شافية مرة واحدة
 * لكل زوج نسخ، ولا إجراء في أي حالة أخرى (لا ختم بعيد، نفس البناء،
 * أو سبق إعادة التحميل) حتى لا توجد حلقة تحميل أبداً.
 */

describe('decideVersionAction', () => {
  it('نفس البناء محلياً وبعيداً → لا إجراء', () => {
    expect(decideVersionAction('2026-11-26T10:00:00Z', '2026-11-26T10:00:00Z', false)).toBe('none')
  })
  it('بناء بعيد مختلف ولم نعد التحميل بعد → إعادة تحميل', () => {
    expect(decideVersionAction('2026-11-20T10:00:00Z', '2026-11-26T10:00:00Z', false)).toBe(
      'reload',
    )
  })
  it('بناء مختلف لكن أعدنا التحميل لهذا الزوج → لا إجراء (منع الحلقة)', () => {
    expect(decideVersionAction('2026-11-20T10:00:00Z', '2026-11-26T10:00:00Z', true)).toBe('none')
  })
  it('لا ختم بعيد (فشل الجلب أو خادم بلا version.json) → لا إجراء', () => {
    expect(decideVersionAction('2026-11-20T10:00:00Z', null, false)).toBe('none')
    expect(decideVersionAction('2026-11-20T10:00:00Z', undefined, false)).toBe('none')
    expect(decideVersionAction('2026-11-20T10:00:00Z', '', false)).toBe('none')
  })
  it('لا ختم محلي → لا إجراء', () => {
    expect(decideVersionAction('', '2026-11-26T10:00:00Z', false)).toBe('none')
  })
})

describe('versionPairKey', () => {
  it('ثابت لنفس الزوج ويختلف باختلاف أي طرف', () => {
    expect(versionPairKey('a', 'b')).toBe(versionPairKey('a', 'b'))
    expect(versionPairKey('a', 'b')).not.toBe(versionPairKey('a', 'c'))
    expect(versionPairKey('a', 'b')).not.toBe(versionPairKey('c', 'b'))
  })
})
