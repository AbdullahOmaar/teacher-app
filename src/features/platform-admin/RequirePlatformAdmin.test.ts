import { describe, expect, it } from 'vitest'
import { adminGateState, type AdminGateInput } from './RequirePlatformAdmin'

/**
 * اختبارات قرار بوابة أدمن المنصة (مهمة 17 — 0055 + مهمة 23 — 0067):
 * الفصل بين نوعي المستخدمين قرار أمني — «allowed» لا تخرج إلا بجلسة
 * قائمة + إثبات أدمن ناجح + عامل TOTP موثّق + جلسة aal2، وكل حالة
 * نقص/فشل تنتهي إلى loading/signed-out/denied أو إحدى حالات MFA.
 * المدرّس يُرفض قبل فحص MFA إطلاقاً.
 */

const base: AdminGateInput = {
  sessionLoading: false,
  hasSession: true,
  adminPending: false,
  isAdmin: true,
  mfaPending: false,
  mfaError: false,
  mfaStatus: {
    enrolled: true,
    factorId: 'f1',
    unverifiedFactorId: null,
    aal: 'aal2',
    unavailable: false,
  },
}

describe('adminGateState — قرار بوابة الأدمن', () => {
  it('جلسة + إثبات أدمن ناجح + عامل موثّق + aal2 = allowed (الحالة الوحيدة للدخول)', () => {
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

  it('مدرس مصادق ليس أدمن = denied (قبل فحص MFA إطلاقاً)', () => {
    expect(adminGateState({ ...base, isAdmin: false })).toBe('denied')
    expect(
      adminGateState({
        ...base,
        isAdmin: false,
        mfaStatus: {
          enrolled: false,
          factorId: null,
          unverifiedFactorId: null,
          aal: 'aal1',
          unavailable: false,
        },
      }),
    ).toBe('denied')
  })

  it('فحص MFA جارٍ = loading', () => {
    expect(adminGateState({ ...base, mfaPending: true })).toBe('loading')
  })

  it('خطأ فحص MFA أو غياب حالته = mfa-error (لا دخول بلا حالة موثوقة)', () => {
    expect(adminGateState({ ...base, mfaError: true })).toBe('mfa-error')
    expect(adminGateState({ ...base, mfaStatus: null })).toBe('mfa-error')
  })

  it('MFA غير مفعّل في المشروع = mfa-unavailable', () => {
    expect(
      adminGateState({
        ...base,
        mfaStatus: {
          enrolled: false,
          factorId: null,
          unverifiedFactorId: null,
          aal: 'aal1',
          unavailable: true,
        },
      }),
    ).toBe('mfa-unavailable')
  })

  it('أدمن بلا عامل موثّق = mfa-enroll (تمهيد من جلسته نفسها)', () => {
    expect(
      adminGateState({
        ...base,
        mfaStatus: {
          enrolled: false,
          factorId: null,
          unverifiedFactorId: null,
          aal: 'aal1',
          unavailable: false,
        },
      }),
    ).toBe('mfa-enroll')
    expect(
      adminGateState({
        ...base,
        mfaStatus: {
          enrolled: false,
          factorId: null,
          unverifiedFactorId: 'f-pending',
          aal: 'aal1',
          unavailable: false,
        },
      }),
    ).toBe('mfa-enroll')
  })

  it('أدمن بعامل موثّق وجلسة aal1 = mfa-challenge (لا دخول قبل الكود)', () => {
    expect(
      adminGateState({
        ...base,
        mfaStatus: {
          enrolled: true,
          factorId: 'f1',
          unverifiedFactorId: null,
          aal: 'aal1',
          unavailable: false,
        },
      }),
    ).toBe('mfa-challenge')
  })
})
