import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Fab } from './Fab'

// نمط «كلمة ثم أيقونة» (3A-317): يفتح ممتداً ثم ينكمش بعد المهلة أو أول تمرير
describe('Fab — نمط كلمة ثم أيقونة', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('يفتح ممتداً بالكلمة كاملة', () => {
    render(<Fab onClick={() => {}} ariaLabel="إضافة طالب جديد" label="طالب جديد" />)
    const btn = screen.getByRole('button', { name: 'إضافة طالب جديد' })
    expect(btn.getAttribute('data-expanded')).toBe('true')
    expect(btn.textContent).toContain('طالب جديد')
  })

  it('ينكمش للأيقونة فقط بعد مهلة البقاء', () => {
    render(<Fab onClick={() => {}} ariaLabel="إضافة طالب جديد" label="طالب جديد" />)
    const btn = screen.getByRole('button', { name: 'إضافة طالب جديد' })
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(btn.getAttribute('data-expanded')).toBe('false')
    // التسمية الوصولية ثابتة في الحالتين
    expect(btn.getAttribute('aria-label')).toBe('إضافة طالب جديد')
  })

  it('ينكمش عند أول تمرير قبل انتهاء المهلة', () => {
    render(<Fab onClick={() => {}} ariaLabel="إضافة طالب جديد" label="طالب جديد" />)
    const btn = screen.getByRole('button', { name: 'إضافة طالب جديد' })
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(btn.getAttribute('data-expanded')).toBe('false')
  })

  it('بلا label يبقى دائرياً ثابتاً ولا يستخدم المهلة', () => {
    render(<Fab onClick={() => {}} ariaLabel="إضافة" />)
    const btn = screen.getByRole('button', { name: 'إضافة' })
    expect(btn.className).toContain('w-14')
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(btn.className).toContain('w-14')
  })

  it('النقر يعمل في الحالتين', () => {
    const onClick = vi.fn()
    render(<Fab onClick={onClick} ariaLabel="إضافة طالب جديد" label="طالب جديد" />)
    const btn = screen.getByRole('button', { name: 'إضافة طالب جديد' })
    fireEvent.click(btn)
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(2)
  })
})
