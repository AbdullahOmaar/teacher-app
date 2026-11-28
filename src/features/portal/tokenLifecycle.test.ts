import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GUARDIAN_SECTION_KEYS,
  STUDENT_SECTION_KEYS,
  TOKEN_TTL_DAYS,
  TTL_PRESET_DAYS,
  buildAttMeta,
  clampTtlDays,
  createTokenLink,
  normalizeOverviewHead,
  normalizePortalBrand,
  normalizeSections,
  num,
  tokenExpiresAt,
  tokenStatusOf,
} from './tokenLifecycle'

// اختبارات الوحدة المشتركة لدورة حياة التوكن (COD-3 / 3A-362) —
// دوال نقية + createTokenLink بعميل قاعدة مُحاكى؛ باقي مسارات قاعدة
// البيانات تُغطّى باختبارات التفويض.

// عميل Supabase مُحاكى: يسجّل الإدراجات وأي محاولة تحديث (إبطال) —
// قلب اختبار إصلاح 2026-11-28 هو إثبات غياب التحديث تماماً.
const h = vi.hoisted(() => ({
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  updates: [] as { table: string }[],
  insertError: null as unknown,
}))

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        h.inserts.push({ table, row })
        return Promise.resolve({ error: h.insertError })
      },
      update: () => {
        h.updates.push({ table })
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.is = () => Promise.resolve({ error: null })
        return chain
      },
    }),
  }),
}))

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
      {
        name: 'مجموعة',
        days: [1, 3],
        start_time: '16:00',
        // بلا slots من الخادم: تُشتق من الأيام/الوقت (مدة العرض الاحتياطية 60)
        slots: [
          { day: 1, start_time: '16:00', duration_minutes: 60 },
          { day: 3, start_time: '16:00', duration_minutes: 60 },
        ],
        room: null,
        links: [],
      },
    ])
  })
  it('مواعيد الخادم الكاملة (0071) تُقرأ كما هي — أوقات مختلفة لكل يوم', () => {
    const head = normalizeOverviewHead({
      student: { name: 'ط', code: 'S', grade: null },
      groups: [
        {
          name: 'مجموعة',
          days: [6, 1],
          start_time: '12:00',
          room: null,
          links: [],
          slots: [
            { day: 6, start_time: '12:00:00', duration_minutes: 60 },
            { day: 1, start_time: '16:00', duration_minutes: 90 },
          ],
        },
      ],
    })
    expect(head.groups[0].slots).toEqual([
      { day: 6, start_time: '12:00', duration_minutes: 60 },
      { day: 1, start_time: '16:00', duration_minutes: 90 },
    ])
  })
  it('has_invoices: false الصريحة وحدها تعني «لا فواتير» — الغياب/ null = توجد (3A-925)', () => {
    const base = { student: { name: 'ط', code: 'S', grade: null } }
    expect(normalizeOverviewHead({ ...base, has_invoices: false }).has_invoices).toBe(false)
    expect(normalizeOverviewHead({ ...base, has_invoices: true }).has_invoices).toBe(true)
    expect(normalizeOverviewHead({ ...base, has_invoices: null }).has_invoices).toBe(true)
    expect(normalizeOverviewHead(base).has_invoices).toBe(true)
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

describe('clampTtlDays (3A-385)', () => {
  it('يمرر المدد الصحيحة كما هي ويقرّب الكسور لأسفل', () => {
    expect(clampTtlDays(7)).toBe(7)
    expect(clampTtlDays(30)).toBe(30)
    expect(clampTtlDays(365)).toBe(365)
    expect(clampTtlDays(45.9)).toBe(45)
    expect(clampTtlDays('90')).toBe(90)
  })
  it('يحبس القيم خارج 1..365 عند الحدين (مطابق لفحص 0037)', () => {
    expect(clampTtlDays(0)).toBe(1)
    expect(clampTtlDays(-5)).toBe(1)
    expect(clampTtlDays(366)).toBe(365)
    expect(clampTtlDays(10000)).toBe(365)
  })
  it('القيم الفاسدة تسقط للافتراضي 30', () => {
    expect(clampTtlDays('abc')).toBe(30)
    expect(clampTtlDays(null)).toBe(30)
    expect(clampTtlDays(undefined)).toBe(30)
    expect(clampTtlDays(Number.NaN)).toBe(30)
  })
  it('المقترحات الجاهزة داخل النطاق وتصاعدية', () => {
    expect([...TTL_PRESET_DAYS]).toEqual([7, 30, 90, 180, 365])
    for (const d of TTL_PRESET_DAYS) expect(clampTtlDays(d)).toBe(d)
  })
})

describe('tokenExpiresAt (3A-385)', () => {
  it('يضيف المدة المضبوطة على لحظة الإنشاء', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z')
    expect(tokenExpiresAt(30, now)).toBe('2026-01-31T00:00:00.000Z')
    expect(tokenExpiresAt(7, now)).toBe('2026-01-08T00:00:00.000Z')
    expect(tokenExpiresAt(0, now)).toBe('2026-01-02T00:00:00.000Z')
  })
})

describe('normalizeSections (3A-385)', () => {
  it('غياب الخريطة كلها = كل الأقسام ظاهرة (توافق خلفي)', () => {
    expect(normalizeSections(undefined, GUARDIAN_SECTION_KEYS)).toEqual({
      attendance: true,
      scores: true,
      notes: true,
      money: true,
      groups: true,
    })
    expect(normalizeSections(null, STUDENT_SECTION_KEYS)).toEqual({
      schedule: true,
      homework: true,
      grades: true,
      money: true,
    })
  })
  it('false الصريحة وحدها تُخفي — أي قيمة أخرى = ظاهر', () => {
    const s = normalizeSections(
      { money: false, scores: 0, notes: 'false', groups: null },
      GUARDIAN_SECTION_KEYS,
    )
    expect(s.money).toBe(false)
    expect(s.scores).toBe(true)
    expect(s.notes).toBe(true)
    expect(s.groups).toBe(true)
    expect(s.attendance).toBe(true)
  })
  it('قيم غير كائن تُهمل بأمان', () => {
    expect(normalizeSections('money', STUDENT_SECTION_KEYS).money).toBe(true)
    expect(normalizeSections(42, STUDENT_SECTION_KEYS).grades).toBe(true)
  })
})

describe('createTokenLink — التوليد إضافي ولا يُبطل القائم (إصلاح 2026-11-28)', () => {
  beforeEach(() => {
    h.inserts = []
    h.updates = []
    h.insertError = null
  })

  const baseInput = {
    teacherId: 'teacher-1',
    studentId: 'student-1',
    generateRawToken: () => 'raw-token-abc',
    sha256Hex: async (text: string) => `hash:${text}`,
    buildLink: (raw: string) => `https://example.test/student-portal?t=${raw}`,
  }

  it('يُدرج رابطاً جديداً بالهاش فقط — ولا يُصدر أي تحديث إبطال على الجدول', async () => {
    const before = Date.now()
    const res = await createTokenLink({ ...baseInput, table: 'student_access_tokens' })
    const after = Date.now()

    expect(res.link).toBe('https://example.test/student-portal?t=raw-token-abc')
    expect(h.updates).toEqual([])
    expect(h.inserts).toHaveLength(1)
    expect(h.inserts[0].table).toBe('student_access_tokens')
    expect(h.inserts[0].row.teacher_id).toBe('teacher-1')
    expect(h.inserts[0].row.student_id).toBe('student-1')
    expect(h.inserts[0].row.token_hash).toBe('hash:raw-token-abc')
    const exp = new Date(h.inserts[0].row.expires_at as string).getTime()
    expect(exp).toBeGreaterThanOrEqual(before + 29.9 * 24 * 3600 * 1000)
    expect(exp).toBeLessThanOrEqual(after + 30.1 * 24 * 3600 * 1000)
    expect(res.expiresAt).toBe(h.inserts[0].row.expires_at)
  })

  it('مدة المدرس المخصصة وأعمدة الإدراج الزائدة تمر كما هي (بوابة ولي الأمر)', async () => {
    const before = Date.now()
    await createTokenLink({
      ...baseInput,
      table: 'guardian_access_tokens',
      ttlDays: 7,
      extraInsert: { guardian_id: 'guardian-9' },
    })
    expect(h.updates).toEqual([])
    expect(h.inserts).toHaveLength(1)
    expect(h.inserts[0].row.guardian_id).toBe('guardian-9')
    const exp = new Date(h.inserts[0].row.expires_at as string).getTime()
    expect(exp).toBeGreaterThanOrEqual(before + 6.9 * 24 * 3600 * 1000)
    expect(exp).toBeLessThanOrEqual(Date.now() + 7.1 * 24 * 3600 * 1000)
  })

  it('خطأ الإدراج ينتشر للمستدعي ولا يُبتلع', async () => {
    h.insertError = new Error('insert failed')
    await expect(
      createTokenLink({ ...baseInput, table: 'student_access_tokens' }),
    ).rejects.toThrow('insert failed')
    expect(h.updates).toEqual([])
  })
})
