import { describe, expect, it, vi } from 'vitest'
import {
  checkUsageLimit,
  fetchUsageSummary,
  parseUsageCheck,
  parseUsageEntry,
  parseUsageSummary,
  usageEntryFor,
} from './usage'

/**
 * اختبارات عدّادات الاستخدام (مهمة 19 — 0062، الخطوة 5): عقد طبقة
 * العميل مع RPC ‏usage_summary / ‏check_usage_limit وحدهما — لا
 * قراءة جدول مباشرة، ولا إنفاذ مخترع عند غياب الدوال (null فيُخفى
 * العرض ويُتخطى الفحص المسبق).
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
      throw new Error('usage api must never read tables directly')
    },
  }),
}))

function setRpc(data: unknown, error: unknown = null) {
  h.result = { data, error }
  h.calls = []
}

const FULL_SUMMARY = {
  teacher_id: 't-1',
  period_month: '2026-11-01',
  students: { limit: 50, used: 42, remaining: 8, at_limit: false },
  messages_month: { limit: 500, used: 500, remaining: 0, at_limit: true },
  storage_mb: { limit: null, used: 120, remaining: null, at_limit: false },
  team_members: { limit: 1, used: 1, remaining: 0, at_limit: true },
  ai_messages_month: { limit: 100, used: 3, remaining: 97, at_limit: false },
}

describe('parseUsageEntry — تحويل مدخل واحد بأمان', () => {
  it('يحوّل حداً ومستخدماً صحيحين ويشتق المتبقي وعند الحد', () => {
    expect(
      parseUsageEntry({ limit: 50, used: 50, remaining: 0, at_limit: true }),
    ).toEqual({ limit: 50, used: 50, remaining: 0, atLimit: true })
  })

  it('null في الحد = بلا حد: المتبقي null وعند الحد false مهما كان المستخدم', () => {
    expect(parseUsageEntry({ limit: null, used: 9999 })).toEqual({
      limit: null,
      used: 9999,
      remaining: null,
      atLimit: false,
    })
  })

  it('القيم المشوّهة تسقط إلى used=0 وبلا حد بدل كسر العرض', () => {
    expect(parseUsageEntry({ limit: 'x', used: -3 })).toEqual({
      limit: null,
      used: 0,
      remaining: null,
      atLimit: false,
    })
    expect(parseUsageEntry(null)).toEqual({
      limit: null,
      used: 0,
      remaining: null,
      atLimit: false,
    })
  })

  it('لا يثق في at_limit الحمولة: يشتقها من الحد والاستخدام', () => {
    // حمولة متناقضة: at_limit=true رغم used < limit → false الصحيح
    expect(parseUsageEntry({ limit: 10, used: 2, at_limit: true })).toEqual({
      limit: 10,
      used: 2,
      remaining: 8,
      atLimit: false,
    })
  })
})

describe('parseUsageSummary — تحويل الملخص كاملاً', () => {
  it('يحوّل الملخص الكامل بكل مفاتيحه', () => {
    const out = parseUsageSummary(FULL_SUMMARY)
    expect(out?.teacherId).toBe('t-1')
    expect(out?.periodMonth).toBe('2026-11-01')
    expect(out?.students).toEqual({
      limit: 50,
      used: 42,
      remaining: 8,
      atLimit: false,
    })
    expect(out?.messagesMonth.atLimit).toBe(true)
    expect(out?.storageMb.limit).toBeNull()
    expect(out?.teamMembers.atLimit).toBe(true)
  })

  it('null عند غياب الصف أو تشوّهه (فيُخفى العرض)', () => {
    expect(parseUsageSummary(null)).toBeNull()
    expect(parseUsageSummary({})).toBeNull()
    expect(parseUsageSummary({ teacher_id: '' })).toBeNull()
  })

  it('المدخلات الغائبة تسقط إلى بلا حد بدل كسر العرض', () => {
    const out = parseUsageSummary({ teacher_id: 't-2' })
    expect(out?.students).toEqual({
      limit: null,
      used: 0,
      remaining: null,
      atLimit: false,
    })
  })
})

describe('usageEntryFor — مدخل كل مفتاح', () => {
  it('يرجع المدخل الصحيح لكل مفتاح حد', () => {
    const summary = parseUsageSummary(FULL_SUMMARY)!
    expect(usageEntryFor(summary, 'max_students').used).toBe(42)
    expect(usageEntryFor(summary, 'max_messages_month').atLimit).toBe(true)
    expect(usageEntryFor(summary, 'max_storage_mb').limit).toBeNull()
    expect(usageEntryFor(summary, 'max_team_members').used).toBe(1)
    expect(usageEntryFor(summary, 'max_ai_messages_month').used).toBe(3)
  })
})

describe('parseUsageCheck — تحويل فحص مفتاح واحد', () => {
  it('يثق في allowed الخادم أولاً', () => {
    expect(
      parseUsageCheck({
        key: 'max_students',
        allowed: false,
        limit: 50,
        used: 50,
        remaining: 0,
      }),
    ).toEqual({
      key: 'max_students',
      allowed: false,
      limit: 50,
      used: 50,
      remaining: 0,
    })
  })

  it('مفتاح غير معروف أو حمولة فارغة → null', () => {
    expect(parseUsageCheck({ key: 'nope', allowed: true })).toBeNull()
    expect(parseUsageCheck(null)).toBeNull()
  })
})

describe('fetchUsageSummary / checkUsageLimit — عقد RPC', () => {
  it('ينادي usage_summary بالمعامل الصحيح ويحوّل الحمولة', async () => {
    setRpc(FULL_SUMMARY)
    const out = await fetchUsageSummary('t-1')
    expect(h.calls).toEqual([
      { name: 'usage_summary', args: { p_teacher_id: 't-1' } },
    ])
    expect(out?.students.used).toBe(42)
  })

  it('الدالة الغائبة (PGRST202) → null لا استثناء', async () => {
    setRpc(null, { code: 'PGRST202', message: 'Could not find the function' })
    await expect(fetchUsageSummary('t-1')).resolves.toBeNull()
  })

  it('ينادي check_usage_limit بالمفتاح الصحيح', async () => {
    setRpc({ key: 'max_students', allowed: true, limit: 50, used: 42 })
    const out = await checkUsageLimit('t-1', 'max_students')
    expect(h.calls).toEqual([
      {
        name: 'check_usage_limit',
        args: { p_teacher_id: 't-1', p_key: 'max_students' },
      },
    ])
    expect(out?.allowed).toBe(true)
  })

  it('الدالة الغائبة في الفحص → null (الفحص المسبق يُتخطى)', async () => {
    setRpc(null, { code: 'PGRST202', message: 'Could not find the function' })
    await expect(checkUsageLimit('t-1', 'max_messages_month')).resolves.toBeNull()
  })
})
