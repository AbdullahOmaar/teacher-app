import { describe, expect, it } from 'vitest'
import {
  EMPTY_THROTTLE,
  THROTTLE_FORGET_MS,
  clearLoginThrottle,
  getLoginThrottle,
  lockSecondsForFailures,
  recordLoginFailure,
  saveLoginFailure,
  throttleWaitSeconds,
} from './loginThrottle'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
  }
}

describe('lockSecondsForFailures — سياسة القفل التصاعدي (F2)', () => {
  it('أول فشلين بلا قفل', () => {
    expect(lockSecondsForFailures(0)).toBe(0)
    expect(lockSecondsForFailures(1)).toBe(0)
    expect(lockSecondsForFailures(2)).toBe(0)
  })

  it('من الثالث: 15 ثم مضاعفة حتى سقف 240', () => {
    expect(lockSecondsForFailures(3)).toBe(15)
    expect(lockSecondsForFailures(4)).toBe(30)
    expect(lockSecondsForFailures(5)).toBe(60)
    expect(lockSecondsForFailures(6)).toBe(120)
    expect(lockSecondsForFailures(7)).toBe(240)
    expect(lockSecondsForFailures(12)).toBe(240)
  })
})

describe('recordLoginFailure / throttleWaitSeconds — آلة الحالة النقية', () => {
  it('الفشل الثالث يقفل 15 ثانية من لحظته', () => {
    const now = 1_000_000
    let s = recordLoginFailure(EMPTY_THROTTLE, now)
    s = recordLoginFailure(s, now)
    expect(throttleWaitSeconds(s, now)).toBe(0)
    s = recordLoginFailure(s, now)
    expect(s.failures).toBe(3)
    expect(throttleWaitSeconds(s, now)).toBe(15)
    expect(throttleWaitSeconds(s, now + 14_500)).toBe(1)
    expect(throttleWaitSeconds(s, now + 15_000)).toBe(0)
  })
})

describe('التخزين لكل بريد — حفظ وقراءة وتصفيّر', () => {
  it('الحالة تُحفظ وتُقرأ بنفس البريد بعد التطبيع', () => {
    const storage = memoryStorage()
    const now = 5_000_000
    saveLoginFailure(storage, '  Owner@Example.com ', now)
    saveLoginFailure(storage, 'owner@example.com', now)
    const third = saveLoginFailure(storage, 'owner@example.com', now)
    expect(third.failures).toBe(3)
    expect(getLoginThrottle(storage, 'OWNER@example.com', now).failures).toBe(3)
    expect(getLoginThrottle(storage, 'other@example.com', now)).toEqual(EMPTY_THROTTLE)
  })

  it('النجاح (clear) يصفّر البريد وحده', () => {
    const storage = memoryStorage()
    const now = 5_000_000
    saveLoginFailure(storage, 'a@example.com', now)
    saveLoginFailure(storage, 'b@example.com', now)
    clearLoginThrottle(storage, 'a@example.com')
    expect(getLoginThrottle(storage, 'a@example.com', now)).toEqual(EMPTY_THROTTLE)
    expect(getLoginThrottle(storage, 'b@example.com', now).failures).toBe(1)
  })

  it('حالة أقدم من 24 ساعة تُنسى', () => {
    const storage = memoryStorage()
    const now = 5_000_000
    saveLoginFailure(storage, 'a@example.com', now)
    const later = now + THROTTLE_FORGET_MS + 1
    expect(getLoginThrottle(storage, 'a@example.com', later)).toEqual(EMPTY_THROTTLE)
  })

  it('قيمة فاسدة في التخزين تعني لا خنق (لا رمي)', () => {
    const storage = memoryStorage()
    storage.setItem('teacher-app-login-throttle-v1', '{broken json')
    expect(getLoginThrottle(storage, 'a@example.com', 1)).toEqual(EMPTY_THROTTLE)
  })
})
