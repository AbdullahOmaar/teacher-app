import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  reactivateTeamMember,
  suspendTeamMember,
  translateDbError,
} from './api'
import { t } from '../../i18n'

/**
 * اختبارات إيقاف/تفعيل أعضاء الفريق (T21 — 3A-896) + ترجمة رفع
 * حدّ الفريق من التريجر 0064.
 *
 * العقد: الإيقاف يحدّث status إلى suspended مقيّداً بالفعّال فقط
 * (الدعوة المعلّقة تُلغى لا تُوقَف)، والتفعيل يعيد active مقيّداً
 * بالموقوف فقط، وكلا الفعلين يسجّل حدثاً في سجل النشاط. سياسات
 * المساعد في RLS تشترط status='active'، فالإيقاف يقطع الوصول
 * خادمياً فوراً بلا أي تغيير في السياسات.
 */

const h = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  updateError: null as { code?: string; message?: string } | null,
  calls: [] as { op: string; table: string; payload?: unknown }[],
}))

type Chain = {
  select: (...args: unknown[]) => Chain
  eq: (col: unknown, val: unknown) => Chain
  update: (payload: unknown) => Chain
  delete: () => Chain
  insert: (payload: unknown) => Chain
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>
  single: () => Promise<{ data: unknown; error: unknown }>
  readonly error: unknown
}

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    from: (table: string) => {
      const chain = {
        select: (...args: unknown[]) => {
          h.calls.push({ op: 'select', table, payload: args })
          return chain
        },
        eq: (col: unknown, val: unknown) => {
          h.calls.push({ op: 'eq', table, payload: [col, val] })
          return chain
        },
        update: (payload: unknown) => {
          h.calls.push({ op: 'update', table, payload })
          return chain
        },
        delete: () => {
          h.calls.push({ op: 'delete', table })
          return chain
        },
        insert: (payload: unknown) => {
          h.calls.push({ op: 'insert', table, payload })
          return chain
        },
        maybeSingle: () => Promise.resolve({ data: h.row, error: null }),
        single: () => Promise.resolve({ data: h.row, error: null }),
        get error() {
          return h.updateError
        },
      } as Chain
      return chain
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}))

const logActivityMock = vi.hoisted(() => vi.fn())
vi.mock('../activity/api', () => ({
  logActivity: (...args: unknown[]) => logActivityMock(...args),
}))

const memberRow = {
  id: 'm-1',
  teacher_id: 't-1',
  user_id: '11111111-2222-3333-4444-555555555555',
  invited_email: null,
  role: 'assistant',
  permissions: { can_take_attendance: true },
  status: 'active',
  created_at: '2026-11-22T00:00:00Z',
  updated_at: '2026-11-22T00:00:00Z',
}

beforeEach(() => {
  h.row = { ...memberRow }
  h.updateError = null
  h.calls = []
  logActivityMock.mockClear()
})

describe('suspendTeamMember — إيقاف عضو فعّال', () => {
  it('يحدّث الحالة إلى suspended مقيّداً بالفعّال، ويسجّل member_suspended', async () => {
    await suspendTeamMember('t-1', 'm-1')
    const update = h.calls.find((c) => c.op === 'update')
    expect(update?.payload).toEqual({ status: 'suspended' })
    expect(h.calls).toContainEqual({
      op: 'eq',
      table: 'teacher_members',
      payload: ['status', 'active'],
    })
    expect(logActivityMock).toHaveBeenCalledWith(
      't-1',
      expect.objectContaining({ event_type: 'member_suspended', entity_id: 'm-1' }),
    )
  })

  it('خطأ القاعدة يصعد مترجماً (لا نص خام)', async () => {
    h.updateError = { code: '42501', message: 'row-level security' }
    await expect(suspendTeamMember('t-1', 'm-1')).rejects.toThrow(
      t('auth.authApiDbForbidden'),
    )
  })
})

describe('reactivateTeamMember — إعادة تفعيل موقوف', () => {
  it('يحدّث الحالة إلى active مقيّداً بالموقوف، ويسجّل member_reactivated', async () => {
    h.row = { ...memberRow, status: 'suspended' }
    await reactivateTeamMember('t-1', 'm-1')
    const update = h.calls.find((c) => c.op === 'update')
    expect(update?.payload).toEqual({ status: 'active' })
    expect(h.calls).toContainEqual({
      op: 'eq',
      table: 'teacher_members',
      payload: ['status', 'suspended'],
    })
    expect(logActivityMock).toHaveBeenCalledWith(
      't-1',
      expect.objectContaining({ event_type: 'member_reactivated', entity_id: 'm-1' }),
    )
  })
})

describe('translateDbError — رفع حدّ الفريق من التريجر 0064', () => {
  it('limit_reached:max_team_members يُترجم لرسالة عربية ودودة', () => {
    expect(
      translateDbError({
        code: 'P0001',
        message: 'limit_reached:max_team_members',
      }),
    ).toBe(t('auth.authApiTeamLimitReached'))
  })

  it('رسالة حدّ أخرى (طلاب) لا تُترجم هنا — ليست من نطاق هذه المهمة', () => {
    expect(
      translateDbError({ code: 'P0001', message: 'limit_reached:max_students' }),
    ).toBe(t('auth.authApiDbUnexpected'))
  })
})
