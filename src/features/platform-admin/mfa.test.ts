import { describe, expect, it, vi } from 'vitest'
import {
  enrollTotp,
  fetchMfaStatus,
  isMfaUnavailableError,
  isTotpCode,
  logMfaAudit,
  parseMfaFactors,
  resolveMfaStatus,
  unenrollTotp,
  verifyTotpCode,
  type MfaFactorLike,
} from './mfa'

/**
 * اختبارات التحقق بخطوتين لأدمن المنصة (مهمة 23 — 0067): طبقة العميل
 * مع GoTrue MFA المدمج — قرار الحالة نقي، ونداءات enroll/verify/
 * unenroll تمرّر كما هي، والتدقيق best-effort لا يكسر المصادقة.
 * لا اتصال حي هنا إطلاقاً — db() موهوم بالكامل.
 */

const h = vi.hoisted(() => ({
  session: { user: { id: 'u-1' } } as unknown,
  sessionError: null as unknown,
  factors: { totp: [] as MfaFactorLike[] },
  factorsError: null as unknown,
  aal: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] },
  enrollResult: { data: null as unknown, error: null as unknown },
  verifyResult: { data: null as unknown, error: null as unknown },
  unenrollResult: { data: null as unknown, error: null as unknown },
  rpcResult: { data: null as unknown, error: null as unknown },
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
  mfaCalls: [] as Array<{ method: string; args: unknown }>,
}))

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: h.session },
          error: h.sessionError,
        }),
      mfa: {
        listFactors: () =>
          Promise.resolve({ data: h.factors, error: h.factorsError }),
        getAuthenticatorAssuranceLevel: () => h.aal,
        enroll: (args: unknown) => {
          h.mfaCalls.push({ method: 'enroll', args })
          return Promise.resolve(h.enrollResult)
        },
        challengeAndVerify: (args: unknown) => {
          h.mfaCalls.push({ method: 'challengeAndVerify', args })
          return Promise.resolve(h.verifyResult)
        },
        unenroll: (args: unknown) => {
          h.mfaCalls.push({ method: 'unenroll', args })
          return Promise.resolve(h.unenrollResult)
        },
      },
    },
    rpc: (name: string, args: unknown) => {
      h.rpcCalls.push({ name, args })
      return Promise.resolve(h.rpcResult)
    },
  }),
}))

function reset() {
  h.session = { user: { id: 'u-1' } } as unknown
  h.sessionError = null
  h.factors = { totp: [] }
  h.factorsError = null
  h.aal = {
    currentLevel: 'aal1',
    nextLevel: 'aal2',
    currentAuthenticationMethods: [],
  }
  h.enrollResult = { data: null, error: null }
  h.verifyResult = { data: null, error: null }
  h.unenrollResult = { data: null, error: null }
  h.rpcResult = { data: null, error: null }
  h.rpcCalls = []
  h.mfaCalls = []
}

describe('isTotpCode — كود 6 أرقام بالضبط', () => {
  it('يقبل 6 أرقام ويرفض ما عداها', () => {
    expect(isTotpCode('123456')).toBe(true)
    expect(isTotpCode('12345')).toBe(false)
    expect(isTotpCode('1234567')).toBe(false)
    expect(isTotpCode('12345a')).toBe(false)
    expect(isTotpCode('')).toBe(false)
  })
})

describe('resolveMfaStatus — قرار الحالة النقي', () => {
  it('عامل موثّق = مسجَّل، ومعرّفه عامل التحدي، وaal يمرّر كما هو', () => {
    const s = resolveMfaStatus(
      [
        { id: 'f-verified', status: 'verified' },
        { id: 'f-pending', status: 'unverified' },
      ],
      'aal2',
    )
    expect(s).toEqual({
      enrolled: true,
      factorId: 'f-verified',
      unverifiedFactorId: 'f-pending',
      aal: 'aal2',
      unavailable: false,
    })
  })

  it('عامل غير موثّق وحده = غير مسجَّل مع حفظ معرّفه للاستئناف', () => {
    const s = resolveMfaStatus(
      [{ id: 'f-pending', status: 'unverified' }],
      'aal1',
    )
    expect(s.enrolled).toBe(false)
    expect(s.factorId).toBeNull()
    expect(s.unverifiedFactorId).toBe('f-pending')
    expect(s.aal).toBe('aal1')
  })

  it('بلا عوامل = غير مسجَّل وaal فارغ عند غياب الجلسة', () => {
    const s = resolveMfaStatus([], null)
    expect(s).toEqual({
      enrolled: false,
      factorId: null,
      unverifiedFactorId: null,
      aal: null,
      unavailable: false,
    })
  })
})

