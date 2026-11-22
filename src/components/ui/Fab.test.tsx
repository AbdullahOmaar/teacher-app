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

  it('المقاس المقفول 48px والأيقونة مصغّرة بمقياس متناسب (3A-324)', () => {
    render(<Fab onClick={() => {}} ariaLabel="إضافة طالب جديد" label="طالب جديد" />)
    const btn = screen.getByRole('button', { name: 'إضافة طالب جديد' })
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    // المقفول أصغر من 56px السابقة: 48×48 (حدّ اللمس الإرشادي الأدنى)
    // — بعرض صريح بالبكسل في الحالتين حتى يُداخَل الانتقال (auto لا يُداخَل)
    expect(btn.className).toContain('h-12')
    expect((btn as HTMLElement).style.width).toBe('48px')
    // الأيقونة تصغر مع الزر (24←20 بصرياً) بدل بقائها ثابتة
    const icon = btn.querySelector('svg')
    expect(icon?.getAttribute('class')).toContain('scale-[0.83]')
    // غلاف الكلمة عرضه صفر في الحالة المقفولة (يُحرَّك بالبكسل من
    // العرض الحقيقي المقاس — آلية الانكماش المستمر 3A-324)
    const labelWrap = btn.querySelector('span')
    expect((labelWrap as HTMLElement | null)?.style.width).toBe('0px')
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
