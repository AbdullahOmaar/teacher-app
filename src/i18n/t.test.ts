import { describe, expect, it } from 'vitest'
import { t } from './t'
import { pluralCategory } from './format'

describe('t — قاموس i18n المنزلي (W7 — R-4/R-5)', () => {
  it('مفتاح بسيط يطابق النص القائم حرفياً', () => {
    expect(t('common.retry')).toBe('إعادة المحاولة')
    expect(t('common.loading')).toBe('بنحمّل…')
    expect(t('shell.title.money')).toBe('المصروفات والأرباح')
    expect(t('shell.nav.invoices')).toBe('الفواتير')
  })
  it('استيفاء {name} من الوسائط', () => {
    expect(t('common.resultsCount', { count: 0 })).toBe('0 نتيجة')
  })
  it('صيغ جمع CLDR لعدّاد النتائج (PAT-7)', () => {
    expect(t('common.resultsCount', { count: 1 })).toBe('نتيجة واحدة')
    expect(t('common.resultsCount', { count: 2 })).toBe('نتيجتان')
    expect(t('common.resultsCount', { count: 7 })).toBe('7 نتائج')
    expect(t('common.resultsCount', { count: 50 })).toBe('50 نتيجة')
    expect(t('common.resultsCount', { count: 100 })).toBe('100 نتيجة')
  })
  it('وسيط مفقود يبقى ظاهراً بدل فراغ صامت', () => {
    expect(t('common.resultsCount')).toBe('{count} نتيجة')
  })
})

describe('pluralCategory — فئات CLDR العربية الست', () => {
  it('zero/one/two/few/many/other', () => {
    expect(pluralCategory(0)).toBe('zero')
    expect(pluralCategory(1)).toBe('one')
    expect(pluralCategory(2)).toBe('two')
    expect(pluralCategory(5)).toBe('few')
    expect(pluralCategory(50)).toBe('many')
    expect(pluralCategory(100)).toBe('other')
    expect(pluralCategory(102)).toBe('other')
  })
})
