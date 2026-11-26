import { describe, expect, it, vi } from 'vitest'
import {
  fetchEffectiveEntitlements,
  mergeEntitlements,
  parseEffectiveEntitlements,
  resolveVerificationSettings,
  type OverrideInput,
} from './entitlements'
import type { PlanLimits } from './subscription'

/**
 * اختبارات التجاوزات الفردية (مهمة 18 — 0059): دالة الدمج الخالصة
 * وعقد طبقة العميل مع RPC ‏effective_entitlements وحده — لا قراءة
 * جدول مباشرة، ولا قيم مخترعة عند غياب الدالة (null فيُخفى السطر).
 */

const h = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  calls: [] as Array<{ name: string; args: unknown }>,
}))

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    rpc: (name: string, args: unknown) => {
      h.calls.push({ name, args })
      return Promise.resolve(h.result)
    },
    from: () => {
      throw new Error('entitlements api must never read tables directly')
    },
  }),
}))

function setRpc(data: unknown, error: unknown = null) {
  h.result = { data, error }
  h.calls = []
}

const BASE_LIMITS: PlanLimits = {
  maxStudents: 50,
  maxMessagesMonth: 500,
  maxStorageMb: 500,
  maxTeamMembers: 1,
  maxAiMessagesMonth: 100,
}

const NOW = new Date('2026-11-26T12:00:00Z')

describe('mergeEntitlements — التجاوز يفوز على الباقة', () => {
  it('تجاوز حد واحد يستبدل قيمة الباقة ويُسجَّل في applied', () => {
    const out = mergeEntitlements(
      BASE_LIMITS,
      [
        {
          kind: 'limit',
          key: 'max_students',
          value: 200,
          expiresAt: null,
        },
      ],
      NOW,
    )
    expect(out.limits.maxStudents).toBe(200)
    expect(out.limits.maxMessagesMonth).toBe(500)
    expect(out.applied).toEqual(['limit:max_students'])
  })

  it('تجاوزات متعددة تندمج معاً (حد + خاصية)', () => {
    const out = mergeEntitlements(
      BASE_LIMITS,
      [
        { kind: 'limit', key: 'max_students', value: 300, expiresAt: null },
        { kind: 'limit', key: 'max_team_members', value: 5, expiresAt: null },
        { kind: 'feature', key: 'whatsapp_auto', value: true, expiresAt: null },
      ],
      NOW,
    )
    expect(out.limits.maxStudents).toBe(300)
    expect(out.limits.maxTeamMembers).toBe(5)
    expect(out.features).toEqual({ whatsapp_auto: true })
    expect(out.applied).toEqual([
      'limit:max_students',
      'limit:max_team_members',
      'feature:whatsapp_auto',
    ])
  })

  it('التجاوز المنتهي يُتجاهل تماماً — الحساب يرجع لحدّ باقته', () => {
    const overrides: OverrideInput[] = [
      {
        kind: 'limit',
        key: 'max_students',
        value: 999,
        expiresAt: '2026-11-25T12:00:00Z',
      },
      {
        kind: 'feature',
        key: 'ai_assistant',
        value: true,
        expiresAt: '2026-11-26T12:00:00Z',
      },
    ]
    const out = mergeEntitlements(BASE_LIMITS, overrides, NOW)
    expect(out.limits.maxStudents).toBe(50)
    expect(out.features).toEqual({})
    expect(out.applied).toEqual([])
  })

  it('تجاوز خاصية off يطفئ العلم صراحةً', () => {
    const out = mergeEntitlements(
      BASE_LIMITS,
      [
        {
          kind: 'feature',
          key: 'online_payments',
          value: false,
          expiresAt: null,
        },
      ],
      NOW,
    )
    expect(out.features).toEqual({ online_payments: false })
    expect(out.applied).toEqual(['feature:online_payments'])
  })

  it('حد null = بلا حد، والقيم المشوّهة والمفاتيح الغريبة تُتجاهل', () => {
    const out = mergeEntitlements(
      BASE_LIMITS,
      [
        { kind: 'limit', key: 'max_students', value: null, expiresAt: null },
        { kind: 'limit', key: 'max_students', value: -3, expiresAt: null },
        { kind: 'limit', key: 'not_a_key', value: 9, expiresAt: null },
        { kind: 'feature', key: 'whatsapp_auto', value: 'yes' as never, expiresAt: null },
      ],
      NOW,
    )
    expect(out.limits.maxStudents).toBeNull()
    expect(out.features).toEqual({})
    expect(out.applied).toEqual(['limit:max_students'])
  })
})

