import { describe, expect, it } from 'vitest'
import { captchaConfig } from './captcha'

describe('captchaConfig — تفعيل CAPTCHA من بيئة البناء فقط (F5)', () => {
  it('بلا مفتاح موقع: مطفأة (السلوك الافتراضي والديמו)', () => {
    expect(captchaConfig({})).toEqual({ enabled: false, siteKey: null })
    expect(captchaConfig({ VITE_CAPTCHA_SITE_KEY: '' })).toEqual({
      enabled: false,
      siteKey: null,
    })
    expect(captchaConfig({ VITE_CAPTCHA_SITE_KEY: '   ' })).toEqual({
      enabled: false,
      siteKey: null,
    })
  })

  it('بمفتاح موقع: مفعّلة ويُرجع المفتاح مطبّعاً', () => {
    expect(captchaConfig({ VITE_CAPTCHA_SITE_KEY: ' 0x4AAAAAAA-test ' })).toEqual({
      enabled: true,
      siteKey: '0x4AAAAAAA-test',
    })
  })

  it('قيمة غير نصية تُتجاهل (لا تفعيل وهمي)', () => {
    expect(captchaConfig({ VITE_CAPTCHA_SITE_KEY: 42 }).enabled).toBe(false)
    expect(captchaConfig({ VITE_CAPTCHA_SITE_KEY: null }).enabled).toBe(false)
  })
})
