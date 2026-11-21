import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ListLoadingState, ThinkingSkeletonHead } from './states'
import { EmptyState } from './EmptyState'

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

describe('رأس سكيليتون «بيفكّر» (خطة الهوية P-4)', () => {
  beforeEach(() => {
    flags.visible = true
  })

  it('يعرض رسمة التفكير الحقيقية + سطر التحميل من §٨', () => {
    const { container } = render(<ThinkingSkeletonHead />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toContain('thinking')
    expect(screen.getByText('ثواني… بقلّب في الدفتر.')).toBeInTheDocument()
  })

  it('يختفي كله عند إيقاف الماسكوت — العظام وحدها تكفي', () => {
    flags.visible = false
    const { container } = render(<ThinkingSkeletonHead />)
    expect(container.firstChild).toBeNull()
  })

  it('ListLoadingState: الرأس فوق هيكل الصفوف بحالة status', () => {
    const { container } = render(<ListLoadingState rows={3} />)
    expect(screen.getByText('ثواني… بقلّب في الدفتر.')).toBeInTheDocument()
    expect(container.querySelectorAll('[aria-hidden="true"] .animate-pulse, .animate-pulse').length).toBeGreaterThan(0)
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
