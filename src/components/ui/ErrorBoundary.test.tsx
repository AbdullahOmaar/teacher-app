import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('boom')
}

describe('ErrorBoundary — حدّ الخطأ الجذري (3A-302)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
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

  it('يعرض الأبناء كما هم عندما لا يوجد خطأ', () => {
    render(
      <ErrorBoundary>
        <div>محتوى سليم</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('محتوى سليم')).toBeInTheDocument()
  })
})