describe('parseEffectiveEntitlements — تحويل حمولة RPC بأمان', () => {
  it('يحوّل حمولة كاملة', () => {
    expect(
      parseEffectiveEntitlements({
        teacher_id: 't-1',
        plan_slug: 'trial',
        status: 'active',
        trial_ends_at: null,
        limits: { max_students: 200, max_messages_month: 500, max_storage_mb: 500, max_team_members: 1, max_ai_messages_month: 100 },
        features: { whatsapp_auto: true },
        overrides_applied: ['limit:max_students', 'feature:whatsapp_auto'],
      }),
    ).toEqual({
      teacherId: 't-1',
      planSlug: 'trial',
      status: 'active',
      trialEndsAt: null,
      limits: {
        maxStudents: 200,
        maxMessagesMonth: 500,
        maxStorageMb: 500,
        maxTeamMembers: 1,
        maxAiMessagesMonth: 100,
      },
      features: { whatsapp_auto: true },
      verification: { required: false, channels: [] },
      overridesApplied: ['limit:max_students', 'feature:whatsapp_auto'],
    })
  })

  it('يشتق إعدادات التأكيد من خصائص الحمولة', () => {
    const out = parseEffectiveEntitlements({
      teacher_id: 't-1',
      plan_slug: 'pro',
      status: 'active',
      trial_ends_at: null,
      limits: { max_students: 1000, max_messages_month: 10000, max_storage_mb: 10240, max_team_members: 10, max_ai_messages_month: 5000 },
      features: {
        verification_required: true,
        verification_channel_whatsapp: true,
        verification_channel_email: true,
      },
      overrides_applied: [
        'feature:verification_required',
        'feature:verification_channel_whatsapp',
        'feature:verification_channel_email',
      ],
    })
    expect(out?.verification).toEqual({
      required: true,
      channels: ['email', 'whatsapp'],
    })
  })

  it('null عند غياب الصف أو تشوّه الحدود', () => {
    expect(parseEffectiveEntitlements(null)).toBeNull()
    expect(parseEffectiveEntitlements({ teacher_id: 't-1' })).toBeNull()
    expect(
      parseEffectiveEntitlements({
        teacher_id: 't-1',
        plan_slug: 'trial',
        limits: 'garbage',
      }),
    ).toBeNull()
  })
})

describe('resolveVerificationSettings — اشتقاق إعدادات التأكيد (3A-905)', () => {
  it('الافتراضي بلا أي تجاوز: النظام مقفول', () => {
    expect(resolveVerificationSettings({})).toEqual({
      required: false,
      channels: [],
    })
  })

  it('مطلوب + قناتان مفعّلتان؛ المفتاح false والمفتاح الغائب يُتجاهلان', () => {
    expect(
      resolveVerificationSettings({
        verification_required: true,
        verification_channel_whatsapp: true,
        verification_channel_email: true,
        verification_channel_sms: false,
      }),
    ).toEqual({ required: true, channels: ['email', 'whatsapp'] })
  })

  it('قناة بلا إلزام: القناة تُشتق وحدها وrequired يبقى false', () => {
    expect(
      resolveVerificationSettings({ verification_channel_sms: true }),
    ).toEqual({ required: false, channels: ['sms'] })
  })

  it('تجاوز منتهٍ لا يفعّل التأكيد — الدمج أولاً ثم الاشتقاق', () => {
    const merged = mergeEntitlements(
      BASE_LIMITS,
      [
        {
          kind: 'feature',
          key: 'verification_required',
          value: true,
          expiresAt: '2026-11-20T00:00:00Z',
        },
        {
          kind: 'feature',
          key: 'verification_channel_whatsapp',
          value: true,
          expiresAt: null,
        },
      ],
      NOW,
    )
    expect(merged.applied).toEqual(['feature:verification_channel_whatsapp'])
    expect(resolveVerificationSettings(merged.features)).toEqual({
      required: false,
      channels: ['whatsapp'],
    })
  })

  it('تجاوز نشط يفوز ويُسجَّل في applied', () => {
    const merged = mergeEntitlements(
      BASE_LIMITS,
      [
        {
          kind: 'feature',
          key: 'verification_required',
          value: true,
          expiresAt: null,
        },
      ],
      NOW,
    )
    expect(merged.applied).toEqual(['feature:verification_required'])
    expect(resolveVerificationSettings(merged.features).required).toBe(true)
  })
})

describe('fetchEffectiveEntitlements — عقد RPC', () => {
  it('يستدعي effective_entitlements بمعامل مساحة العمل', async () => {
    setRpc({
      teacher_id: 't-1',
      plan_slug: 'trial',
      status: 'trial',
      trial_ends_at: null,
      limits: { max_students: 50, max_messages_month: 500, max_storage_mb: 500, max_team_members: 1, max_ai_messages_month: 100 },
      features: {},
      overrides_applied: [],
    })
    const out = await fetchEffectiveEntitlements('t-1')
    expect(out?.planSlug).toBe('trial')
    expect(h.calls).toEqual([
      { name: 'effective_entitlements', args: { p_teacher_id: 't-1' } },
    ])
  })

  it('الدالة الغائبة قبل 0059 → null بلا قيم مخترعة', async () => {
    setRpc(null, { code: '42883', message: 'function does not exist' })
    await expect(fetchEffectiveEntitlements('t-1')).resolves.toBeNull()
  })

  it('رفض التفويض يصعد ولا يُبتلع', async () => {
    setRpc(null, { code: 'P0001', message: 'not authorized' })
    await expect(fetchEffectiveEntitlements('t-1')).rejects.toMatchObject({
      message: 'not authorized',
    })
  })
})
