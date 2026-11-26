import { describe, expect, it, vi } from 'vitest'
import {
  checkSelfRegistrationAllowed,
  createTeacherProfileViaRpc,
  isMissingRpcFunction,
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
}))

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    rpc: (name: string, args: unknown) => {
      h.calls.push({ name, args })
      return Promise.resolve(h.result)
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
