import { describe, expect, it, vi } from 'vitest'
import {
  checkSelfRegistrationAllowed,
  confirmRecoveryWithCode,
  confirmSignUpWithCode,
  createTeacherProfileViaRpc,
  fetchAuthUser,
  isEmailUnconfirmed,
  isMissingRpcFunction,
  signUpNextStep,
} from './api'

/**
 * اختبارات بوابة قفل التسجيل (مهمة 17 — 0057): عقد العميل مع
 * دالتي RPC — can_self_register قبل signUp، و
 * create_teacher_profile_for_self نقطة الإنفاذ. القاعدة الذهبية
 * هنا: غياب الدالة (مهاجرة غير مطبّقة بعد) = الوضع الحالي
 * (تسجيل مفتوح) فيُرجع للمسار القديم، لكن رفضاً صريحاً من
 * البوابة ('registration closed') لا يُتجاوز أبداً بالرجوع
 * للمسار القديم — وإلا صار القفل وهماً.
 */

const h = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  calls: [] as { name: string; args: unknown }[],
  authCalls: [] as { args: unknown }[],
}))

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    rpc: (name: string, args: unknown) => {
      h.calls.push({ name, args })
      return Promise.resolve(h.result)
    },
    auth: {
      verifyOtp: (args: unknown) => {
        h.authCalls.push({ args })
        return Promise.resolve(h.result)
      },
      getUser: () => Promise.resolve(h.result),
    },
    from: () => {
      throw new Error('auth api test must not read tables directly')
    },
  }),
}))

function setRpc(data: unknown, error: unknown = null) {
  h.result = { data, error }
  h.calls = []
}

function setAuth(data: unknown, error: unknown = null) {
  h.result = { data, error }
  h.authCalls = []
}

describe('isMissingRpcFunction — تمييز غياب الدالة', () => {
  it('كود 42883 (دالة غير موجودة) غياب', () => {
    expect(isMissingRpcFunction({ code: '42883', message: 'x' })).toBe(true)
  })
  it('PGRST202 غياب أيضاً', () => {
    expect(isMissingRpcFunction({ code: 'PGRST202', message: 'x' })).toBe(true)
  })
  it('رسالة does not exist غياب', () => {
    expect(
      isMissingRpcFunction({
        message: 'function can_self_register(text, text) does not exist',
      }),
    ).toBe(true)
  })
  it('خطأ آخر (مثلاً 42501) ليس غياباً', () => {
    expect(isMissingRpcFunction({ code: '42501', message: 'x' })).toBe(false)
    expect(isMissingRpcFunction(null)).toBe(false)
  })
})

describe('checkSelfRegistrationAllowed — البوابة قبل signUp', () => {
  it('true من الـ RPC تعني مسموح، وتُمرَّر المعاملات كما هي', async () => {
    setRpc(true)
    await expect(
      checkSelfRegistrationAllowed('Teacher@Example.com', ' 01001234567 '),
    ).resolves.toBe(true)
    expect(h.calls).toEqual([
      {
        name: 'can_self_register',
        args: { p_email: 'Teacher@Example.com', p_phone: '01001234567' },
      },
    ])
  })
  it('false تعني مرفوض', async () => {
    setRpc(false)
    await expect(checkSelfRegistrationAllowed('x@y.z', null)).resolves.toBe(false)
  })
  it('غياب الدالة قبل تطبيق 0057 = مسموح (التسجيل المفتوح الحالي)', async () => {
    setRpc(null, { code: '42883', message: 'function does not exist' })
    await expect(checkSelfRegistrationAllowed('x@y.z', null)).resolves.toBe(true)
  })
  it('خطأ آخر يصعد مترجماً (فشل مغلق — لا تسجيل بلا قرار بوابة)', async () => {
    setRpc(null, { code: '42501', message: 'row-level security' })
    await expect(checkSelfRegistrationAllowed('x@y.z', null)).rejects.toThrow()
  })
})

describe('createTeacherProfileViaRpc — نقطة الإنفاذ', () => {
  const row = {
    id: 'u1',
    owner_user_id: 'u1',
    display_name: 'مستر أحمد',
    avatar_url: null,
    phone: '01001234567',
    account_activated: false,
    created_at: '2026-11-26T00:00:00Z',
    updated_at: '2026-11-26T00:00:00Z',
  }
  it('يرجع صف المدرس كما هو (بما فيه account_activated=false)', async () => {
    setRpc(row)
    await expect(
      createTeacherProfileViaRpc('مستر أحمد', '01001234567'),
    ).resolves.toEqual(row)
    expect(h.calls[0].name).toBe('create_teacher_profile_for_self')
  })
  it('غياب الدالة يرجع null فيسقط المتصل للمسار القديم', async () => {
    setRpc(null, { code: '42883', message: 'function does not exist' })
    await expect(createTeacherProfileViaRpc('مستر أحمد', null)).resolves.toBeNull()
  })
  it('رفض البوابة يتحول لرسالة عربية واضحة (لا رجوع صامت)', async () => {
    setRpc(null, { message: 'registration closed' })
    await expect(createTeacherProfileViaRpc('مستر أحمد', null)).rejects.toThrow(
      'التسجيل بالدعوة فقط',
    )
  })
  it('أي خطأ آخر يصعد كما هو', async () => {
    const err = { message: 'boom', code: 'XX000' }
    setRpc(null, err)
    await expect(createTeacherProfileViaRpc('مستر أحمد', null)).rejects.toBe(err)
  })
})

