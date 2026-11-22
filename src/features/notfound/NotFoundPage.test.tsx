import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { NotFoundPage } from './NotFoundPage'
import { NotFoundGate } from './NotFoundGate'

// رؤية الماسكوت مُتحكَّم فيها من الاختبار كما في اختبارات Mascot نفسها
vi.mock('../../components/mascot/useMascotVisible', () => ({
  useMascotVisible: () => true,
  usePrefersReducedMotion: () => false,
  readMascotMirror: () => null,
  MASCOT_MIRROR_KEY: 'teacher-app-show-mascot',
}))

// حالة الجلسة لبوابة 404 مُتحكَّم فيها لكل اختبار (NotFoundGate يقرأ
// useAuth فقط — باقي قيم السياق ثابتة هنا)
const authState = vi.hoisted(() => ({
  session: null as object | null,
  loading: false,
  configured: true,
}))
vi.mock('../../lib/useAuth', () => ({
  useAuth: () => ({
    session: authState.session,
    user: null,
    loading: authState.loading,
    configured: authState.configured,
    signOut: async () => undefined,
  }),
}))

// القشرة الحقيقية ثقيلة (بيانات مدرس/تنبيهات) — بديل خفيف يرسم
// الأطفال داخل علامة يمكن التأكد منها، وهو ما يهمّ البوابة فقط
vi.mock('../../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children?: ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}))

// سبلاش فحص الجلسة: علامة بدل رسوم Lottie (وMascotLoader نفسه
// لأن سقوط Suspense في ui/states يستخدمه)
vi.mock('../../components/mascot/MascotLoader', () => ({
  MascotSplash: () => <div data-testid="mascot-splash" />,
  MascotLoader: () => <div data-testid="mascot-loader" />,
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

describe('NotFoundGate — بوابة 404 الواعية بالجلسة (إصلاح 3A-331)', () => {
  beforeEach(() => {
    authState.session = null
    authState.loading = false
    authState.configured = true
  })

  it('بلا جلسة: يعرض الـ404 المنفردة بلا قشرة (لا تحويل إلى الدخول)', async () => {
    const { container } = render(
      <MemoryRouter>
        <NotFoundGate />
      </MemoryRouter>,
    )
    expect(await screen.findByText('الصفحة دي مش في الدفتر')).toBeInTheDocument()
    expect(container.querySelector('.min-h-screen')).not.toBeNull()
    expect(screen.queryByTestId('app-shell')).toBeNull()
  })

  it('بلا إعداد (configured=false): يعرض المنفردة أيضاً', async () => {
    authState.configured = false
    render(
      <MemoryRouter>
        <NotFoundGate />
      </MemoryRouter>,
    )
    expect(await screen.findByText('الصفحة دي مش في الدفتر')).toBeInTheDocument()
    expect(screen.queryByTestId('app-shell')).toBeNull()
  })

  it('بجلسة: يعرض الـ404 داخل القشرة بلا غلاف الشاشة الكاملة', async () => {
    authState.session = { user: { id: 'teacher-1' } }
    const { container } = render(
      <MemoryRouter>
        <NotFoundGate />
      </MemoryRouter>,
    )
    expect(await screen.findByText('الصفحة دي مش في الدفتر')).toBeInTheDocument()
    const shell = screen.getByTestId('app-shell')
    expect(shell).toContainElement(screen.getByText('الصفحة دي مش في الدفتر'))
    expect(container.querySelector('.min-h-screen')).toBeNull()
  })

  it('أثناء فحص الجلسة: يعرض سبلاش دُفّي ولا يرسم أي 404', () => {
    authState.loading = true
    render(
      <MemoryRouter>
        <NotFoundGate />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('mascot-splash')).toBeInTheDocument()
    expect(screen.queryByText('الصفحة دي مش في الدفتر')).toBeNull()
    expect(screen.queryByTestId('app-shell')).toBeNull()
  })
})
