import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ListLoadingState, PageLoadingOverlay } from './states'
import { EmptyState } from './EmptyState'
import { t } from '../../i18n'

afterEach(() => {
  cleanup()
})

// رؤية الماسكوت مُتحكَّم فيها من الاختبار كما في اختبارات Mascot نفسها
const flags = vi.hoisted(() => ({ visible: true }))
vi.mock('../mascot/useMascotVisible', () => ({
  useMascotVisible: () => flags.visible,
  usePrefersReducedMotion: () => false,
  readMascotMirror: () => null,
  MASCOT_MIRROR_KEY: 'teacher-app-show-mascot',
}))

describe('لودر Overlay الموحّد (ملاحظات المالك — نقطة ٤)', () => {
  beforeEach(() => {
    flags.visible = true
  })

  it('طبقة ثابتة فوق المحتوى (fixed) + سطر التحميل من §٨', () => {
    const { container } = render(<PageLoadingOverlay />)
    const overlay = container.querySelector('[data-loading-overlay]')
    expect(overlay).not.toBeNull()
    expect(overlay!.className).toContain('fixed')
    expect(overlay!.className).toContain('inset-0')
    expect(screen.getByText('ثواني… بقلّب في الدفتر.')).toBeInTheDocument()
  })

  it('عند إيقاف الماسكوت: الـ Overlay يبقى بسطر محايد وبلا سطر دُفّي', () => {
    flags.visible = false
    const { container } = render(<PageLoadingOverlay />)
    expect(container.querySelector('[data-loading-overlay]')).not.toBeNull()
    expect(screen.queryByText('ثواني… بقلّب في الدفتر.')).toBeNull()
    expect(screen.getByText(t('common.loading'))).toBeInTheDocument()
  })

  it('ListLoadingState: Overlay + هيكل صفوف، ولا رسمة «بيفكّر» داخل التدفق', () => {
    const { container } = render(<ListLoadingState rows={3} />)
    expect(container.querySelector('[data-loading-overlay]')).not.toBeNull()
    expect(screen.getByText('ثواني… بقلّب في الدفتر.')).toBeInTheDocument()
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    const thinkingImg = [...container.querySelectorAll('img')].find((i) =>
      (i.getAttribute('src') ?? '').includes('thinking'),
    )
    expect(thinkingImg).toBeUndefined()
  })
})

describe('EmptyState — أوضاع دُفّي (خطة الهوية P-5/P-6)', () => {
  beforeEach(() => {
    flags.visible = true
  })

  it('الوضع الافتراضي عند التفعيل هو النائم', () => {
    const { container } = render(<EmptyState mascot title="فارغ" />)
    expect(container.querySelector('img')!.getAttribute('src')).toContain('empty')
  })

  it('mascotPose يختار الوضع المطلوب (inspector هنا)', () => {
    const { container } = render(<EmptyState mascot mascotPose="inspector" title="فارغ" />)
    expect(container.querySelector('img')!.getAttribute('src')).toContain('inspector')
  })

  it('عند إيقاف الماسكوت ترجع دائرة الأيقونة كما كانت', () => {
    flags.visible = false
    const { container } = render(<EmptyState mascot mascotPose="oops" title="غير موجود" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
