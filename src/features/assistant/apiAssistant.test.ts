import { describe, expect, it, vi } from 'vitest'
import {
  AssistantError,
  fetchAssistantPermissions,
  fetchAssistantStatus,
  statusErrorKind,
} from './apiAssistant'

/**
 * محاكاة استدعاء الدالة: invoke ترجع الحمولة المضبوطة في h.result،
 * وتسجّل فعل كل نداء في h.calls.
 */
const h = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  calls: [] as string[],
}))

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    functions: {
      invoke: (_name: string, opts: { body: Record<string, unknown> }) => {
        h.calls.push(String(opts.body.action ?? ''))
        return Promise.resolve(h.result)
      },
    },
  }),
}))

function setInvoke(data: unknown, error: unknown = null) {
  h.result = { data, error }
  h.calls = []
}

describe('AssistantError message mapping', () => {
  it('maps 503 to the honest disabled message', () => {
    const err = new AssistantError(503, null)
    expect(err.status).toBe(503)
    expect(err.message).toBe('المساعد مطفأ حالياً من المنصة.')
  })

  it('maps a missing provider key to the no-key message', () => {
    expect(new AssistantError(0, 'no_api_key').message).toBe(
      'لسه ما أضفتش مفتاح مزوّد — أضفه من الإعدادات عشان المساعد يشتغل.',
    )
  })

  it('maps 429 limit_reached to the AI-limit message', () => {
    expect(new AssistantError(429, 'limit_reached').message).toBe(
      'وصلت لحد رسائل الذكاء في باقتك الشهر ده — راجع باقتك أو اطلب ترقية من المنصة.',
    )
  })

  it('maps 403 to the forbidden message', () => {
    expect(new AssistantError(403, null).message).toBe('ما عندكش صلاحية للإجراء ده.')
  })

  it('falls back to the generic message for unknown failures', () => {
    expect(new AssistantError(0, null).message).toBe('حصلت مشكلة — حاول تاني.')
    expect(new AssistantError(500, 'weird_code').message).toBe('حصلت مشكلة — حاول تاني.')
  })
})

describe('fetchAssistantStatus — key_source', () => {
  it('returns byok when the teacher key is the active one', async () => {
    setInvoke({ enabled: true, has_key: true, provider: 'openai', key_source: 'byok' })
    const status = await fetchAssistantStatus('t-1')
    expect(status.key_source).toBe('byok')
    expect(status.has_key).toBe(true)
    expect(status.provider).toBe('openai')
    expect(h.calls).toEqual(['status'])
  })

  it('returns platform when the platform key is the active one', async () => {
    setInvoke({ enabled: true, has_key: true, provider: 'openai', key_source: 'platform' })
    const status = await fetchAssistantStatus('t-1')
    expect(status.key_source).toBe('platform')
    expect(status.has_key).toBe(true)
  })

  it('returns null key_source for an unknown value (never invents one)', async () => {
    setInvoke({ enabled: false, has_key: false, provider: null, key_source: 'weird' })
    const status = await fetchAssistantStatus('t-1')
    expect(status.key_source).toBe(null)
    expect(status.has_key).toBe(false)
  })
})

describe('fetchAssistantPermissions — matrix parsing', () => {
  it('returns the three groups as published by the function', async () => {
    setInvoke({
      matrix: {
        reads: [{ tool: 'unpaid_students', description: 'قراءة: المتأخرون' }],
        direct: [{ tool: 'unpaid_students', description: 'قراءة: المتأخرون' }],
        confirm: [{ tool: 'add_student', description: 'إجراء: إضافة طالب' }],
      },
    })
    const matrix = await fetchAssistantPermissions('t-1')
    expect(matrix.reads).toHaveLength(1)
    expect(matrix.direct).toHaveLength(1)
    expect(matrix.confirm).toHaveLength(1)
    expect(matrix.confirm[0].tool).toBe('add_student')
    expect(h.calls).toEqual(['permissions'])
  })

  it('drops malformed entries instead of breaking the render', async () => {
    setInvoke({
      matrix: {
        reads: [{ tool: 'unpaid_students' }, 'junk', { tool: 'x', description: 'قراءة' }],
        direct: [],
        confirm: null,
      },
    })
    const matrix = await fetchAssistantPermissions('t-1')
    expect(matrix.reads).toHaveLength(1)
    expect(matrix.confirm).toEqual([])
  })
})

describe('statusErrorKind', () => {
  it('classifies a 503 status error as disabled', () => {
    expect(statusErrorKind(new AssistantError(503, null))).toBe('disabled')
  })

  it('classifies a context-less failure (status 0, e.g. blocked CORS preflight) as network', () => {
    expect(statusErrorKind(new AssistantError(0, null))).toBe('network')
  })

  it('classifies other failures as generic', () => {
    expect(statusErrorKind(new AssistantError(403, null))).toBe('generic')
    expect(statusErrorKind(new Error('boom'))).toBe('generic')
    expect(statusErrorKind(null)).toBe('generic')
    expect(statusErrorKind(undefined)).toBe('generic')
  })
})
