import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('boom')
}

describe('ErrorBoundary — حدّ الخطأ الجذري (3A-302)', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.removeItem('teacher-app-show-mascot')
  })

  it('يعرض بديلاً عاماً عند انهيار ابن بدل شاشة بيضاء', () => {
    // React نفسه يسجّل الخطأ في وحدة التحكم أثناء الاختبار — نكتمه فقط هنا
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('حصلت مشكلة غير متوقعة')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /تحديث الصفحة/ }),
    ).toBeInTheDocument()
  })

  it('يعرض دُفّي الأوبس + سطر الخطأ من §٨ (خطة الهوية P-5)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('حصلت لخبطة صغيرة… جرّب تاني وأنا معاك.')).toBeInTheDocument()
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toContain('oops')
  })

  it('مرآة الجهاز على «موقوف»: لا صورة أوبس — دائرة الأيقونة مكانها', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem('teacher-app-show-mascot', '0')
    const { container } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('حصلت مشكلة غير متوقعة')).toBeInTheDocument()
  })

  it('يعرض الأبناء كما هم عندما لا يوجد خطأ', () => {
    render(
      <ErrorBoundary>
        <div>محتوى سليم</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('محتوى سليم')).toBeInTheDocument()
  })
})
