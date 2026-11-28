import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { upsertEnrollment } from './api'

/**
 * حارس الأرشفة (عيب سند الحي 2026-11-28 — الاستيراد بيتخطى حماية الأرشفة):
 * ‏upsertEnrollment كان يقبل أي تسجيل جديد بلا فحص archived_at — صف
 * استيراد واحد سجّل طالباً في مجموعة مؤرشفة رغم أن قرار 0007 يقول إن
 * المجموعة المؤرشفة «لا تظهر كخيار تسجيل جديد». هذه الاختبارات تثبت
 * العقد الجديد: الرفض برسالة عربية تسمّي المجموعة عند التسجيل الجديد،
 * والسماح عند المجموعة النشطة وعند تحديث تسجيل قائم.
 */

const h = vi.hoisted(() => ({
  /** تسجيل قائم لنفس الطالب والمجموعة — null يعني تسجيل جديد */
  existing: null as { id: string } | null,
  /** صف المجموعة — null يعني مجموعة غير موجودة/لا تخص المدرس */
  group: null as { archived_at: string | null; name: string; capacity: number | null } | null,
  enrolledCount: 0,
  upsertCalls: 0,
}))

vi.mock('../../lib/supabase', () => {
  function enrollmentsChain() {
    const chain: Record<string, unknown> = {}
    chain.select = (_cols: string, opts?: { count?: string }) => {
      ;(chain as { __countMode?: boolean }).__countMode = opts?.count === 'exact'
      return chain
    }
    chain.eq = () => chain
    chain.maybeSingle = async () => ({ data: h.existing, error: null })
    chain.upsert = () => {
      h.upsertCalls++
      return chain
    }
    chain.single = async () => ({
      data: {
        id: 'enr-1',
        teacher_id: 't1',
        student_id: 's1',
        group_id: 'g1',
        price_override: null,
        prepaid_sessions: null,
        created_at: '2026-11-28T00:00:00Z',
      },
      error: null,
    })
    // استعلام العدّ في حارس السعة يُنتظر مباشرة بلا single/maybeSingle
    chain.then = (resolve: (v: unknown) => void) => {
      resolve({ count: h.enrolledCount, error: null })
    }
    return chain
  }
  function groupsChain() {
    const chain: Record<string, unknown> = {}
    chain.select = () => chain
    chain.eq = () => chain
    chain.maybeSingle = async () => ({ data: h.group, error: null })
    return chain
  }
  return {
    db: () => ({ from: (table: string) => (table === 'groups' ? groupsChain() : enrollmentsChain()) }),
    supabase: {},
  }
})

async function catchErr(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
  } catch (e) {
    return e
  }
  throw new Error('expected the promise to reject')
}

const INPUT = { student_id: 's1', group_id: 'g1', price_override: null, prepaid_sessions: null }

beforeEach(() => {
  h.existing = null
  h.group = { archived_at: null, name: 'مجموعة نشطة', capacity: null }
  h.enrolledCount = 0
  h.upsertCalls = 0
})

describe('upsertEnrollment — حارس الأرشفة (عيب سند الحي 2026-11-28)', () => {
  it('تسجيل جديد في مجموعة مؤرشفة يُرفض برسالة تسمّي المجموعة — بلا إدراج', async () => {
    h.group = { archived_at: '2026-11-28T00:00:00Z', name: 'مجموعة مؤرشفة', capacity: null }
    const err = await catchErr(upsertEnrollment('t1', INPUT))
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe(
      t('students.enrollGroupArchived', { name: 'مجموعة مؤرشفة' }),
    )
    expect(h.upsertCalls).toBe(0)
  })

  it('تسجيل جديد في مجموعة نشطة يمرّ ويُدرج', async () => {
    const row = await upsertEnrollment('t1', INPUT)
    expect(row.id).toBe('enr-1')
    expect(h.upsertCalls).toBe(1)
  })

  it('تحديث تسجيل قائم في مجموعة مؤرشفة يمرّ (سعر خاص/حصص مسبقة)', async () => {
    h.existing = { id: 'enr-1' }
    h.group = { archived_at: '2026-11-28T00:00:00Z', name: 'مجموعة مؤرشفة', capacity: null }
    const row = await upsertEnrollment('t1', { ...INPUT, price_override: 100 })
    expect(row.id).toBe('enr-1')
    expect(h.upsertCalls).toBe(1)
  })

  it('الأرشفة تسبق السعة: مجموعة مؤرشفة وممتلئة تُرفض بسبب الأرشفة', async () => {
    h.group = { archived_at: '2026-11-28T00:00:00Z', name: 'مجموعة مؤرشفة', capacity: 1 }
    h.enrolledCount = 1
    const err = await catchErr(upsertEnrollment('t1', INPUT))
    expect((err as Error).message).toBe(
      t('students.enrollGroupArchived', { name: 'مجموعة مؤرشفة' }),
    )
    expect(h.upsertCalls).toBe(0)
  })

  it('مجموعة غير موجودة لا تُرفض بالأرشفة (مسار الإدراج نفسه يقرر)', async () => {
    h.group = null
    const row = await upsertEnrollment('t1', INPUT)
    expect(row.id).toBe('enr-1')
    expect(h.upsertCalls).toBe(1)
  })
})
