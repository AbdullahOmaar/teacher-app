import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
import {
  PageToolBar,
  StickyGroupHeader,
  GROUP_HEADER_TOP,
  GROUP_HEADER_TOP_WITH_SEARCH,
} from './PageToolBar'
import { Chip } from './form'

// اختبارات نمط شريط الأدوات بعد إعادة الترتيب (3A-304): البحث في صفّه
// المستقل بعرض كامل، والرقائق في صفّها، والعدّاد خارج الشريط اللاصق.
describe('PageToolBar — نمط الصفوف المنفصلة', () => {
  const setup = (over: Partial<Parameters<typeof PageToolBar>[0]> = {}) => {
    const onChange = vi.fn()
    const onFilter = vi.fn()
    const utils = render(
      <PageToolBar
        search={{ value: '', onChange, placeholder: 'ابحث بالاسم' }}
        chips={
          <>
            <Chip active onClick={() => {}}>
              النشطين
            </Chip>
            <Chip active={false} onClick={() => {}}>
              مسدد
            </Chip>
          </>
        }
        onFilter={onFilter}
        activeFilterCount={2}
        resultCount={40}
        {...over}
      />,
    )
    return { onChange, onFilter, ...utils }
  }

  it('البحث بعرض كامل ولا يتقاسم صفّه المرن مع الرقائق', () => {
    const { container } = setup()
    const input = screen.getByPlaceholderText('ابحث بالاسم')
    const searchWrap = input.closest('div.relative')
    expect(searchWrap?.className).toContain('w-full')
    // صف الرقائق حاوية مرنة مختلفة عن غلاف البحث
    const chipBtn = screen.getByRole('button', { name: 'النشطين' })
    const chipsRow = chipBtn.closest('div.flex')
    expect(chipsRow).not.toBeNull()
    expect(chipsRow?.contains(input)).toBe(false)
    expect(container.querySelector('.sticky')).not.toBeNull()
  })

  it('عدّاد النتائج خارج الشريط اللاصق لا داخله', () => {
    const { container } = setup()
    const sticky = container.querySelector('.sticky')
    expect(sticky?.textContent).not.toContain('40')
    expect(container.textContent).toContain('40 نتيجة')
  })

  it('زر التصفية يعمل ويعرض شارة عدد الفلاتر المفعّلة', () => {
    const { onFilter } = setup()
    const btn = screen.getByRole('button', { name: 'تصفية متقدمة' })
    expect(btn.textContent).toContain('2')
    fireEvent.click(btn)
    expect(onFilter).toHaveBeenCalledTimes(1)
  })

  it('تغيير البحث يمرَّر كما هو (لا تغيير منطق)', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByPlaceholderText('ابحث بالاسم'), {
      target: { value: 'محمد' },
    })
    expect(onChange).toHaveBeenCalledWith('محمد')
  })

  it('بدون عدّاد لا يُرسم سطر عدّاد إطلاقاً', () => {
    const { container } = setup({ resultCount: undefined })
    expect(container.textContent).not.toContain('نتيجة')
  })

  it('ثوابت ارتفاع الالتصاق موثّقة ومتسقة مع بنية الصفوف', () => {
    expect(GROUP_HEADER_TOP).toBe(105)
    expect(GROUP_HEADER_TOP_WITH_SEARCH).toBe(166)
  })
})

describe('StickyGroupHeader — موضع الالتصاق', () => {
  it('يستخدم 105 افتراضياً وتمرَّر القيمة الصريحة كنمط', () => {
    const { container, rerender } = render(<StickyGroupHeader>عنوان</StickyGroupHeader>)
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('top-[105px]')
    rerender(<StickyGroupHeader top={GROUP_HEADER_TOP_WITH_SEARCH}>عنوان</StickyGroupHeader>)
    expect(el.style.top).toBe('166px')
  })
})
