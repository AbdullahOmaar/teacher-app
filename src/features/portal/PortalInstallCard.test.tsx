import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PortalInstallCard } from './PortalInstallCard'

// بطاقة تثبيت البوابة (ملاحظة المالك 2026-11-28): زر حقيقي عند توفر
// عرض التثبيت، إرشاد يدوي مصمم عند غيابه (لا زر ميت)، وتأكيد حالة
// عند التثبيت — عبر محاكاة hook التثبيت القائم نفسه
const state = {
  canPrompt: true,
  isInstalled: false,
  promptInstall: vi.fn(async () => 'accepted' as const),
}
vi.mock('../../lib/installPrompt', () => ({
  useInstallPrompt: () => state,
}))

describe('PortalInstallCard — تثبيت التطبيق في البوابة', () => {
  afterEach(() => {
    cleanup()
  })
  beforeEach(() => {
    state.canPrompt = true
    state.isInstalled = false
    state.promptInstall.mockClear()
  })

  it('زر تثبيت يعمل عندما يعرض المتصفح التثبيت', async () => {
    render(<PortalInstallCard />)
    fireEvent.click(screen.getByRole('button', { name: /تثبيت التطبيق على الجهاز/ }))
    expect(state.promptInstall).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(screen.getByText(/التطبيق بيُثبّت على جهازك دلوقتي/)).toBeTruthy()
    })
  })

  it('لا زر ميت عند غياب عرض التثبيت — إرشاد يدوي مصمم بدلاً منه', () => {
    state.canPrompt = false
    render(<PortalInstallCard />)
    expect(screen.queryByRole('button', { name: /تثبيت التطبيق على الجهاز/ })).toBeNull()
    expect(screen.getByText(/إضافة إلى الشاشة الرئيسية/)).toBeTruthy()
  })

  it('تأكيد حالة عندما يكون التطبيق مثبّتاً', () => {
    state.isInstalled = true
    render(<PortalInstallCard />)
    expect(screen.getByText(/التطبيق مثبّت على جهازك/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /تثبيت التطبيق على الجهاز/ })).toBeNull()
  })
})
