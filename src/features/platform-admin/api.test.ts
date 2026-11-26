import { describe, expect, it, vi } from 'vitest'
import { fetchIsPlatformAdmin, fetchPlatformOverview, parsePlatformOverview } from './api'

/**
 * اختبارات أساس أدمن المنصة (مهمة 17 — 0055): عقد طبقة العميل مع
 * دالتي RPC وحيدتين — my_platform_admin للفحص وplatform_overview
 * للأرقام. الجدول نفسه بلا سياسة قراءة عميل بالتصميم، فأي انحراف
 * هنا (قراءة جدول مباشرة مثلاً) يكسر العقد ويجب أن يفشل الاختبار.
 */

const h = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  calls: [] as string[],
}))

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    rpc: (name: string) => {
      h.calls.push(name)
      return Promise.resolve(h.result)
    },
    from: () => {
      throw new Error('platform-admin api must never read tables directly')
    },
  }),
}))

function setRpc(data: unknown, error: unknown = null) {
  h.result = { data, error }
  h.calls = []
}

describe('fetchIsPlatformAdmin — فحص الصفة عبر RPC فقط', () => {
  it('يرجع true فقط عندما ترجع الدالة true حرفياً', async () => {
    setRpc(true)
    await expect(fetchIsPlatformAdmin()).resolves.toBe(true)
    expect(h.calls).toEqual(['my_platform_admin'])
  })

  it('أي قيمة غير true (false/null/كائن) تعني: ليس أدمن', async () => {
    setRpc(false)
    await expect(fetchIsPlatformAdmin()).resolves.toBe(false)
    setRpc(null)
    await expect(fetchIsPlatformAdmin()).resolves.toBe(false)
    setRpc({ admin: true })
    await expect(fetchIsPlatformAdmin()).resolves.toBe(false)
  })

  it('خطأ الـ RPC يصعد كما هو (لا ابتلاع ولا افتراض دخول)', async () => {
    const err = { message: 'function my_platform_admin() does not exist', code: '42883' }
    setRpc(null, err)
    await expect(fetchIsPlatformAdmin()).rejects.toBe(err)
  })
})

describe('parsePlatformOverview — تحويل حمولة jsonb بأمان', () => {
  it('يحوّل مفاتيح snake_case إلى شكل العميل', () => {
    expect(
      parsePlatformOverview({
        teachers_total: 12,
        teachers_activated: 9,
        students_total: 340,
      }),
    ).toEqual({ teachersTotal: 12, teachersActivated: 9, studentsTotal: 340 })
  })

  it('القيم الغائبة أو المشوّهة تسقط إلى 0 بدل كسر الصفحة', () => {
    expect(parsePlatformOverview(null)).toEqual({
      teachersTotal: 0,
      teachersActivated: 0,
      studentsTotal: 0,
    })
    expect(
      parsePlatformOverview({ teachers_total: 'x', students_total: -5 }),
    ).toEqual({ teachersTotal: 0, teachersActivated: 0, studentsTotal: 0 })
  })

  it('الأعداد الكسرية تُقرَّب لأسفل (عدّادات لا كسور فيها)', () => {
    expect(parsePlatformOverview({ teachers_total: 3.9 }).teachersTotal).toBe(3)
  })
})

describe('fetchPlatformOverview — أرقام المنصة عبر RPC', () => {
  it('ينادي platform_overview ويحوّل حمولتها', async () => {
    setRpc({ teachers_total: 2, teachers_activated: 1, students_total: 57 })
    await expect(fetchPlatformOverview()).resolves.toEqual({
      teachersTotal: 2,
      teachersActivated: 1,
      studentsTotal: 57,
    })
    expect(h.calls).toEqual(['platform_overview'])
  })

  it('رفض الخادم لغير الأدمن يصعد خطأً صريحاً', async () => {
    const err = { message: 'platform admin only', code: 'P0001' }
    setRpc(null, err)
    await expect(fetchPlatformOverview()).rejects.toBe(err)
  })
})
