import { describe, expect, it, vi } from 'vitest'
import {
  fetchTeamLimitState,
  resolveTeamLimitState,
} from './teamLimits'
import type { EffectiveEntitlements } from '../platform-admin/entitlements'

/**
 * اختبارات حدّ أعضاء الفريق (T21 — 3A-896): حلّ الحدّ من
 * الاستحقاقات الفعّالة + عدد المقاعد، والفحص المسبق الودود.
 * القاعدة الذهبية: غياب الاستحقاقات (0059 غير مطبّقة) أو حدّ
 * null = الحدّ غير معروف → null (يُخفى السطر ويُتخطى الفحص)،
 * لا قيم مخترعة — والتريجر 0064 يبقى الضمان الصلب.
 */

vi.mock('../platform-admin/entitlements', () => ({
  fetchEffectiveEntitlements: vi.fn(),
}))

import { fetchEffectiveEntitlements } from '../platform-admin/entitlements'

const mockedFetch = vi.mocked(fetchEffectiveEntitlements)

function entitlementsStub(limit: number | null): EffectiveEntitlements {
  return {
    teacherId: 't-1',
    planSlug: 'basic',
    status: 'active',
    trialEndsAt: null,
    limits: {
      maxStudents: 200,
      maxMessagesMonth: 2000,
      maxStorageMb: 2048,
      maxTeamMembers: limit,
      maxAiMessagesMonth: 500,
    },
    features: {},
    settings: {},
    confirmation: { required: false, channel: null },
    verification: { required: false, channels: [] },
    overridesApplied: [],
  }
}

describe('resolveTeamLimitState — حلّ الحدّ', () => {
  it('بلا استحقاقات (0059 غير مطبّقة) يرجع null', () => {
    expect(resolveTeamLimitState(null, 0)).toBeNull()
    expect(resolveTeamLimitState(null, 5)).toBeNull()
  })

  it('حدّ null = بلا حدّ: atLimit false دائماً', () => {
    expect(resolveTeamLimitState(entitlementsStub(null), 99)).toEqual({
      used: 99,
      limit: null,
      atLimit: false,
    })
  })

  it('تحت الحدّ: atLimit false', () => {
    expect(resolveTeamLimitState(entitlementsStub(3), 2)).toEqual({
      used: 2,
      limit: 3,
      atLimit: false,
    })
  })

  it('عند الحدّ تماماً: atLimit true', () => {
    expect(resolveTeamLimitState(entitlementsStub(1), 1)).toEqual({
      used: 1,
      limit: 1,
      atLimit: true,
    })
  })

  it('فوق الحدّ: atLimit true (لا يمكن أن يحدث عبر الواجهة — التريجر يمنعه)', () => {
    expect(resolveTeamLimitState(entitlementsStub(3), 4)).toEqual({
      used: 4,
      limit: 3,
      atLimit: true,
    })
  })

  it('حدّ صفر: أي عضو يعني بلوغ الحدّ', () => {
    expect(resolveTeamLimitState(entitlementsStub(0), 0)).toEqual({
      used: 0,
      limit: 0,
      atLimit: true,
    })
  })
})

describe('fetchTeamLimitState — الاستحقاقات + المقاعد', () => {
  it('يجمع الاستحقاقات الفعّالة مع عدد المقاعد المشغولة', async () => {
    mockedFetch.mockResolvedValue(entitlementsStub(3))
    await expect(fetchTeamLimitState('t-1', 2)).resolves.toEqual({
      used: 2,
      limit: 3,
      atLimit: false,
    })
    expect(mockedFetch).toHaveBeenCalledWith('t-1')
  })

  it('استحقاقات null تعني الحدّ غير معروف → null', async () => {
    mockedFetch.mockResolvedValue(null)
    await expect(fetchTeamLimitState('t-1', 2)).resolves.toBeNull()
  })
})
