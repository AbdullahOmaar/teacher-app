import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sheet } from './Sheet'

// بوابة الـ Sheet (3A-925 بند ٦): المحتوى يُرسَل إلى document.body مباشرة
// فلا يحبسه أي سياق تكديس عند أبٍ ما فوق التعتيم — والنافذة فوق كل شيء.
describe('Sheet — Portal والتعتيم الكامل', () => {
  afterEach(() => {
    cleanup()
    document.body.style.overflow = ''
  })

  it('يُرسم في document.body لا داخل حاوية الصفحة', () => {
    const { container } = render(
      <div data-testid="page-wrap">
        <Sheet open title="عنوان" onClose={() => {}}>
          <p>محتوى النافذة</p>
        </Sheet>
      </div>,
    )
    const dialog = screen.getByRole('dialog')
    expect(screen.getByText('محتوى النافذة')).toBeTruthy()
    // الحاوية المحلية لا تحمل الحوار — البوابة نقلته لجذر المستند
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(dialog.parentElement?.parentElement).toBe(document.body)
    expect(dialog.closest('[data-testid="page-wrap"]')).toBeNull()
  })

  it('مغلق = لا شيء في المستند', () => {
    render(
      <Sheet open={false} title="عنوان" onClose={() => {}}>
        <p>محتوى</p>
      </Sheet>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('النقر على الخلفية المعتمة يغلق، والنقر داخل اللوحة لا يغلق', () => {
    const onClose = vi.fn()
    render(
      <Sheet open title="عنوان" onClose={onClose}>
        <p>محتوى</p>
      </Sheet>,
    )
    fireEvent.click(screen.getByText('محتوى'))
    expect(onClose).not.toHaveBeenCalled()
    const overlay = screen.getByRole('dialog').parentElement
    expect(overlay).not.toBeNull()
    fireEvent.click(overlay as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('التذييل المثبت يُرسم داخل اللوحة (أزرار إجراءات لا تضيع تحت التنقل)', () => {
    render(
      <Sheet open title="عنوان" onClose={() => {}} footer={<button type="button">حفظ</button>}>
        <p>محتوى</p>
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(screen.getByRole('button', { name: 'حفظ' }))).toBe(true)
  })
})
