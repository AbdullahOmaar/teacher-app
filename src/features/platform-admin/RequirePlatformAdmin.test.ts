import { describe, expect, it } from 'vitest'
import { adminGateState, type AdminGateInput } from './RequirePlatformAdmin'

/**
 * اختبارات قرار بوابة أدمن المنصة (مهمة 17 — 0055): الفصل بين نوعي
 * المستخدمين قرار أمني — «allowed» لا تخرج إلا بجلسة قائمة + إثبات
 * أدمن ناجح، وكل حالة نقص/فشل تنتهي إلى loading/signed-out/denied.
 */

const base: AdminGateInput = {
  sessionLoading: false,
  hasSession: true,
  adminPending: false,
  isAdmin: true,
}

describe('adminGateState — قرار بوابة الأدمن', () => {
  it('جلسة + إثبات أدمن ناجح = allowed (الحالة الوحيدة للدخول)', () => {
    expect(adminGateState(base)).toBe('allowed')
  })

  it('أثناء فحص الجلسة = loading مهما كانت بقية الحقول', () => {
    expect(adminGateState({ ...base, sessionLoading: true })).toBe('loading')
    expect(
      adminGateState({ ...base, sessionLoading: true, hasSession: false }),
    ).toBe('loading')
  })

  it('بلا جلسة = signed-out حتى لو وصل إثبات أدمن (لا يحدث عملياً)', () => {
    expect(adminGateState({ ...base, hasSession: false })).toBe('signed-out')
  })

  it('فحص الأدمن جارٍ = loading (لا وميض رفض ولا دخول مبكر)', () => {
    expect(adminGateState({ ...base, adminPending: true })).toBe('loading')
    expect(
      adminGateState({ ...base, adminPending: true, isAdmin: false }),
    ).toBe('loading')
  })

  it('مدرس مصادق ليس أدمن = denied', () => {
    expect(adminGateState({ ...base, isAdmin: false })).toBe('denied')
  })
})
