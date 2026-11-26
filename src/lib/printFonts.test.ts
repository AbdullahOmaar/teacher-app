import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRINT_FONT,
  PRINT_FONT_FAMILY,
  PRINT_FONT_KEYS,
  isPrintFontKey,
  normalizePrintFont,
  printFontStyle,
} from './printFonts'

describe('printFonts — خطوط طباعة المستندات (مهمة 12 — ج16-1)', () => {
  it('القائمة المغلقة خمسة مفاتيح والافتراضي plex', () => {
    expect(PRINT_FONT_KEYS).toEqual(['plex', 'cairo', 'tajawal', 'almarai', 'amiri'])
    expect(DEFAULT_PRINT_FONT).toBe('plex')
  })

  it('isPrintFontKey يقبل القائمة ويرفض ما عداها', () => {
    for (const k of PRINT_FONT_KEYS) expect(isPrintFontKey(k)).toBe(true)
    expect(isPrintFontKey('arial')).toBe(false)
    expect(isPrintFontKey('CAIRO')).toBe(false)
    expect(isPrintFontKey(null)).toBe(false)
    expect(isPrintFontKey(undefined)).toBe(false)
    expect(isPrintFontKey(3)).toBe(false)
  })

  it('normalizePrintFont: صالح يمر، ومكسور/غائب = null (الافتراضي)', () => {
    expect(normalizePrintFont('amiri')).toBe('amiri')
    expect(normalizePrintFont('خط عربي')).toBe(null)
    expect(normalizePrintFont(null)).toBe(null)
    expect(normalizePrintFont(undefined)).toBe(null)
    expect(normalizePrintFont('')).toBe(null)
  })

  it('لكل مفتاح عائلة خط تنتهي بسقوط آمن', () => {
    for (const k of PRINT_FONT_KEYS) {
      expect(PRINT_FONT_FAMILY[k]).toContain('IBM Plex Sans Arabic')
    }
    expect(PRINT_FONT_FAMILY.amiri).toContain('"Amiri"')
  })

  it('printFontStyle: الافتراضي بلا ستايل (تصيير اليوم حرفياً)، وغيره بعائلته', () => {
    expect(printFontStyle(null)).toBeUndefined()
    expect(printFontStyle(undefined)).toBeUndefined()
    expect(printFontStyle('plex')).toBeUndefined()
    expect(printFontStyle('cairo')).toEqual({ fontFamily: PRINT_FONT_FAMILY.cairo })
    expect(printFontStyle('amiri')).toEqual({ fontFamily: PRINT_FONT_FAMILY.amiri })
  })
})
