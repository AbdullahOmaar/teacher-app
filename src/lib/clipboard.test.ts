import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('copyText — نسخ موحّد للحافظة (PAT-8)', () => {
  it('نجاح الكتابة يرجع true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await expect(copyText('https://example.test/x')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('https://example.test/x')
  })

  it('رفض الكتابة يرجع false بلا رمي', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    await expect(copyText('x')).resolves.toBe(false)
  })

  it('غياب واجهة الحافظة (بيئة غير آمنة) يرجع false بلا رمي', async () => {
    vi.stubGlobal('navigator', {})
    await expect(copyText('x')).resolves.toBe(false)
  })
})
