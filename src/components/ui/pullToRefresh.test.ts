import { describe, expect, it } from 'vitest'
import {
  initialPtrState,
  ptrCancel,
  ptrDisplayPull,
  ptrEnd,
  ptrMove,
  ptrRefreshed,
  ptrStart,
  PTR_MAX_PULL_PX,
  PTR_THRESHOLD_PX,
  type PtrState,
} from './pullToRefresh'

const ok = { atTop: true, blocked: false }

function started(): PtrState {
  return ptrStart(initialPtrState, 100, 200, ok)
}

describe('ptrDisplayPull — المقاومة والسقف', () => {
  it('إزاحة سالبة أو صفر = صفر', () => {
    expect(ptrDisplayPull(0)).toBe(0)
    expect(ptrDisplayPull(-40)).toBe(0)
  })
  it('مقاومة خطية 0.5', () => {
    expect(ptrDisplayPull(80)).toBe(40)
    expect(ptrDisplayPull(128)).toBe(64)
  })
  it('سقف عند PTR_MAX_PULL_PX مهما كبرت الإزاحة', () => {
    expect(ptrDisplayPull(1000)).toBe(PTR_MAX_PULL_PX)
  })
})

describe('ptrStart — سياق الانخراط', () => {
  it('ينخرط عند القمة وبلا حظر', () => {
    const s = started()
    expect(s.phase).toBe('tracking')
    expect(s.pull).toBe(0)
    expect(s.armed).toBe(false)
  })
  it('لا ينخرط بعيداً عن القمة', () => {
    expect(ptrStart(initialPtrState, 0, 0, { atTop: false, blocked: false })).toBe(initialPtrState)
  })
  it('لا ينخرط مع سطح مفتوح فوق الصفحة (blocked)', () => {
    expect(ptrStart(initialPtrState, 0, 0, { atTop: true, blocked: true })).toBe(initialPtrState)
  })
  it('لا ينخرط أثناء تحديث جارٍ', () => {
    const refreshing: PtrState = { ...initialPtrState, phase: 'refreshing' }
    expect(ptrStart(refreshing, 0, 0, ok)).toBe(refreshing)
  })
})

describe('ptrMove — قفل الاتجاه والسحب', () => {
  it('حركة دون مسافة التردد لا تغيّر شيئاً', () => {
    const s = started()
    expect(ptrMove(s, 103, 205)).toBe(s)
  })
  it('حركة أفقية غالبة تجهض الإيماءة نهائياً', () => {
    let s = started()
    s = ptrMove(s, 160, 208) // dx=60 غالب
    expect(s.direction).toBe('horizontal')
    expect(s.pull).toBe(0)
    // حتى لو انعكست الحركة لعمودية بعدها، تبقى مجهضة
    s = ptrMove(s, 100, 400)
    expect(s.pull).toBe(0)
    expect(s.armed).toBe(false)
    expect(ptrEnd(s).trigger).toBe(false)
  })
  it('سحب عمودي يحسب المسافة البصرية ويُسلَّح عند العتبة', () => {
    let s = started()
    s = ptrMove(s, 100, 300) // dy=100 → بصري 50
    expect(s.direction).toBe('vertical')
    expect(s.pull).toBe(50)
    expect(s.armed).toBe(false)
    s = ptrMove(s, 100, 340) // dy=140 → بصري 70 ≥ 64
    expect(s.pull).toBe(70)
    expect(s.armed).toBe(true)
  })
  it('السحب لأعلى (dy سالب) يبقي المسافة صفراً', () => {
    let s = started()
    s = ptrMove(s, 100, 120)
    expect(s.direction).toBe('vertical')
    expect(s.pull).toBe(0)
    expect(s.armed).toBe(false)
  })
  it('خارج طور التتبع لا أثر للحركة', () => {
    expect(ptrMove(initialPtrState, 0, 500)).toBe(initialPtrState)
  })
})

describe('ptrEnd / ptrCancel / ptrRefreshed — الإطلاق والإنهاء', () => {
  it('إفلات مسلّح يطلق التحديث مرة ويدخل طور التحديث عند مسافة العتبة', () => {
    let s = started()
    s = ptrMove(s, 100, 360)
    const { state, trigger } = ptrEnd(s)
    expect(trigger).toBe(true)
    expect(state.phase).toBe('refreshing')
    expect(state.pull).toBe(PTR_THRESHOLD_PX)
  })
  it('إفلات دون العتبة: لا إطلاق وعودة للخمول', () => {
    let s = started()
    s = ptrMove(s, 100, 260) // بصري 30
    const { state, trigger } = ptrEnd(s)
    expect(trigger).toBe(false)
    expect(state).toBe(initialPtrState)
  })
  it('الإلغاء لا يطلق أبداً حتى وهو مسلّح', () => {
    let s = started()
    s = ptrMove(s, 100, 360)
    expect(s.armed).toBe(true)
    expect(ptrCancel(s)).toBe(initialPtrState)
    expect(ptrEnd(ptrCancel(s)).trigger).toBe(false)
  })
  it('انتهاء التحديث يعيد الخمول، والإلغاء لا يقطع تحديثاً جارياً', () => {
    let s = started()
    s = ptrMove(s, 100, 360)
    const refreshing = ptrEnd(s).state
    expect(ptrCancel(refreshing)).toBe(refreshing)
    expect(ptrRefreshed(refreshing)).toBe(initialPtrState)
  })
})
