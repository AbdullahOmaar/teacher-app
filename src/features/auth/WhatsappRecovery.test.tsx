import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WhatsappRecovery } from './WhatsappRecovery'
import { t } from '../../i18n'

/**
 * اختبارات مكوّن استرداد واتساب (3A-927): الدورة رقم → كود + سر
 * جديد → نجاح، بحدود العميل المحلية (صيغة الرقم، طول الكود، تطابق
 * السر) قبل أي نداء، ورسائل الخادم المصممة كما تصل من طبقة الـ api
 * (مترجمة بالحالة) — الـ api نفسه مُختبَر بعقده في api.test.ts.
 */

const api = vi.hoisted(() => ({
  requestWhatsappRecoveryCode: vi.fn(),
  verifyWhatsappRecoveryCode: vi.fn(),
}))
vi.mock('./api', () => api)

function renderRecovery() {
  render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <WhatsappRecovery />
    </MemoryRouter>,
  )
}

const flush = () => act(async () => {})

async function submitPhone(phone: string) {
  fireEvent.change(screen.getByLabelText(t('auth.phoneNumberLabel')), {
    target: { value: phone },
  })
  fireEvent.click(
    screen.getByRole('button', { name: t('auth.waRecoverySendCode') }),
  )
  await flush()
}

beforeEach(() => {
  api.requestWhatsappRecoveryCode.mockReset()
  api.verifyWhatsappRecoveryCode.mockReset()
  api.requestWhatsappRecoveryCode.mockResolvedValue(undefined)
  api.verifyWhatsappRecoveryCode.mockResolvedValue(undefined)
})

afterEach(() => cleanup())

describe('WhatsappRecovery — خطوة الرقم', () => {
  it('رقم غير صالح: رسالة الصيغة محلياً وبلا أي نداء', async () => {
    renderRecovery()
    await submitPhone('12345')
    expect(screen.getByRole('alert').textContent).toContain(t('auth.errInvalidPhone'))
    expect(api.requestWhatsappRecoveryCode).not.toHaveBeenCalled()
  })

  it('رقم سليم: يُطبَّع E.164 ويُطلب الكود ثم تظهر خطوة الكود بالإشعار المشروط', async () => {
    renderRecovery()
    await submitPhone('01012345678')
    expect(api.requestWhatsappRecoveryCode).toHaveBeenCalledWith('+201012345678')
    expect(screen.getByText(t('auth.waRecoveryCodeNotice'))).toBeTruthy()
    expect(
      screen.getByRole('button', { name: t('auth.waRecoveryVerify') }),
    ).toBeTruthy()
  })

  it('فشل الطلب (قناة مطفأة): الرسالة المصممة تبقى في خطوة الرقم', async () => {
    api.requestWhatsappRecoveryCode.mockRejectedValue(
      new Error(t('auth.errWaRecoveryOff')),
    )
    renderRecovery()
    await submitPhone('01012345678')
    expect(screen.getByRole('alert').textContent).toContain(t('auth.errWaRecoveryOff'))
    expect(
      screen.getByRole('button', { name: t('auth.waRecoverySendCode') }),
    ).toBeTruthy()
  })
})

describe('WhatsappRecovery — خطوة الكود وتعيين السر', () => {
  async function gotoSetStep() {
    renderRecovery()
    await submitPhone('01012345678')
  }
  async function fillSetForm(code: string, password: string, confirm: string) {
    fireEvent.change(screen.getByLabelText(t('auth.codeLabel')), {
      target: { value: code },
    })
    fireEvent.change(screen.getByLabelText(t('auth.newPasswordLabel')), {
      target: { value: password },
    })
    fireEvent.change(screen.getByLabelText(t('auth.passwordConfirmLabel')), {
      target: { value: confirm },
    })
    fireEvent.click(screen.getByRole('button', { name: t('auth.waRecoveryVerify') }))
    await flush()
  }

  it('كود ناقص: خطأ الطول محلياً وبلا نداء تحقق', async () => {
    await gotoSetStep()
    await fillSetForm('123', 'NewPass123', 'NewPass123')
    expect(screen.getByRole('alert').textContent).toContain(t('auth.errCodeLength'))
    expect(api.verifyWhatsappRecoveryCode).not.toHaveBeenCalled()
  })

  it('سرّان غير متطابقين: خطأ التطابق محلياً وبلا نداء تحقق', async () => {
    await gotoSetStep()
    await fillSetForm('123456', 'NewPass123', 'NewPass124')
    expect(screen.getByRole('alert').textContent).toContain(t('auth.passwordMismatch'))
    expect(api.verifyWhatsappRecoveryCode).not.toHaveBeenCalled()
  })

  it('سر قصير: خطأ الطول محلياً وبلا نداء تحقق', async () => {
    await gotoSetStep()
    await fillSetForm('123456', 'short', 'short')
    expect(screen.getByRole('alert').textContent).toContain(t('auth.passwordTooShort'))
    expect(api.verifyWhatsappRecoveryCode).not.toHaveBeenCalled()
  })

  it('مسار سعيد: التحقق بالرقم والكود والسر ثم شاشة النجاح', async () => {
    await gotoSetStep()
    await fillSetForm('123456', 'NewPass123', 'NewPass123')
    expect(api.verifyWhatsappRecoveryCode).toHaveBeenCalledWith(
      '+201012345678',
      '123456',
      'NewPass123',
    )
    expect(screen.getByText(t('auth.waRecoverySuccess'))).toBeTruthy()
  })

  it('كود مرفوض خادمياً: الرسالة العامة تظهر ونبقى في خطوة الكود', async () => {
    api.verifyWhatsappRecoveryCode.mockRejectedValue(
      new Error(t('auth.errWaRecoveryInvalid')),
    )
    await gotoSetStep()
    await fillSetForm('123456', 'NewPass123', 'NewPass123')
    expect(screen.getByRole('alert').textContent).toContain(
      t('auth.errWaRecoveryInvalid'),
    )
    expect(
      screen.getByRole('button', { name: t('auth.waRecoveryVerify') }),
    ).toBeTruthy()
  })
})
