import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { EnrolPage } from './EnrolPage'

// اختبارات نموذج صفحة الحجز العامة (ملاحظتا مالك 2026-11-28):
// ١) حالة النموذج الحالية موثقة كما هي — تقليص الحقول للثلاثة المطلوبة
//    (اسم ولي الأمر + موبايله + موبايل الطالب) محجوب بعقد الخادم الحالي
//    (لا أعمدة/وسائط لها في group_waitlist وenrolment_submit_by_token)
//    ويحتاج مهاجرة — انظر جسم الـ PR.
// ٢) التحقق على مستوى الحقل: خطأ الرقم الناقص يظهر تحت خانة الرقم نفسها
//    مع aria-invalid، لا رسالة نموذج عامة.

const fetchEnrolPage = vi.fn()
const submitBooking = vi.fn()

vi.mock('./api', async (importActual) => {
  const actual = await importActual<typeof import('./api')>()
  return {
    ...actual,
    fetchEnrolPage: (...args: unknown[]) => fetchEnrolPage(...args),
    submitBooking: (...args: unknown[]) => submitBooking(...args),
  }
})

const PAGE_DATA = {
  brand: { name: 'سنتر النور', logo_url: null, accent: null },
  groups: [
    { id: 'g1', name: 'مجموعة السبت', days: [6], start_time: '17:00', duration_minutes: 60 },
    { id: 'g2', name: 'مجموعة الاثنين', days: [1], start_time: '19:00', duration_minutes: 90 },
  ],
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/book?t=tok123']}>
        <EnrolPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function renderForm() {
  renderPage()
  return {
    name: await screen.findByLabelText(t('enrol.pageStudentNameLabel')),
    phone: screen.getByLabelText(t('enrol.pageGuardianPhoneLabel')),
    group: screen.getByLabelText(t('enrol.pageGroupLabel')),
  }
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(t('enrol.pageSubmitAction')) }))
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  fetchEnrolPage.mockReset().mockResolvedValue(PAGE_DATA)
  submitBooking.mockReset().mockResolvedValue(undefined)
})

describe('EnrolPage — حقول النموذج الحالية (توثيق ما قبل التقليص المحجوب)', () => {
  it('يعرض اسم الطالب وموبايل ولي الأمر والمجموعة والحصة التجريبية والملاحظات', async () => {
    const { name, phone, group } = await renderForm()
    expect(name).toBeInTheDocument()
    expect(phone).toBeInTheDocument()
    expect(group).toBeInTheDocument()
    expect(screen.getByLabelText(new RegExp(t('enrol.pageTrialLabel')))).toBeInTheDocument()
    expect(screen.getByLabelText(t('enrol.pageNoteLabel'))).toBeInTheDocument()
    // خيارات المجموعات تأتي من سياق الصفحة (رمز السنتر)
    expect(screen.getByRole('option', { name: /مجموعة السبت/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /مجموعة الاثنين/ })).toBeInTheDocument()
  })
})

describe('EnrolPage — التحقق على مستوى الحقل (ملاحظة مالك 2026-11-28)', () => {
  it('رقم ناقص: الخطأ تحت خانة الرقم نفسها مع aria-invalid — بلا إرسال وبلا خطأ عام', async () => {
    const { name, phone, group } = await renderForm()
    fireEvent.change(name, { target: { value: 'أحمد محمد علي' } })
    fireEvent.change(phone, { target: { value: '0100' } })
    fireEvent.change(group, { target: { value: 'g1' } })
    submit()
    const alert = await screen.findByText(t('enrol.pagePhoneError'))
    expect(alert).toBeInTheDocument()
    expect(phone).toHaveAttribute('aria-invalid', 'true')
    expect(name).not.toHaveAttribute('aria-invalid')
    expect(group).not.toHaveAttribute('aria-invalid')
    // تنبيه واحد فقط (خطأ الحقل) — لا رسالة نموذج عامة مكررة
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(submitBooking).not.toHaveBeenCalled()
  })

  it('تعديل الرقم بعد الخطأ يمسح خطأ الحقل فوراً', async () => {
    const { name, phone, group } = await renderForm()
    fireEvent.change(name, { target: { value: 'أحمد محمد علي' } })
    fireEvent.change(phone, { target: { value: '0100' } })
    fireEvent.change(group, { target: { value: 'g1' } })
    submit()
    await screen.findByText(t('enrol.pagePhoneError'))
    fireEvent.change(phone, { target: { value: '01001234567' } })
    expect(screen.queryByText(t('enrol.pagePhoneError'))).not.toBeInTheDocument()
    expect(phone).not.toHaveAttribute('aria-invalid')
  })

  it('اسم قصير: الخطأ على حقل الاسم نفسه', async () => {
    const { name, phone, group } = await renderForm()
    fireEvent.change(name, { target: { value: 'اب' } })
    fireEvent.change(phone, { target: { value: '01001234567' } })
    fireEvent.change(group, { target: { value: 'g1' } })
    submit()
    await screen.findByText(t('enrol.pageNameError'))
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(phone).not.toHaveAttribute('aria-invalid')
    expect(submitBooking).not.toHaveBeenCalled()
  })

  it('بلا مجموعة: الخطأ على حقل المجموعة نفسه', async () => {
    const { name, phone, group } = await renderForm()
    fireEvent.change(name, { target: { value: 'أحمد محمد علي' } })
    fireEvent.change(phone, { target: { value: '01001234567' } })
    submit()
    await screen.findByText(t('enrol.pageGroupError'))
    expect(group).toHaveAttribute('aria-invalid', 'true')
    expect(submitBooking).not.toHaveBeenCalled()
  })

  it('كل الحقول سليمة: الإرسال يمر للـ RPC بالقيم المُطبَّعة وينتهي بشاشة النجاح', async () => {
    const { name, phone, group } = await renderForm()
    fireEvent.change(name, { target: { value: 'أحمد محمد علي' } })
    fireEvent.change(phone, { target: { value: '0100 123 4567' } })
    fireEvent.change(group, { target: { value: 'g1' } })
    submit()
    await waitFor(() => expect(submitBooking).toHaveBeenCalledTimes(1))
    expect(submitBooking).toHaveBeenCalledWith(
      'tok123',
      expect.objectContaining({
        studentName: 'أحمد محمد علي',
        guardianPhone: '01001234567',
        groupId: 'g1',
      }),
    )
    expect(await screen.findByText(t('enrol.pageDoneTitle'))).toBeInTheDocument()
  })

  it('رفض خادمي «invalid phone» يرجع لحقل الرقم لا لرسالة عامة', async () => {
    submitBooking.mockRejectedValue(new Error('invalid phone'))
    const { name, phone, group } = await renderForm()
    fireEvent.change(name, { target: { value: 'أحمد محمد علي' } })
    fireEvent.change(phone, { target: { value: '01001234567' } })
    fireEvent.change(group, { target: { value: 'g1' } })
    submit()
    await screen.findByText(t('enrol.pagePhoneError'))
    expect(phone).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
})
