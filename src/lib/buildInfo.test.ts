import { describe, expect, it } from 'vitest'
import { buildVersionLine, formatBuildTime } from './buildInfo'

// سطر ختم الإصدار (قاعدة المالك 2026-11-25): الصياغة من بيانات البناء
// (إصدار + لحظة ISO) بتوقيت Africa/Cairo مثبّتاً — القاهرة UTC+2 شتاءً
// وUTC+3 صيفاً (التوقيت الصيفي المصري)، فالاختبارات تثبّت الفصلين معاً
// حتى لا يمر تحويل ثابت الإزاحة بالخطأ.

describe('formatBuildTime — لحظة البناء بتوقيت القاهرة', () => {
  it('شتاءً: 04:19 UTC تصبح 06:19 صباحاً (UTC+2)', () => {
    const out = formatBuildTime('2026-11-25T04:19:00.000Z')
    expect(out).toContain('٢٠٢٦')
    expect(out).toContain('٦:١٩')
    expect(out).toContain('ص')
  })

  it('صيفاً: 10:00 UTC تصبح 01:00 ظهراً (UTC+3 — توقيت صيفي)', () => {
    const out = formatBuildTime('2026-07-01T10:00:00.000Z')
    expect(out).toContain('١:٠٠')
    expect(out).toContain('م')
  })

  it('قيمة غير صالحة تُعاد كما هي (سلوك formatDateTimeAr)', () => {
    expect(formatBuildTime('not-a-date')).toBe('not-a-date')
  })
})

describe('buildVersionLine — صياغة السطر الموحّدة', () => {
  it('«الإصدار X — نُشر [التاريخ والوقت]» من القيم المعطاة حرفياً', () => {
    const iso = '2026-11-25T04:19:00.000Z'
    expect(buildVersionLine('9.9.9', iso)).toBe(
      `الإصدار 9.9.9 — نُشر ${formatBuildTime(iso)}`,
    )
  })

  it('رقم الإصدار يظهر كما هو بلا أي إعادة تنسيق', () => {
    const line = buildVersionLine('1.0.0', '2026-11-25T04:19:00.000Z')
    expect(line.startsWith('الإصدار 1.0.0 — نُشر ')).toBe(true)
  })
})
