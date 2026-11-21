import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefetchRoute, prefetchRoutesIdle, registerRouteLoaders } from './routePrefetch'

// سجلّ الوحدة حالته داخلية ثابتة — كل اختبار يسجّل مساراته الخاصة
// بمفاتيح فريدة حتى لا تتسرب حالة «بدأ» بين الاختبارات
let seq = 0
function uniquePath() {
  seq += 1
  return `/test-route-${seq}`
}

afterEach(() => {
  vi.useRealTimers()
})

describe('prefetchRoute — تسخين مسار واحد (3A-312 بند ٢)', () => {
  it('يستدعي المحمّل مرة واحدة مهما تكررت اللمسات', async () => {
    const path = uniquePath()
    const loader = vi.fn(() => Promise.resolve({}))
    registerRouteLoaders({ [path]: loader })
    prefetchRoute(path)
    prefetchRoute(path)
    prefetchRoute(path)
    await Promise.resolve()
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('مسار غير مسجّل = لا شيء (لا خطأ)', () => {
    expect(() => prefetchRoute('/never-registered-xyz')).not.toThrow()
  })

  it('فشل الجلب يُنسى فيُعاد عند اللمسة التالية', async () => {
    const path = uniquePath()
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({})
    registerRouteLoaders({ [path]: loader })
    prefetchRoute(path)
    // انتظار معالجة الرفض (microtask + catch)
    await new Promise((r) => setTimeout(r, 0))
    prefetchRoute(path)
    await Promise.resolve()
    expect(loader).toHaveBeenCalledTimes(2)
  })
})

describe('prefetchRoutesIdle — تسخين خمول تسلسلي', () => {
  it('يُسخّن المسارات واحداً تلو الآخر عبر دورات الخمول/المؤقّت', async () => {
    vi.useFakeTimers()
    const paths = [uniquePath(), uniquePath(), uniquePath()]
    const calls: string[] = []
    const map: Record<string, () => Promise<unknown>> = {}
    for (const p of paths) {
      map[p] = () => {
        calls.push(p)
        return Promise.resolve({})
      }
    }
    registerRouteLoaders(map)
    const cancel = prefetchRoutesIdle(paths)
    // jsdom بلا requestIdleCallback → مسار المؤقّت الاحتياطي (250ms)
    await vi.advanceTimersByTimeAsync(250)
    expect(calls).toEqual([paths[0]])
    await vi.advanceTimersByTimeAsync(250)
    expect(calls).toEqual([paths[0], paths[1]])
    cancel()
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls).toEqual([paths[0], paths[1]])
  })
})
