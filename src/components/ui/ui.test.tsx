import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'
import { Button } from './Button'

// اختبارات مكوّنات دخانية خفيفة — تثبت عمل Testing Library وتمسك كسر العرض الأساسي
describe('مكوّنات UI أساسية', () => {
  it('Avatar يعرض أول حرف من الاسم', () => {
    const { container } = render(<Avatar name="أحمد سامي" />)
    expect(container.textContent).toBe('أ')
  })
  it('Avatar باسم فارغ يعرض علامة استفهام', () => {
    const { container } = render(<Avatar name="  " />)
    expect(container.textContent).toBe('؟')
  })
  it('Button يعرض أبناءه ويحترم disabled', () => {
    render(<Button disabled>حفظ</Button>)
    const btn = screen.getByRole('button', { name: 'حفظ' })
    expect(btn).toBeDisabled()
  })
})
