import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotFoundPage } from './NotFoundPage'

// رؤية الماسكوت مُتحكَّم فيها من الاختبار كما في اختبارات Mascot نفسها
vi.mock('../../components/mascot/useMascotVisible', () => ({
  useMascotVisible: () => true,
  usePrefersReducedMotion: () => false,
  readMascotMirror: () => null,
  MASCOT_MIRROR_KEY: 'teacher-app-show-mascot',
}))

afterEach(() => {
  cleanup()
})

describe('NotFoundPage — صفحة 404 (خطة الهوية P-5)', () => {
  it('تعرض عنوان الخطة وزر الرجوع للرئيسية مع دُفّي الأوبس', () => {
    const { container } = render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('الصفحة دي مش في الدفتر')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /الرجوع للرئيسية/ }),
    ).toBeInTheDocument()
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toContain('oops')
  })

  it('الوضع المنفرد يلفّ المحتوى في شاشة كاملة', () => {
    const { container } = render(
      <MemoryRouter>
        <NotFoundPage standalone />
      </MemoryRouter>,
    )
    expect(container.querySelector('.min-h-screen')).not.toBeNull()
    expect(screen.getByText('الصفحة دي مش في الدفتر')).toBeInTheDocument()
  })
})
