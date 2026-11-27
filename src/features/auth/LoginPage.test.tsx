import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

// حالة مصادقة ثابتة: لا جلسة + Supabase مهيّأ — الصفحة تعرض النماذج
vi.mock('../../lib/useAuth', () => ({
  useAuth: () => ({
    session: null,
    user: null,
    loading: false,
    configured: true,
    signOut: async () => undefined,
  }),
}))

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ mode: 'light', toggle: () => undefined }),
}))

// الماسكوت مخفي هنا: اللوجو يكفي — سلوك النماذج هو موضوع الاختبار
vi.mock('../../components/mascot/useMascotVisible', () => ({
  useMascotVisible: () => false,
  usePrefersReducedMotion: () => false,
  readMascotMirror: () => null,
  MASCOT_MIRROR_KEY: 'teacher-app-show-mascot',
}))

// طبقة api مُتحكَّم فيها: كل اختبار يمسك وعداً معلّقاً ليرى حالة
// الانتظار، ثم يحسمه نجاحاً أو خطأ ليرى تصفير الحالة (3A-914)
const api = vi.hoisted(() => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  requestPasswordReset: vi.fn(),
  resendConfirmation: vi.fn(),
  confirmSignUpWithCode: vi.fn(),
  signInDemo: vi.fn(),
  checkSelfRegistrationAllowed: vi.fn(),
  claimTeacherInvites: vi.fn(),
  ensureTeacherProfile: vi.fn(),
  signUpNextStep: (hasSession: boolean, instantSignInOk: boolean): 'enter' | 'code' =>
    hasSession || instantSignInOk ? 'enter' : 'code',
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

/** تفريغ الصفوف الدقيقة بعد حسم وعد — تصل تحديثات الحالة المعلّقة */
const flush = () => act(async () => {})

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function fillEmailPassword() {
  fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), {
    target: { value: 'teacher@example.com' },
  })
  fireEvent.change(screen.getByLabelText('كلمة المرور'), {
    target: { value: 'password123' },
  })
}

/** إرسال ثانٍ مباشر على النموذج — يتجاوز الزر المعطّل ليختبر حارس المعالج نفسه */
function resubmit(busyButton: HTMLElement) {
  const form = busyButton.closest('form')
  expect(form).toBeTruthy()
  if (form) fireEvent.submit(form)
}

