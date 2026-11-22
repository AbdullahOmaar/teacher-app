import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallButton } from './InstallButton'

// سلوك زر التثبيت الذكي (3A-317): ظهور مشروط بالقابلية، إخفاء عند التنقّل،
// عودة في جلسة جديدة — عبر محاكاة hook التثبيت القائم
const state = {
  canPrompt: true,
  isInstalled: false,
  promptInstall: vi.fn(async () => 'dismissed' as const),
}
vi.mock('../lib/installPrompt', () => ({
  useInstallPrompt: () => state,
}))

function NavProbe() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/other')}>
      انتقل
    </button>
  )
}

function renderAt() {
  // التركيب كالقشرة الحقيقية: الزر خارج <Routes> فيستمر عبر التنقّل
  return render(
    <MemoryRouter initialEntries={['/']}>
      <InstallButton />
      <Routes>
        <Route path="/" element={<NavProbe />} />
        <Route path="/other" element={<div>أخرى</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('InstallButton — سلوك ذكي', () => {
  afterEach(() => {
    cleanup()
  })
  beforeEach(() => {
    sessionStorage.clear()
    state.canPrompt = true
    state.isInstalled = false
    state.promptInstall.mockClear()
  })

  it('يظهر عندما يعرض المتصفح التثبيت والتطبيق غير مثبّت', () => {
    renderAt()
    expect(screen.getByRole('button', { name: 'تثبيت التطبيق' })).toBeTruthy()
  })

  it('لا يظهر عندما لا يوجد عرض تثبيت', () => {
    state.canPrompt = false
    renderAt()
    expect(screen.queryByRole('button', { name: 'تثبيت التطبيق' })).toBeNull()
  })

  it('لا يظهر عندما يكون التطبيق مثبّتاً', () => {
    state.isInstalled = true
    renderAt()
    expect(screen.queryByRole('button', { name: 'تثبيت التطبيق' })).toBeNull()
  })

  it('يختفي عند التنقّل لصفحة أخرى دون ضغط، ولا يعود في نفس الجلسة', () => {
    const { unmount } = renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'انتقل' }))
    expect(screen.queryByRole('button', { name: 'تثبيت التطبيق' })).toBeNull()
    // إعادة تركيب داخل الجلسة نفسها (sessionStorage محفوظ) — يبقى مخفياً
    unmount()
    renderAt()
    expect(screen.queryByRole('button', { name: 'تثبيت التطبيق' })).toBeNull()
  })

  it('يعود في جلسة جديدة (sessionStorage فارغ)', () => {
    sessionStorage.setItem('pwa-install-cta-hidden', '1')
    const first = renderAt()
    expect(screen.queryByRole('button', { name: 'تثبيت التطبيق' })).toBeNull()
    first.unmount()
    sessionStorage.clear()
    renderAt()
    expect(screen.getByRole('button', { name: 'تثبيت التطبيق' })).toBeTruthy()
  })

  it('الضغط يستدعي promptInstall ثم يخفي الزر', async () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'تثبيت التطبيق' }))
    expect(state.promptInstall).toHaveBeenCalledTimes(1)
    // الإخفاء بعد استقرار الوعد
    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: 'تثبيت التطبيق' })).toBeNull()
    })
  })
})
