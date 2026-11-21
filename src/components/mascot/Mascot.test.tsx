import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Mascot } from './Mascot'
import { MascotLoader } from './MascotLoader'

// رؤية الماسكوت وحركة النظام مُتحكَّم فيهما من الاختبار — بقية المنطق
// (اختيار الرسمة، سلسلة السقوط، الإخفاء) هو الحقيقي تحت الاختبار.
const flags = vi.hoisted(() => ({ visible: true, reducedMotion: false }))
vi.mock('./useMascotVisible', () => ({
  useMascotVisible: () => flags.visible,
  usePrefersReducedMotion: () => flags.reducedMotion,
  readMascotMirror: () => null,
  MASCOT_MIRROR_KEY: 'teacher-app-show-mascot',
}))

describe('Mascot — مكوّن دُفّي', () => {
  beforeEach(() => {
    flags.visible = true
    flags.reducedMotion = false
  })

  it('يرسم رسمة الوضع المطلوب بحركته الخفيفة', () => {
    const { container } = render(<Mascot state="welcome" size={80} />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toContain('welcome')
    expect(img!.className).toContain('mascot-wave')
    expect(img!.getAttribute('width')).toBe('80')
  })

  it('وضع thinking مربوط برسمة التفكير الحقيقية من الشيت الثاني (أُغلق ربط 3A-303 المؤقت)', () => {
    const { container } = render(<Mascot state="thinking" />)
    const img = container.querySelector('img')
    expect(img!.getAttribute('src')).toContain('thinking')
  })

  it('أوضاع الشيت الثاني مسجّلة كلها برسوماتها (دفعة الهوية ٢)', () => {
    for (const state of ['oops', 'inspector', 'writing', 'explaining', 'star'] as const) {
      const { container, unmount } = render(<Mascot state={state} />)
      const img = container.querySelector('img')
      expect(img, `state=${state}`).not.toBeNull()
      expect(img!.getAttribute('src'), `state=${state}`).toContain(state)
      unmount()
    }
  })

  it('still يلغي الحركة الخفيفة', () => {
    const { container } = render(<Mascot state="celebrate" still />)
    const img = container.querySelector('img')
    expect(img!.className).not.toContain('mascot-jump')
  })

  it('سلسلة السقوط: خطأ رسمة الوضع ← رسمة اللوجو ← لوجو الكتاب', () => {
    const { container } = render(<Mascot state="empty" />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toContain('empty')
    fireEvent.error(img)
    const fallbackImg = container.querySelector('img')!
    expect(fallbackImg.getAttribute('src')).toContain('loading')
    fireEvent.error(fallbackImg)
    // انتهت الصور: لوجو الكتاب (SVG) بدل أي فراغ
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('عند إيقاف الماسكوت: لا شيء بلا fallback، والـ fallback عند وجوده', () => {
    flags.visible = false
    const { container, rerender } = render(<Mascot state="welcome" />)
    expect(container.firstChild).toBeNull()
    rerender(<Mascot state="empty" fallback={<span>أيقونة بديلة</span>} />)
    expect(screen.getByText('أيقونة بديلة')).toBeInTheDocument()
  })
})

describe('Mascot — تجاوز الرؤية الخارجي (بوابات P-10)', () => {
  beforeEach(() => {
    flags.visible = true
    flags.reducedMotion = false
  })

  it('visibleOverride=false يخفي دُفّي حتى لو جلسة المتصفح تقول يظهر', () => {
    flags.visible = true
    const { container } = render(
      <Mascot state="welcome" visibleOverride={false} fallback={<span data-testid="fb" />} />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByTestId('fb')).toBeInTheDocument()
  })

  it('visibleOverride=true يظهر دُفّي حتى لو جلسة المتصفح تقول مخفي', () => {
    flags.visible = false
    const { container } = render(<Mascot state="welcome" visibleOverride={true} />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toContain('welcome')
  })
})

describe('MascotLoader — لوجو التحميل', () => {
  beforeEach(() => {
    flags.visible = true
    flags.reducedMotion = false
  })

  it('المتحرك: صورة Lottie المضمّنة (data URI) داخل صندوق التركيب', () => {
    const { container } = render(<MascotLoader size={96} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toMatch(/^data:image\/webp;base64,/)
    expect(screen.getByRole('img', { name: /دُفّي/ })).toBeInTheDocument()
  })

  it('تقليل الحركة: الصورة الثابتة بدل الأنيميشن', () => {
    flags.reducedMotion = true
    const { container } = render(<MascotLoader size={96} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).not.toMatch(/^data:/)
    expect(img.getAttribute('src')).toContain('loading')
  })

  it('الماسكوت موقوف: لوجو الكتاب الأصلي هو لوجو التحميل', () => {
    flags.visible = false
    const { container } = render(<MascotLoader size={96} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
