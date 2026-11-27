import { describe, expect, it, vi } from 'vitest'
import { fetchAiUsage, parseAiUsageEntry } from './aiUsage'

const h = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  calls: [] as string[],
}))

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    rpc: (name: string) => {
      h.calls.push(name)
      return Promise.resolve(h.result)
    },
  }),
}))

function setRpc(data: unknown, error: unknown = null) {
  h.result = { data, error }
  h.calls = []
}

describe('parseAiUsageEntry', () => {
  it('parses limit and used from a well-formed entry', () => {
    expect(parseAiUsageEntry({ limit: 100, used: 37 })).toEqual({ limit: 100, used: 37 })
  })

  it('treats a null limit as unlimited', () => {
    expect(parseAiUsageEntry({ limit: null, used: 5 })).toEqual({ limit: null, used: 5 })
  })

  it('falls back to unlimited/zero for malformed values instead of crashing', () => {
    expect(parseAiUsageEntry({ limit: 'x', used: -3 })).toEqual({ limit: null, used: 0 })
    expect(parseAiUsageEntry(null)).toEqual({ limit: null, used: 0 })
    expect(parseAiUsageEntry('junk')).toEqual({ limit: null, used: 0 })
  })
})

describe('fetchAiUsage — tolerant usage_summary read', () => {
  it('returns only the ai_messages_month entry', async () => {
    setRpc({
      teacher_id: 't-1',
      ai_messages_month: { limit: 500, used: 12 },
      students: { limit: 50, used: 3 },
    })
    await expect(fetchAiUsage('t-1')).resolves.toEqual({ limit: 500, used: 12 })
    expect(h.calls).toEqual(['usage_summary'])
  })

  it('returns null when the RPC is missing (pre-freeze — the line hides)', async () => {
    setRpc(null, { code: 'PGRST202', message: 'function does not exist' })
    await expect(fetchAiUsage('t-1')).resolves.toBe(null)
  })

  it('rethrows any other error instead of hiding it', async () => {
    setRpc(null, { code: '42501', message: 'permission denied' })
    await expect(fetchAiUsage('t-1')).rejects.toMatchObject({ code: '42501' })
  })
})
