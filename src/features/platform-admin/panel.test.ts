import { describe, expect, it } from 'vitest'
import {
  isOverrideActive,
  panelSectionState,
  parseAccountOverrideRow,
  parsePlatformIndicators,
  parsePlatformWorkspaces,
  whatsappSectionState,
} from './panel'

/**
 * اختبارات لوحة أدمن المنصة (مهمة 17 — 0061، الخطوة 7): عقد طبقة
 * بيانات اللوحة — المحلّلات الآمنة لحمولات jsonb، وقرارات حالة
 * الأقسام النقية («قريباً» قبل الخطأ — قاعدة مالك 2026-11-26: لا
 * خطأ خام لخاصية غير مُطلقة)، ودلالة انتهاء التجاوز.
 */

describe('parsePlatformIndicators — تحويل آمن + إيراد null قسراً', () => {
  it('يحوّل المفاتيح ويوزّع الاشتراكات على الباقات الأربع', () => {
    const out = parsePlatformIndicators({
      teachers_total: 12,
      teachers_activated: 9,
      teachers_new_7d: 2,
      teachers_new_30d: 5,
      students_total: 340,
      subscriptions_by_plan: { trial: 10, basic: 1, pro: 1, pilot: 0 },
      expected_revenue: null,
    })
    expect(out).toEqual({
      teachersTotal: 12,
      teachersActivated: 9,
      teachersNew7d: 2,
      teachersNew30d: 5,
      studentsTotal: 340,
      subscriptionsByPlan: { trial: 10, basic: 1, pro: 1, pilot: 0 },
      expectedRevenue: null,
    })
  })

  it('أي رقم إيراد راجع من الخادم يُفرض null — لا رقم قبل اعتماد الأسعار', () => {
    const out = parsePlatformIndicators({ expected_revenue: 9999 })
    expect(out.expectedRevenue).toBeNull()
  })

  it('حمولة غائبة/مشوّهة تسقط لأصفار آمنة بلا كسر', () => {
    expect(parsePlatformIndicators(null).teachersTotal).toBe(0)
    expect(parsePlatformIndicators('x').subscriptionsByPlan).toEqual({
      trial: 0,
      basic: 0,
      pro: 0,
      pilot: 0,
    })
    expect(
      parsePlatformIndicators({ subscriptions_by_plan: { pro: 3 } })
        .subscriptionsByPlan,
    ).toEqual({ trial: 0, basic: 0, pro: 3, pilot: 0 })
  })
})

describe('parsePlatformWorkspaces — صفوف آمنة وتخطي المشوّه', () => {
  it('يحوّل صفاً كاملاً إلى شكل العميل', () => {
    const out = parsePlatformWorkspaces([
      {
        teacher_id: 't1',
        display_name: 'مستر أحمد',
        owner_email: 'a@example.com',
        created_at: '2026-11-01T00:00:00Z',
        account_activated: true,
        plan_slug: 'trial',
        subscription_status: 'active',
        trial_ends_at: null,
        students_count: 42,
        last_activity_at: '2026-11-20T00:00:00Z',
      },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      teacherId: 't1',
      displayName: 'مستر أحمد',
      ownerEmail: 'a@example.com',
      accountActivated: true,
      planSlug: 'trial',
      studentsCount: 42,
      lastActivityAt: '2026-11-20T00:00:00Z',
    })
  })

  it('صف بلا teacher_id يُتخطى، وغير المصفوفة ترجع فارغة', () => {
    expect(parsePlatformWorkspaces([{ display_name: 'x' }])).toEqual([])
    expect(parsePlatformWorkspaces(null)).toEqual([])
    expect(parsePlatformWorkspaces({})).toEqual([])
  })

  it('قيم مشوّهة تسقط لآمنة: غير المفعّل افتراضياً عند غياب العلم', () => {
    const out = parsePlatformWorkspaces([
      { teacher_id: 't2', students_count: -3, plan_slug: 7 },
    ])
    expect(out[0].accountActivated).toBe(false)
    expect(out[0].studentsCount).toBe(0)
    expect(out[0].planSlug).toBeNull()
  })
})

