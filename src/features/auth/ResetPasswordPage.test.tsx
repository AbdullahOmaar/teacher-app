import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResetPasswordPage } from './ResetPasswordPage'

// حالة الجلسة مُتحكَّم فيها لكل اختبار: بلا جلسة = مسار طلب الكود،
// وبجلسة استعادة = نموذج تعيين كلمة المرور الجديدة
const authState = vi.hoisted(() => ({
  session: null as object | null,
  loading: false,
}))
vi.mock('../../lib/useAuth', () => ({
  useAuth: () => ({
    session: authState.session,
    user: null,
    loading: authState.loading,
    configured: true,
    signOut: async () => undefined,
  }),
}))

vi.mock('../../components/mascot/useMascotVisible', () => ({
  useMascotVisible: () => false,
  usePrefersReducedMotion: () => false,
  readMascotMirror: () => null,
  MASCOT_MIRROR_KEY: 'teacher-app-show-mascot',
}))

const api = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  confirmRecoveryWithCode: vi.fn(),
  updatePassword: vi.fn(),
}))
vi.mock('./api', () => api)

/** وعد يُحسم يدوياً من الاختبار — يبقي الطلب «قيد التنفيذ» كما يراه المستخدم */
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve: (value?: T) => resolve(value as T), reject }
}

const flush = () => act(async () => {})

function renderReset() {
  render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <ResetPasswordPage />
    </MemoryRouter>,
  )
  // الصفحة تنتظر مهلة قصيرة لالتقاط جلسة الاستعادة قبل عرض النموذج
  act(() => {
    vi.advanceTimersByTime(2600)
  })
}

/** إرسال ثانٍ مباشر على النموذج — يتجاوز الزر المعطّل ليختبر حارس المعالج نفسه */
function resubmit(busyButton: HTMLElement) {
  const form = busyButton.closest('form')
  expect(form).toBeTruthy()
  if (form) fireEvent.submit(form)
}

describe('ResetPasswordPage — حالة تحميل أزرار الإرسال (3A-914)', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })
  beforeEach(() => {
    vi.useFakeTimers()
    authState.session = null
    authState.loading = false
    api.requestPasswordReset.mockReset()
    api.confirmRecoveryWithCode.mockReset()
    api.updatePassword.mockReset()
  })

  it('طلب كود الاستعادة: مؤشر فوري ومنع مكرر وتصفير عند الخطأ', async () => {
    const d = deferred()
    api.requestPasswordReset.mockReturnValue(d.promise)
    renderReset()
    fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), {
      target: { value: 'teacher@example.com' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'إرسال كود الاستعادة' }))

    const busyBtn = screen.getByRole('button', { name: /جارٍ الإرسال/ }) as HTMLButtonElement
    expect(busyBtn.disabled).toBe(true)
    expect(busyBtn.getAttribute('aria-busy')).toBe('true')
    expect(busyBtn.querySelector('.animate-spin')).toBeTruthy()

    resubmit(busyBtn)
    expect(api.requestPasswordReset.mock.calls.length).toBe(1)

    d.reject(new Error('تعذّر إرسال رسالة الاستعادة.'))
    await flush()

    const idleBtn = screen.getByRole('button', { name: 'إرسال كود الاستعادة' }) as HTMLButtonElement
    expect(idleBtn.disabled).toBe(false)
    expect(idleBtn.querySelector('.animate-spin')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('تعذّر إرسال رسالة الاستعادة')
  })

  it('تعيين كلمة المرور: مؤشر فوري ومنع مكرر ونجاح يختم بحالة «تم»', async () => {
    authState.session = { user: { id: 'user-1' } }
    const d = deferred()
    api.updatePassword.mockReturnValue(d.promise)
    renderReset()
    fireEvent.change(screen.getByLabelText('كلمة المرور الجديدة'), {
      target: { value: 'password123' },
    })
    fireEvent.change(screen.getByLabelText('تأكيد كلمة المرور'), {
      target: { value: 'password123' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'حفظ كلمة المرور' }))

    const busyBtn = screen.getByRole('button', { name: /جارٍ الحفظ/ }) as HTMLButtonElement
    expect(busyBtn.disabled).toBe(true)
    expect(busyBtn.querySelector('.animate-spin')).toBeTruthy()

    resubmit(busyBtn)
    expect(api.updatePassword.mock.calls.length).toBe(1)

    d.resolve()
    await flush()

    expect(screen.getByText('تم تعيين كلمة المرور الجديدة بنجاح.')).toBeTruthy()
  })

  it('تعيين كلمة المرور: الخطأ يصفّر الحالة — لا «جارٍ الحفظ…» عالقة', async () => {
    authState.session = { user: { id: 'user-1' } }
    const d = deferred()
    api.updatePassword.mockReturnValue(d.promise)
    renderReset()
    fireEvent.change(screen.getByLabelText('كلمة المرور الجديدة'), {
      target: { value: 'password123' },
    })
    fireEvent.change(screen.getByLabelText('تأكيد كلمة المرور'), {
      target: { value: 'password123' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'حفظ كلمة المرور' }))
    expect(
      (screen.getByRole('button', { name: /جارٍ الحفظ/ }) as HTMLButtonElement).disabled,
    ).toBe(true)

    d.reject(new Error('تعذّر تعيين كلمة المرور.'))
    await flush()

    const idleBtn = screen.getByRole('button', { name: 'حفظ كلمة المرور' }) as HTMLButtonElement
    expect(idleBtn.disabled).toBe(false)
    expect(idleBtn.querySelector('.animate-spin')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('تعذّر تعيين كلمة المرور')
  })
})
