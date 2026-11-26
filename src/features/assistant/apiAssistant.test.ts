import { describe, expect, it } from 'vitest'
import { AssistantError, statusErrorKind } from './apiAssistant'

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

  it('maps 403 to the forbidden message', () => {
    expect(new AssistantError(403, null).message).toBe('ما عندكش صلاحية للإجراء ده.')
  })

  it('falls back to the generic message for unknown failures', () => {
    expect(new AssistantError(0, null).message).toBe('حصلت مشكلة — حاول تاني.')
    expect(new AssistantError(500, 'weird_code').message).toBe('حصلت مشكلة — حاول تاني.')
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
