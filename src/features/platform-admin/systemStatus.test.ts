import { describe, expect, it, vi } from 'vitest'
import {
  buildSystemLinks,
  checkAppHealth,
  checkDbHealth,
  copyTextToClipboard,
  fetchLastBackupAt,
  parseBackupValue,
  resolveProductionUrl,
  LAST_BACKUP_KEY,
} from './systemStatus'

/**
 * اختبارات حالة النظام (3A-933): عقد طبقة المنطق مع مصادرها الحية —
 * رابط البرودكشن من نقطة إعداد واحدة (غيابه حالة لا رابط وهمي)،
 * الفحوص الحية لا ترمي أبداً (الفشل نتيجة «لا يرد»)، وقيمة النسخة
 * الليلية من platform_settings بمفتاح last_backup_at (غيابها =
 * «لسه مش مفعّلة» لا لحظة مخترعة).
 */

const h = vi.hoisted(() => ({
  row: null as { value: unknown } | null,
  error: null as unknown,
  key: '' as string,
}))

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: (_col: string, key: string) => {
          h.key = key
          return {
            maybeSingle: () =>
              Promise.resolve({ data: h.row, error: h.error }),
          }
        },
      }),
    }),
  }),
}))

describe('resolveProductionUrl — نقطة إعداد رابط البرودكشن', () => {
  it('غياب/فراغ القيمة = null (حالة «لسه مش منشور» لا رابط وهمي)', () => {
    expect(resolveProductionUrl(undefined)).toBeNull()
    expect(resolveProductionUrl('')).toBeNull()
    expect(resolveProductionUrl('   ')).toBeNull()
  })

  it('قيمة بلا بروتوكول ويب تُرفض — لا رابط مشوّه يُعرض أبداً', () => {
    expect(resolveProductionUrl('teacher-app.vercel.app')).toBeNull()
    expect(resolveProductionUrl('ftp://example.com')).toBeNull()
  })

  it('رابط صالح يُقصّ وتُزال شرطته الأخيرة', () => {
    expect(resolveProductionUrl('  https://mister.example.com/  ')).toBe(
      'https://mister.example.com',
    )
  })
})

describe('buildSystemLinks — الروابط الرسمية الثلاثة', () => {
  it('البرودكشن غير المضبوط يبقى null والديمو هو الأصل والحجز على /book', () => {
    const links = buildSystemLinks('https://demo.example.com', null)
    expect(links.production).toBeNull()
    expect(links.demo).toBe('https://demo.example.com')
    expect(links.booking).toBe('https://demo.example.com/book')
  })

  it('البرودكشن المضبوط يمرّ كما هو وشرطة الأصل الأخيرة لا تتضاعف', () => {
    const links = buildSystemLinks(
      'https://demo.example.com/',
      'https://prod.example.com',
    )
    expect(links.production).toBe('https://prod.example.com')
    expect(links.booking).toBe('https://demo.example.com/book')
  })
})

describe('checkAppHealth — فحص التطبيق الحي لا يرمي أبداً', () => {
  it('رد ناجح = يرد مع زمن الرد محسوباً من الساعة المحقونة', async () => {
    const times = [100, 175]
    const res = await checkAppHealth(
      () => Promise.resolve({ ok: true }),
      () => times.shift() ?? 0,
    )
    expect(res).toEqual({ ok: true, latencyMs: 75 })
  })

  it('حالة غير ناجحة = لا يرد', async () => {
    const res = await checkAppHealth(() => Promise.resolve({ ok: false }))
    expect(res.ok).toBe(false)
  })

  it('فشل شبكة = لا يرد (مصير الـ catch هو النتيجة نفسها)', async () => {
    const res = await checkAppHealth(() =>
      Promise.reject(new Error('network down')),
    )
    expect(res.ok).toBe(false)
    expect(res.latencyMs).not.toBeNull()
  })
})

