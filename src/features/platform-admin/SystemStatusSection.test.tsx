import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemStatusSection } from './SystemStatusSection'

/**
 * اختبارات تصيير قسم «حالة النظام» (3A-933): الحالات المعروضة هي
 * العقد — صحي (الكل شغال)، التطبيق لا يرد، القاعدة لا ترد، النسخ
 * نائم، ورابط البرودكشن غير المضبوط يعرض «لسه مش منشور» بلا رابط.
 * الفحوص تُحاكى عند حدودها (fetch للصحة + RPC ‏platform_overview)
 * وقراءة النسخة عند hook اللوحة.
 */

const h = vi.hoisted(() => ({
  rpcError: null as unknown,
  backup: {
    data: null as string | null,
    isError: false,
    isPending: false,
  },
}))

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    rpc: (name: string) =>
      name === 'platform_overview'
        ? Promise.resolve(
            h.rpcError
              ? { data: null, error: h.rpcError }
              : { data: { teachers_total: 1 }, error: null },
          )
        : Promise.resolve({ data: null, error: null }),
    from: () => {
      throw new Error('system status section must not read tables directly')
    },
  }),
}))

vi.mock('./hooks', () => ({
  useLastBackupAt: () => h.backup,
}))

function stubFetchOk() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true })),
  )
}

describe('SystemStatusSection — حالات العرض', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    h.rpcError = null
    h.backup = { data: null, isError: false, isPending: false }
  })

  it('صحي: الفحصان شغالان، والبرودكشن «لسه مش منشور»، والنسخ نائم', async () => {
    stubFetchOk()
    render(<SystemStatusSection />)

    expect(await screen.findAllByText('شغال')).toHaveLength(2)
    expect(screen.getByText(/لسه مش منشور/)).toBeTruthy()
    expect(screen.getByText('لسه مش مفعّلة')).toBeTruthy()
    // رابط الديمو هو أصل البيئة الجارية ورابط الحجز على ‎/book
    expect(screen.getByText(window.location.origin)).toBeTruthy()
    expect(
      screen.getByText(`${window.location.origin}/book`),
    ).toBeTruthy()
    // سطر النسخة من بيانات البناء (مصدر سطر الإصدار نفسه)
    expect(screen.getByText(/الإصدار/)).toBeTruthy()
  })

  it('التطبيق لا يرد: فشل fetch يعرض «لا يرد» للتطبيق و«شغال» للقاعدة', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    render(<SystemStatusSection />)

    expect(await screen.findByText('لا يرد')).toBeTruthy()
    expect(await screen.findByText('شغال')).toBeTruthy()
  })

  it('القاعدة لا ترد: فشل RPC يعرض «لا يرد» للقاعدة و«شغال» للتطبيق', async () => {
    stubFetchOk()
    h.rpcError = { message: 'function platform_overview() does not exist' }
    render(<SystemStatusSection />)

    expect(await screen.findByText('لا يرد')).toBeTruthy()
    expect(await screen.findByText('شغال')).toBeTruthy()
  })

  it('نسخة مسجلة: وقت آخر نسخة ناجحة يظهر بدل حالة النوم', async () => {
    stubFetchOk()
    h.backup = {
      data: '2026-11-27T21:00:00.000Z',
      isError: false,
      isPending: false,
    }
    render(<SystemStatusSection />)

    expect(await screen.findByText(/آخر نسخة ناجحة/)).toBeTruthy()
    expect(screen.queryByText('لسه مش مفعّلة')).toBeNull()
  })
})
