import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cacheBustedUrl,
  decideVersionAction,
  forceClientUpdate,
  runVersionGuard,
  versionPairKey,
  VERSION_RELOAD_MARK_KEY,
} from './versionGuard'
import {
  getStaleClientSnapshot,
  resetStaleClientForTests,
} from './staleClient'

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

describe('cacheBustedUrl', () => {
  it('يضيف وسم __v ويحفظ المسار وباقي الاستعلام والهاش', () => {
    const out = cacheBustedUrl('https://app.example/login?next=%2Fhome#x', '123')
    const url = new URL(out)
    expect(url.searchParams.get('__v')).toBe('123')
    expect(url.searchParams.get('next')).toBe('/home')
    expect(url.hash).toBe('#x')
    expect(url.pathname).toBe('/login')
  })
  it('يستبدل وسمًا قائماً بدل تكراره', () => {
    const out = cacheBustedUrl('https://app.example/?__v=1', '2')
    expect(new URL(out).searchParams.getAll('__v')).toEqual(['2'])
  })
})

describe('forceClientUpdate — إجراء زر التحديث', () => {
  const deleted: string[] = []
  let unregistered = 0

  beforeEach(() => {
    deleted.length = 0
    unregistered = 0
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        keys: async () => ['shell-v1', 'shell-v2'],
        delete: async (k: string) => {
          deleted.push(k)
          return true
        },
      },
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: async () => [
          {
            unregister: async () => {
              unregistered += 1
              return true
            },
          },
          {
            unregister: async () => {
              unregistered += 1
              return true
            },
          },
        ],
      },
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'caches')
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it('يمسح كل الكاشات ويلغي كل التسجيلات ثم يتنقل لرابط كاسر للكاش', async () => {
    const navigate = vi.fn()
    await forceClientUpdate(navigate)
    expect(deleted).toEqual(['shell-v1', 'shell-v2'])
    expect(unregistered).toBe(2)
    expect(navigate).toHaveBeenCalledTimes(1)
    const target = new URL(navigate.mock.calls[0][0] as string)
    expect(target.searchParams.get('__v')).toBeTruthy()
  })
})

describe('runVersionGuard — رفع إشارة الألرت', () => {
  const LOCAL = '2026-11-20T00:00:00Z'
  const REMOTE = '2026-11-26T00:00:00Z'

  beforeEach(() => {
    resetStaleClientForTests()
    window.sessionStorage.clear()
    vi.stubGlobal('__BUILD_TIME__', LOCAL)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubRemoteBuild(buildTime: string) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ buildTime }),
      })),
    )
  }

  it('بناء مختلف وقد أعدنا التحميل لهذا الزوج → يرفع إشارة «عميل قديم»', async () => {
    stubRemoteBuild(REMOTE)
    window.sessionStorage.setItem(VERSION_RELOAD_MARK_KEY, versionPairKey(LOCAL, REMOTE))
    await runVersionGuard()
    expect(getStaleClientSnapshot()).toBe(true)
  })

  it('نفس البناء → لا إشارة', async () => {
    stubRemoteBuild(LOCAL)
    await runVersionGuard()
    expect(getStaleClientSnapshot()).toBe(false)
  })

  it('بناء مختلف ولم نعد التحميل بعد → شفاء صامت (علامة + إعادة تحميل) بلا إشارة', async () => {
    stubRemoteBuild(REMOTE)
    await runVersionGuard()
    expect(getStaleClientSnapshot()).toBe(false)
    expect(window.sessionStorage.getItem(VERSION_RELOAD_MARK_KEY)).toBe(
      versionPairKey(LOCAL, REMOTE),
    )
  })
})
