import { describe, expect, it } from 'vitest'
import {
  TOKEN_TTL_DAYS,
  buildAttMeta,
  normalizeOverviewHead,
  normalizePortalBrand,
  num,
  tokenStatusOf,
} from './tokenLifecycle'

// اختبارات الوحدة المشتركة لدورة حياة التوكن (COD-3 / 3A-362) —
// دوال نقية فقط؛ مسارات قاعدة البيانات تُغطّى باختبارات التفويض.

describe('TOKEN_TTL_DAYS', () => {
  it('30 يوماً — قرار الإطلاق المعتمد للبوابتين', () => {
    expect(TOKEN_TTL_DAYS).toBe(30)
  })
})

describe('num', () => {
  it('يقبل أرقاماً ونصوصاً رقمية', () => {
    expect(num(12.5)).toBe(12.5)
    expect(num('42')).toBe(42)
    expect(num('3.25')).toBe(3.25)
  })
  it('القيم الفاسدة/الغائبة = 0', () => {
    expect(num('abc')).toBe(0)
    expect(num(null)).toBe(0)
    expect(num(undefined)).toBe(0)
    expect(num(Number.NaN)).toBe(0)
  })
})

describe('tokenStatusOf', () => {
  const future = new Date(Date.now() + 60_000).toISOString()
  const past = new Date(Date.now() - 60_000).toISOString()
  it('ملغي صراحة يتقدم الانتهاء', () => {
    expect(tokenStatusOf({ revoked_at: past, expires_at: future })).toBe('revoked')
    expect(tokenStatusOf({ revoked_at: past, expires_at: past })).toBe('revoked')
  })
  it('منتهٍ بمرور وقته', () => {
    expect(tokenStatusOf({ revoked_at: null, expires_at: past })).toBe('expired')
  })
  it('نشط', () => {
    expect(tokenStatusOf({ revoked_at: null, expires_at: future })).toBe('active')
  })
})

describe('normalizePortalBrand', () => {
  it('غياب القسم كله = افتراضي آمن (show_mascot ظاهر)', () => {
    expect(normalizePortalBrand(null)).toEqual({
      name: null,
      logo_url: null,
      accent: null,
      show_mascot: true,
    })
    expect(normalizePortalBrand(undefined)).toEqual(normalizePortalBrand(null))
  })
  it('الاسم التجاري يتقدم اسم المدرس، والمسافات تُقصّ', () => {
    expect(normalizePortalBrand({ name: '  سنتر النور ', teacher_name: 'مدرس' }).name).toBe('سنتر النور')
    expect(normalizePortalBrand({ name: '  ', teacher_name: ' مدرس ' }).name).toBe('مدرس')
    expect(normalizePortalBrand({ name: null, teacher_name: null }).name).toBeNull()
  })
  it('اللهجة تُقبل بصيغة #RRGGBB فقط وتُحوَّل لحروف صغيرة', () => {
    expect(normalizePortalBrand({ accent: '#A1B2C3' }).accent).toBe('#a1b2c3')
    expect(normalizePortalBrand({ accent: 'red' }).accent).toBeNull()
    expect(normalizePortalBrand({ accent: '#12345' }).accent).toBeNull()
  })
  it('show_mascot لا يُخفى إلا بـ false صريحة', () => {
    expect(normalizePortalBrand({ show_mascot: false }).show_mascot).toBe(false)
    expect(normalizePortalBrand({ show_mascot: true }).show_mascot).toBe(true)
    expect(normalizePortalBrand({ show_mascot: null }).show_mascot).toBe(true)
  })
})

describe('buildAttMeta', () => {
  it('الشارات متطابقة بايتاً للبوابتين والتسميات من المستدعي', () => {
    const meta = buildAttMeta({ p: 'حاضر', a: 'غائب', l: 'متأخر', m: 'تعويضي' })
    expect(meta.p).toEqual({ label: 'حاضر', badge: 'bg-ok/10 text-ok border-ok/30' })
    expect(meta.a).toEqual({ label: 'غائب', badge: 'bg-bad/10 text-bad border-bad/30' })
    expect(meta.l).toEqual({ label: 'متأخر', badge: 'bg-warn/15 text-warn border-warn/40' })
    expect(meta.m).toEqual({ label: 'تعويضي', badge: 'bg-soft text-primary border-primary/30' })
  })
})

describe('normalizeOverviewHead', () => {
  it('يطبّع الحضور والرصيد والمجموعات بنفس قواعد البوابتين', () => {
    const head = normalizeOverviewHead({
      student: { name: 'طالب', code: 'S1', grade: null },
      brand: { name: 'سنتر', teacher_name: null, logo_path: null, accent: null, show_mascot: null },
      attendance_rate: '87.5',
      balance: '120',
      groups: [{ name: 'مجموعة', days: [1, 3], start_time: '16:00', room: null, links: [] }],
    })
    expect(head.student.name).toBe('طالب')
    expect(head.brand.name).toBe('سنتر')
    expect(head.attendance_rate).toBe(87.5)
    expect(head.balance).toBe(120)
    expect(head.groups).toEqual([
      { name: 'مجموعة', days: [1, 3], start_time: '16:00', room: null, links: [] },
    ])
  })
  it('حضور غائب = null ومجموعات غائبة = []', () => {
    const head = normalizeOverviewHead({
      student: { name: 'ط', code: 'S', grade: null },
      attendance_rate: null,
      balance: undefined,
      groups: null,
    })
    expect(head.attendance_rate).toBeNull()
    expect(head.balance).toBe(0)
    expect(head.groups).toEqual([])
  })
})