describe('LoginPage — حالة تحميل أزرار الإرسال (3A-914)', () => {
  afterEach(() => {
    cleanup()
  })
  beforeEach(() => {
    api.signInWithEmail.mockReset()
    api.signUpWithEmail.mockReset()
    api.requestPasswordReset.mockReset()
    api.resendConfirmation.mockReset()
    api.confirmSignUpWithCode.mockReset()
    api.signInDemo.mockReset()
    api.checkSelfRegistrationAllowed.mockReset()
    api.claimTeacherInvites.mockReset()
    api.ensureTeacherProfile.mockReset()
    api.checkSelfRegistrationAllowed.mockResolvedValue(true)
    api.claimTeacherInvites.mockResolvedValue({ claimed: 0 })
    api.ensureTeacherProfile.mockResolvedValue(undefined)
    api.signInDemo.mockResolvedValue(undefined)
    api.resendConfirmation.mockResolvedValue(undefined)
  })

  it('دخول: مؤشر فوري (سبينر + نص + تعطيل) ومنع الإرسال المكرر وتصفير عند الخطأ', async () => {
    const d = deferred()
    api.signInWithEmail.mockReturnValue(d.promise)
    renderLogin()
    fillEmailPassword()

    fireEvent.click(screen.getByRole('button', { name: 'دخول' }))

    const busyBtn = screen.getByRole('button', { name: /جارٍ تسجيل الدخول/ }) as HTMLButtonElement
    expect(busyBtn.disabled).toBe(true)
    expect(busyBtn.getAttribute('aria-busy')).toBe('true')
    expect(busyBtn.querySelector('.animate-spin')).toBeTruthy()

    resubmit(busyBtn)
    expect(api.signInWithEmail.mock.calls.length).toBe(1)

    d.reject(new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة.'))
    await flush()

    const idleBtn = screen.getByRole('button', { name: 'دخول' }) as HTMLButtonElement
    expect(idleBtn.disabled).toBe(false)
    expect(idleBtn.querySelector('.animate-spin')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('غير صحيحة')
  })

  it('دخول: الحالة تتصفّر عند النجاح أيضاً — لا «جارٍ…» عالقة', async () => {
    const d = deferred()
    api.signInWithEmail.mockReturnValue(d.promise)
    renderLogin()
    fillEmailPassword()

    fireEvent.click(screen.getByRole('button', { name: 'دخول' }))
    expect(
      (screen.getByRole('button', { name: /جارٍ تسجيل الدخول/ }) as HTMLButtonElement).disabled,
    ).toBe(true)

    d.resolve()
    await flush()

    expect((screen.getByRole('button', { name: 'دخول' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('إنشاء حساب: مؤشر فوري ومنع مكرر وتصفير عند الخطأ', async () => {
    const d = deferred<{ hasSession: boolean; userId: string | null }>()
    api.signUpWithEmail.mockReturnValue(d.promise)
    renderLogin()
    fireEvent.click(screen.getByRole('tab', { name: 'حساب جديد' }))
    fireEvent.change(screen.getByLabelText('اسم المدرس'), {
      target: { value: 'مستر أحمد' },
    })
    fillEmailPassword()
    fireEvent.change(screen.getByLabelText('تأكيد كلمة المرور'), {
      target: { value: 'password123' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الحساب' }))
    await flush()

    const busyBtn = screen.getByRole('button', { name: /جارٍ إنشاء الحساب/ }) as HTMLButtonElement
    expect(busyBtn.disabled).toBe(true)
    expect(busyBtn.querySelector('.animate-spin')).toBeTruthy()

    resubmit(busyBtn)
    expect(api.signUpWithEmail.mock.calls.length).toBe(1)

    d.reject(new Error('تعذّر إنشاء الحساب.'))
    await flush()

    const idleBtn = screen.getByRole('button', { name: 'إنشاء الحساب' }) as HTMLButtonElement
    expect(idleBtn.disabled).toBe(false)
    expect(screen.getByRole('alert').textContent).toContain('تعذّر إنشاء الحساب')
  })

  it('إنشاء حساب ثم تأكيد بالكود: زر التأكيد بمؤشر وحارس وتصفير عند خطأ الكود', async () => {
    api.signUpWithEmail.mockResolvedValue({ hasSession: false, userId: 'user-1' })
    api.signInWithEmail.mockRejectedValue(new Error('البريد لسه مش متأكد'))
    const d = deferred<{ userId: string | null }>()
    api.confirmSignUpWithCode.mockReturnValue(d.promise)
    renderLogin()
    fireEvent.click(screen.getByRole('tab', { name: 'حساب جديد' }))
    fireEvent.change(screen.getByLabelText('اسم المدرس'), {
      target: { value: 'مستر أحمد' },
    })
    fillEmailPassword()
    fireEvent.change(screen.getByLabelText('تأكيد كلمة المرور'), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الحساب' }))
    await flush()

    // شاشة إدخال الكود ظهرت (نظام التأكيد مفعّل في هذا السيناريو)
    fireEvent.change(screen.getByLabelText('كود التحقق'), {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد ودخول' }))

    const busyBtn = screen.getByRole('button', { name: /جارٍ التأكيد/ }) as HTMLButtonElement
    expect(busyBtn.disabled).toBe(true)
    expect(busyBtn.querySelector('.animate-spin')).toBeTruthy()

    resubmit(busyBtn)
    expect(api.confirmSignUpWithCode.mock.calls.length).toBe(1)

    d.reject(new Error('الكود غير صحيح — راجعه وحاول تاني.'))
    await flush()

    const idleBtn = screen.getByRole('button', { name: 'تأكيد ودخول' }) as HTMLButtonElement
    expect(idleBtn.disabled).toBe(false)
    expect(screen.getByRole('alert').textContent).toContain('الكود غير صحيح')
  })

  it('نسيت كلمة المرور: مؤشر فوري ومنع مكرر وتصفير عند الخطأ', async () => {
    const d = deferred()
    api.requestPasswordReset.mockReturnValue(d.promise)
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: 'نسيت كلمة المرور؟' }))
    fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), {
      target: { value: 'teacher@example.com' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'إرسال كود الاستعادة' }))

    const busyBtn = screen.getByRole('button', { name: /جارٍ الإرسال/ }) as HTMLButtonElement
    expect(busyBtn.disabled).toBe(true)
    expect(busyBtn.querySelector('.animate-spin')).toBeTruthy()

    resubmit(busyBtn)
    expect(api.requestPasswordReset.mock.calls.length).toBe(1)

    d.reject(new Error('تعذّر إرسال رسالة الاستعادة.'))
    await flush()

    const idleBtn = screen.getByRole('button', { name: 'إرسال كود الاستعادة' }) as HTMLButtonElement
    expect(idleBtn.disabled).toBe(false)
    expect(screen.getByRole('alert').textContent).toContain('تعذّر إرسال رسالة الاستعادة')
  })
})