describe('confirmSignUpWithCode — تأكيد التسجيل بالكود (3A-904)', () => {
  it('يتحقق بنوع signup ببريد وكود مقصوصين، ويرجع معرّف المستخدم', async () => {
    setAuth({ user: { id: 'u9' }, session: { access_token: 'x' } })
    await expect(
      confirmSignUpWithCode(' Teacher@Example.com ', ' 123456 '),
    ).resolves.toEqual({ userId: 'u9' })
    expect(h.authCalls).toEqual([
      { args: { email: 'Teacher@Example.com', token: '123456', type: 'signup' } },
    ])
  })
  it('كود خاطئ/منتهٍ من GoTrue يُترجم لرسالة «الكود غير صحيح»', async () => {
    setAuth({ user: null, session: null }, { message: 'Token has expired or is invalid' })
    await expect(confirmSignUpWithCode('x@y.z', '000000')).rejects.toThrow(
      'الكود غير صحيح',
    )
  })
})

describe('confirmRecoveryWithCode — تأكيد كود الاستعادة (3A-904)', () => {
  it('يتحقق بنوع recovery ويصدر جلسة الاستعادة (بلا قيمة مرجعة)', async () => {
    setAuth({ user: { id: 'u9' }, session: { access_token: 'x' } })
    await expect(confirmRecoveryWithCode('x@y.z', '654321')).resolves.toBeUndefined()
    expect(h.authCalls).toEqual([
      { args: { email: 'x@y.z', token: '654321', type: 'recovery' } },
    ])
  })
  it('كود منتهٍ يُترجم لرسالة انتهاء الصلاحية', async () => {
    setAuth({ user: null, session: null }, { message: 'Token has expired' })
    await expect(confirmRecoveryWithCode('x@y.z', '654321')).rejects.toThrow(
      'انتهت صلاحيته',
    )
  })
})

describe('signUpNextStep — قرار ما بعد التسجيل (3A-904، تصحيح 17:19)', () => {
  it('جلسة فورية من التسجيل = دخول', () => {
    expect(signUpNextStep(true, false)).toBe('enter')
    expect(signUpNextStep(true, true)).toBe('enter')
  })
  it('لا جلسة لكن الدخول الفوري نجح (النظام مطفأ) = دخول بلا كود', () => {
    expect(signUpNextStep(false, true)).toBe('enter')
  })
  it('لا جلسة والدخول الفوري اترفض (النظام مفعّل) = شاشة الكود الإلزامية', () => {
    expect(signUpNextStep(false, false)).toBe('code')
  })
})

describe('isEmailUnconfirmed — حارس بطاقة تأكيد البريد (3A-904)', () => {
  it('بلا مستخدم = لا بطاقة', () => {
    expect(isEmailUnconfirmed(null)).toBe(false)
    expect(isEmailUnconfirmed(undefined)).toBe(false)
  })
  it('email_confirmed_at غائب أو null أو فارغ = غير مؤكَّد', () => {
    expect(isEmailUnconfirmed({})).toBe(true)
    expect(isEmailUnconfirmed({ email_confirmed_at: null })).toBe(true)
    expect(isEmailUnconfirmed({ email_confirmed_at: '' })).toBe(true)
  })
  it('email_confirmed_at موجود = مؤكَّد فلا بطاقة', () => {
    expect(
      isEmailUnconfirmed({ email_confirmed_at: '2026-11-26T10:00:00Z' }),
    ).toBe(false)
  })
})

describe('fetchAuthUser — لقطة المستخدم الطازجة (3A-904)', () => {
  it('يرسم البريد وحالة التأكيد من رد getUser', async () => {
    setAuth({
      user: { email: 'x@y.z', email_confirmed_at: null },
    })
    await expect(fetchAuthUser()).resolves.toEqual({
      email: 'x@y.z',
      email_confirmed_at: null,
    })
  })
  it('خطأ من الخادم = null (المتصل يسقط لنسخة الجلسة)', async () => {
    setAuth({ user: null }, { message: 'network down' })
    await expect(fetchAuthUser()).resolves.toBeNull()
  })
  it('لا مستخدم في الرد = null', async () => {
    setAuth({ user: null })
    await expect(fetchAuthUser()).resolves.toBeNull()
  })
})