describe('panelSectionState — «قريباً» تسبق الخطأ', () => {
  it('التحميل أولاً دائماً', () => {
    expect(
      panelSectionState({ pending: true, failed: true, missing: true }),
    ).toBe('loading')
  })

  it('البيانات الغائبة (مهاجرة غير مطبّقة) = قريباً — حتى مع وجود خطأ', () => {
    expect(
      panelSectionState({ pending: false, failed: true, missing: true }),
    ).toBe('coming-soon')
    expect(
      panelSectionState({ pending: false, failed: false, missing: true }),
    ).toBe('coming-soon')
  })

  it('خطأ ببيانات غير غائبة = خطأ مصمم، وغير ذلك جاهز', () => {
    expect(
      panelSectionState({ pending: false, failed: true, missing: false }),
    ).toBe('error')
    expect(
      panelSectionState({ pending: false, failed: false, missing: false }),
    ).toBe('ready')
  })
})

describe('whatsappSectionState — لا رقم منصة = قريباً دائماً', () => {
  it('بلا رقم مسجّل: قريباً؛ برقم: جاهز', () => {
    expect(whatsappSectionState({ platformNumberRegistered: false })).toBe(
      'coming-soon',
    )
    expect(whatsappSectionState({ platformNumberRegistered: true })).toBe(
      'ready',
    )
  })
})

describe('isOverrideActive — المنتهي تاريخ صامت', () => {
  const now = new Date('2026-11-26T12:00:00Z')

  it('بلا انتهاء = نشط؛ انتهاء مستقبلي = نشط؛ ماضٍ = منتهٍ', () => {
    expect(isOverrideActive({ expiresAt: null }, now)).toBe(true)
    expect(isOverrideActive({ expiresAt: '2026-12-01T00:00:00Z' }, now)).toBe(
      true,
    )
    expect(isOverrideActive({ expiresAt: '2026-11-01T00:00:00Z' }, now)).toBe(
      false,
    )
    expect(isOverrideActive({ expiresAt: '2026-11-26T12:00:00Z' }, now)).toBe(
      false,
    )
  })
})

describe('parseAccountOverrideRow — شكل صف التجاوز', () => {
  it('يحوّل صفاً صالحاً (خاصية وحد)', () => {
    expect(
      parseAccountOverrideRow({
        id: 'o1',
        kind: 'feature',
        key: 'whatsapp_auto',
        value: true,
        reason: 'بايلوت',
        expires_at: null,
        created_at: '2026-11-26T00:00:00Z',
      }),
    ).toMatchObject({ id: 'o1', kind: 'feature', value: true })
    expect(
      parseAccountOverrideRow({
        id: 'o2',
        kind: 'limit',
        key: 'max_students',
        value: null,
        reason: 'بايلوت',
        expires_at: null,
        created_at: '',
      })?.value,
    ).toBeNull()
  })

  it('صف مشوّه (نوع مجهول/قيمة كائن) يرجع null', () => {
    expect(
      parseAccountOverrideRow({ id: 'o3', kind: 'weird', key: 'x', value: 1 }),
    ).toBeNull()
    expect(
      parseAccountOverrideRow({
        id: 'o4',
        kind: 'limit',
        key: 'max_students',
        value: { bad: true },
      }),
    ).toBeNull()
    expect(parseAccountOverrideRow(null)).toBeNull()
  })

  it('يحوّل صف إعداد (0063) بقيمة نصية', () => {
    expect(
      parseAccountOverrideRow({
        id: 'o5',
        kind: 'setting',
        key: 'confirmation_channel',
        value: 'whatsapp',
        reason: 'قالب الطيار',
        expires_at: null,
        created_at: '2026-11-26T00:00:00Z',
      }),
    ).toMatchObject({
      id: 'o5',
      kind: 'setting',
      key: 'confirmation_channel',
      value: 'whatsapp',
    })
  })
})
