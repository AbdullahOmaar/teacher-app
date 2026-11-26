import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateAlert } from './UpdateAlert'
import { markStaleClient, resetStaleClientForTests } from '../lib/staleClient'

// ألرت التحديث (3A-903): يختبئ تماماً قبل رفع الإشارة، وبعدها ثابت
// بلا أي زر إغلاق، وضغط زره يشغّل إجراء التحديث القسري مرة واحدة
const { forceClientUpdate } = vi.hoisted(() => ({
  forceClientUpdate: vi.fn(async (): Promise<void> => {}),
}))
vi.mock('../lib/versionGuard', () => ({ forceClientUpdate }))

describe('UpdateAlert — ألرت التحديث الثابت', () => {
  beforeEach(() => {
    resetStaleClientForTests()
    forceClientUpdate.mockClear()
  })
  afterEach(() => {
    cleanup()
    resetStaleClientForTests()
  })

  it('لا يعرض شيئاً قبل كشف نسخة قديمة', () => {
    const { container } = render(<UpdateAlert />)
    expect(container).toBeEmptyDOMElement()
  })

  it('بعد رفع الإشارة: العنوان والنص والزر — وزر واحد فقط (لا إغلاق)', () => {
    render(<UpdateAlert />)
    act(() => markStaleClient())
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('فيه تحديث جديد للتطبيق')).toBeInTheDocument()
    expect(screen.getByText('حدّث دلوقتي عشان تكمل بأحدث نسخة')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveTextContent('تحديث التطبيق')
  })

  it('ضغط الزر يشغّل التحديث القسري ويعطّل الزر أثناءه', async () => {
    let release: () => void = () => {}
    forceClientUpdate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    render(<UpdateAlert />)
    act(() => markStaleClient())
    const button = screen.getByRole('button', { name: /تحديث التطبيق/ })
    fireEvent.click(button)
    expect(forceClientUpdate).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('جارٍ التحديث…')
    await act(async () => {
      release()
    })
  })
})