describe('parseMfaFactors — تحويل دفاعي لحمولة listFactors', () => {
  it('يأخذ عوامل totp الصالحة ويسقط الغريب', () => {
    expect(
      parseMfaFactors({
        totp: [
          { id: 'f1', status: 'verified' },
          { id: '', status: 'verified' },
          { id: 'f2', status: 'weird' },
          { id: 'f3', status: 'unverified' },
        ],
      }),
    ).toEqual([
      { id: 'f1', status: 'verified' },
      { id: 'f3', status: 'unverified' },
    ])
  })

  it('أي شكل غير مصفوفة = []', () => {
    expect(parseMfaFactors(null)).toEqual([])
    expect(parseMfaFactors({})).toEqual([])
    expect(parseMfaFactors({ totp: 'x' })).toEqual([])
  })
})

describe('isMfaUnavailableError — تمييز «MFA غير مفعّل»', () => {
  it('رسائل التعطيل تُميَّز وغيرها لا', () => {
    expect(isMfaUnavailableError(new Error('MFA is not enabled'))).toBe(true)
    expect(isMfaUnavailableError(new Error('mfa disabled'))).toBe(true)
    expect(isMfaUnavailableError(new Error('network timeout'))).toBe(false)
    expect(isMfaUnavailableError(null)).toBe(false)
  })
})

describe('fetchMfaStatus — قراءة الحالة من GoTrue', () => {
  it('عامل موثّق + aal1 = مسجَّل بلا إكمال للتحدي بعد', async () => {
    reset()
    h.factors = { totp: [{ id: 'f1', status: 'verified' }] }
    const s = await fetchMfaStatus()
    expect(s.enrolled).toBe(true)
    expect(s.factorId).toBe('f1')
    expect(s.aal).toBe('aal1')
    expect(s.unavailable).toBe(false)
  })

  it('خطأ «MFA غير مفعّل» = حالة unavailable لا رمي', async () => {
    reset()
    h.factorsError = new Error('MFA is not enabled for this project')
    const s = await fetchMfaStatus()
    expect(s.unavailable).toBe(true)
    expect(s.enrolled).toBe(false)
  })

  it('بلا جلسة = رمي (البوابة لا تستدعيها أصلاً بلا جلسة)', async () => {
    reset()
    h.session = null
    await expect(fetchMfaStatus()).rejects.toThrow()
  })
})

describe('enrollTotp / verifyTotpCode / unenrollTotp — تمرير نداءات MFA', () => {
  it('التسجيل يرجع QR + السر + المعرف من totp', async () => {
    reset()
    h.enrollResult = {
      data: {
        id: 'f-new',
        totp: {
          qr_code: 'data:image/svg+xml;base64,xxx',
          secret: 'JBSWY3DPEHPK3PXP',
          uri: 'otpauth://totp/x',
        },
      },
      error: null,
    }
    const r = await enrollTotp()
    expect(r).toEqual({
      factorId: 'f-new',
      qrCode: 'data:image/svg+xml;base64,xxx',
      secret: 'JBSWY3DPEHPK3PXP',
      uri: 'otpauth://totp/x',
    })
    expect(h.mfaCalls).toEqual([
      {
        method: 'enroll',
        args: { factorType: 'totp', friendlyName: 'Mister — أدمن المنصة' },
      },
    ])
  })

  it('رد تسجيل مشوّه (بلا totp) = رمي لا تسجيل نصف مكتمل', async () => {
    reset()
    h.enrollResult = { data: { id: 'f-new', totp: null }, error: null }
    await expect(enrollTotp()).rejects.toThrow()
  })

  it('التحقق يمرّر factorId + code لـ challengeAndVerify', async () => {
    reset()
    await verifyTotpCode('f1', '123456')
    expect(h.mfaCalls).toEqual([
      { method: 'challengeAndVerify', args: { factorId: 'f1', code: '123456' } },
    ])
  })

  it('خطأ التحقق (كود خاطئ) يُرمى ليُعرض ودّياً', async () => {
    reset()
    h.verifyResult = { data: null, error: new Error('invalid code') }
    await expect(verifyTotpCode('f1', '000000')).rejects.toThrow('invalid code')
  })

  it('إلغاء التسجيل يمرّر factorId', async () => {
    reset()
    await unenrollTotp('f1')
    expect(h.mfaCalls).toEqual([
      { method: 'unenroll', args: { factorId: 'f1' } },
    ])
  })
})

describe('logMfaAudit — تدقيق best-effort لا يكسر المصادقة أبداً', () => {
  it('ينادي log_platform_audit بالفعل + التفاصيل', async () => {
    reset()
    await logMfaAudit('mfa_enrolled', { factor_id: 'f1' })
    expect(h.rpcCalls).toEqual([
      {
        name: 'log_platform_audit',
        args: {
          p_action: 'mfa_enrolled',
          p_target_teacher_id: null,
          p_details: { factor_id: 'f1' },
        },
      },
    ])
  })

  it('فشل التدقيق (الدالة غائبة قبل 0066) لا يرمي', async () => {
    reset()
    h.rpcResult = {
      data: null,
      error: new Error('function log_platform_audit does not exist'),
    }
    await expect(logMfaAudit('mfa_enrolled')).resolves.toBeUndefined()
  })
})
