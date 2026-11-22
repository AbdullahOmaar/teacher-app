import { describe, expect, it, vi } from 'vitest'
import type { OnlineExamTokenRow } from '../../types/database'
import { examTokenStatus } from './api'

const token = (overrides: Partial<OnlineExamTokenRow>): OnlineExamTokenRow => ({
  id: 'tok1',
  teacher_id: 't1',
  exam_id: 'e1',
  expires_at: null,
  revoked_at: null,
  last_used_at: null,
  created_at: '2026-11-01T00:00:00.000Z',
  ...overrides,
})

describe('examTokenStatus — حالة رابط الامتحان للعرض', () => {
  it('بلا انتهاء ولا إلغاء = نشط', () => {
    expect(examTokenStatus(token({}))).toBe('active')
  })

  it('انتهاء في المستقبل = نشط', () => {
    expect(
      examTokenStatus(token({ expires_at: new Date(Date.now() + 3_600_000).toISOString() })),
    ).toBe('active')
  })

  it('انتهاء في الماضي = منتهٍ', () => {
    expect(
      examTokenStatus(token({ expires_at: new Date(Date.now() - 1000).toISOString() })),
    ).toBe('expired')
  })

  it('لحظة الانتهاء نفسها = منتهٍ (المقارنة <= الآن)', () => {
    // تثبيت الزمن: بدونه يتقدم Date.now() داخل الدالة بضعة ms فينجح
    // الاختبار مع `<` أيضًا ولا يثبّت الحدودية فعليًا.
    vi.useFakeTimers()
    try {
      const frozen = new Date('2030-06-15T12:00:00.000Z')
      vi.setSystemTime(frozen)
      expect(examTokenStatus(token({ expires_at: frozen.toISOString() }))).toBe('expired')
    } finally {
      vi.useRealTimers()
    }
  })

  it('ملغى صراحة = ملغى حتى لو لم ينتهِ وقته', () => {
    expect(
      examTokenStatus(
        token({
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          revoked_at: '2026-11-20T10:00:00.000Z',
        }),
      ),
    ).toBe('revoked')
  })

  it('الإلغاء يغلب الانتهاء أيضاً (ملغى ومنتهٍ معاً = ملغى)', () => {
    expect(
      examTokenStatus(
        token({
          expires_at: new Date(Date.now() - 1000).toISOString(),
          revoked_at: '2026-11-20T10:00:00.000Z',
        }),
      ),
    ).toBe('revoked')
  })
})
