import { describe, expect, it, vi } from 'vitest'
import {
  fetchMySubscription,
  parsePlanLimits,
  parseSubscription,
} from './subscription'

/**
 * اختبارات الباقات والاشتراكات (مهمة 19 — 0058): عقد طبقة العميل
 * مع RPC ‏my_subscription وحده — لا قراءة جدول مباشرة، ولا باقة
 * افتراضية مخترعة عند غياب الدالة (null فتُخفى البطاقة).
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
      throw new Error('subscription api must never read tables directly')
    },
  }),
}))

function setRpc(data: unknown, error: unknown = null) {
  h.result = { data, error }
  h.calls = []
}

describe('parsePlanLimits — تحويل حدود jsonb بأمان', () => {
  it('يحوّل مفاتيح snake_case إلى شكل العميل', () => {
    expect(
      parsePlanLimits({
        max_students: 50,
        max_messages_month: 500,
        max_storage_mb: 500,
        max_team_members: 1,
        max_ai_messages_month: 100,
      }),
    ).toEqual({
      maxStudents: 50,
      maxMessagesMonth: 500,
      maxStorageMb: 500,
      maxTeamMembers: 1,
      maxAiMessagesMonth: 100,
    })
  })

  it('null في أي حد = بلا حد، والقيم الغائبة/المشوّهة تسقط إلى null', () => {
    expect(
      parsePlanLimits({ max_students: null, max_messages_month: 'x' }),
    ).toEqual({
      maxStudents: null,
      maxMessagesMonth: null,
      maxStorageMb: null,
      maxTeamMembers: null,
      maxAiMessagesMonth: null,
    })
    expect(parsePlanLimits(null)).toBeNull()
    expect(parsePlanLimits('trial')).toBeNull()
  })

  it('الأعداد الكسرية تُقرَّب لأسفل والسالبة تُرفض', () => {
    expect(parsePlanLimits({ max_students: 3.9 })?.maxStudents).toBe(3)
    expect(parsePlanLimits({ max_students: -5 })?.maxStudents).toBeNull()
  })
})

describe('parseSubscription — تحويل حمولة my_subscription بأمان', () => {
  const base = {
    teacher_id: 't-1',
    plan_slug: 'trial',
    plan_name: 'تجريبي',
    is_pilot: false,
    status: 'active',
    trial_ends_at: null,
    limits: { max_students: 50 },
  }

  it('يحوّل الصف الكامل إلى شكل العميل', () => {
    expect(parseSubscription(base)).toEqual({
      teacherId: 't-1',
      planSlug: 'trial',
      planName: 'تجريبي',
      isPilot: false,
      status: 'active',
      trialEndsAt: null,
      limits: {
        maxStudents: 50,
        maxMessagesMonth: null,
        maxStorageMb: null,
        maxTeamMembers: null,
        maxAiMessagesMonth: null,
      },
    })
  })

  it('null عند غياب الصف أو تشوّهه — بلا باقة مخترعة', () => {
    expect(parseSubscription(null)).toBeNull()
    expect(parseSubscription({})).toBeNull()
    expect(parseSubscription({ ...base, teacher_id: '' })).toBeNull()
    expect(parseSubscription({ ...base, plan_slug: '' })).toBeNull()
  })

  it('اسم باقة غائب يسقط إلى الـ slug، وحالة غير معروفة تسقط إلى trial', () => {
    const row = parseSubscription({
      ...base,
      plan_name: '',
      status: 'weird',
      trial_ends_at: '2026-12-31T00:00:00Z',
    })
    expect(row?.planName).toBe('trial')
    expect(row?.status).toBe('trial')
    expect(row?.trialEndsAt).toBe('2026-12-31T00:00:00Z')
  })
})

describe('fetchMySubscription — اشتراك مساحة العمل عبر RPC', () => {
  it('ينادي my_subscription بمعامل مساحة العمل ويحوّل حمولتها', async () => {
    setRpc({
      teacher_id: 't-1',
      plan_slug: 'pro',
      plan_name: 'احترافي',
      is_pilot: false,
      status: 'active',
      trial_ends_at: null,
      limits: { max_students: 1000 },
    })
    const row = await fetchMySubscription('t-1')
    expect(row?.planSlug).toBe('pro')
    expect(row?.limits.maxStudents).toBe(1000)
    expect(h.calls).toEqual([
      { name: 'my_subscription', args: { p_teacher_id: 't-1' } },
    ])
  })

  it('الدالة الغائبة (قبل 0058) ترجع null — البطاقة تُخفى لا تُخترع', async () => {
    setRpc(null, {
      message: 'function my_subscription(uuid) does not exist',
      code: '42883',
    })
    await expect(fetchMySubscription('t-1')).resolves.toBeNull()
  })

  it('أي خطأ آخر يصعد كما هو (لا ابتلاع ولا افتراض باقة)', async () => {
    const err = { message: 'not authorized', code: 'P0001' }
    setRpc(null, err)
    await expect(fetchMySubscription('t-1')).rejects.toBe(err)
  })
})