describe('checkDbHealth — فحص القاعدة عبر مسبار الأدمن', () => {
  it('نجاح المسبار = ترد', async () => {
    await expect(
      checkDbHealth(() => Promise.resolve({})),
    ).resolves.toEqual({ ok: true, latencyMs: null })
  })

  it('فشل المسبار = لا ترد (لا خطأ خام يصعد للقسم)', async () => {
    await expect(
      checkDbHealth(() => Promise.reject(new Error('rpc missing'))),
    ).resolves.toEqual({ ok: false, latencyMs: null })
  })
})

describe('parseBackupValue — تحويل قيمة النسخة الليلية بأمان', () => {
  it('نص تاريخ صالح يمرّ كما هو', () => {
    expect(parseBackupValue('2026-11-27T21:00:00.000Z')).toBe(
      '2026-11-27T21:00:00.000Z',
    )
  })

  it('أي شكل آخر = null (لا لحظة مخترعة)', () => {
    expect(parseBackupValue(null)).toBeNull()
    expect(parseBackupValue(undefined)).toBeNull()
    expect(parseBackupValue(1764000000)).toBeNull()
    expect(parseBackupValue('')).toBeNull()
    expect(parseBackupValue('مش تاريخ')).toBeNull()
    expect(parseBackupValue({ at: '2026-11-27' })).toBeNull()
  })
})

describe('fetchLastBackupAt — قراءة نقطة ربط النسخ من platform_settings', () => {
  it('يقرأ مفتاح last_backup_at ويرجع اللحظة', async () => {
    h.row = { value: '2026-11-27T21:00:00.000Z' }
    h.error = null
    await expect(fetchLastBackupAt()).resolves.toBe('2026-11-27T21:00:00.000Z')
    expect(h.key).toBe(LAST_BACKUP_KEY)
  })

  it('غياب الصف = null (الآلية لم تُفعَّل بعد)', async () => {
    h.row = null
    h.error = null
    await expect(fetchLastBackupAt()).resolves.toBeNull()
  })

  it('غياب الجدول (0057 غير مطبّقة) = null لا خطأ', async () => {
    h.row = null
    h.error = {
      code: 'PGRST205',
      message: "Could not find the table 'public.platform_settings'",
    }
    await expect(fetchLastBackupAt()).resolves.toBeNull()
  })

  it('قيمة مشوّهة في الصف = null', async () => {
    h.row = { value: 42 }
    h.error = null
    await expect(fetchLastBackupAt()).resolves.toBeNull()
  })

  it('خطأ حقيقي آخر يصعد كما هو', async () => {
    const err = { code: '42501', message: 'permission denied' }
    h.row = null
    h.error = err
    await expect(fetchLastBackupAt()).rejects.toBe(err)
  })
})

describe('copyTextToClipboard — النسخ ببديل مصمم', () => {
  function fakeDoc(execResult: boolean) {
    const area = {
      value: '',
      style: {} as Record<string, string>,
      select: vi.fn(),
    }
    return {
      createElement: () => area,
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand: () => execResult,
    } as unknown as Document
  }

  it('واجهة الحافظة الحديثة تنجح مباشرة', async () => {
    const nav = {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    } as unknown as Navigator
    await expect(
      copyTextToClipboard('https://x', fakeDoc(false), nav),
    ).resolves.toBe(true)
  })

  it('رفض الحافظة يسقط للبديل الكلاسيكي', async () => {
    const nav = {
      clipboard: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) },
    } as unknown as Navigator
    await expect(
      copyTextToClipboard('https://x', fakeDoc(true), nav),
    ).resolves.toBe(true)
  })

  it('فشل الوسيلتين = false (الواجهة تطلب النسخ اليدوي)', async () => {
    const nav = {} as unknown as Navigator
    await expect(
      copyTextToClipboard('https://x', fakeDoc(false), nav),
    ).resolves.toBe(false)
  })
})
