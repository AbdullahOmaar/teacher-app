import { describe, expect, it } from 'vitest'
import { cubicBezierY, sampleLottieTransform, type LottieAnimation } from './lottie'
import animJson from '../../assets/mascot/doffy-loading.json'

const anim = animJson as unknown as LottieAnimation

describe('cubicBezierY — تخفيف Lottie', () => {
  it('الأطراف ثابتة: 0→0 و 1→1', () => {
    expect(cubicBezierY(0, 0.33, 0, 0.67, 1)).toBe(0)
    expect(cubicBezierY(1, 0.33, 0, 0.67, 1)).toBe(1)
  })

  it('المنحنى الخطي (0,0)-(1,1) يعيد x كما هي', () => {
    expect(cubicBezierY(0.25, 0, 0, 1, 1)).toBeCloseTo(0.25, 3)
    expect(cubicBezierY(0.7, 0, 0, 1, 1)).toBeCloseTo(0.7, 3)
  })

  it('ease متماثل يعطي 0.5 في المنتصف', () => {
    expect(cubicBezierY(0.5, 0.33, 0, 0.67, 1)).toBeCloseTo(0.5, 3)
  })
})

describe('sampleLottieTransform — أنيميشن تحميل دُفّي', () => {
  it('عند الزمن صفر: لا إزاحة ولا دوران ومقياس 100%', () => {
    const tr = sampleLottieTransform(anim, 0)
    expect(tr.dx).toBeCloseTo(0, 5)
    expect(tr.dy).toBeCloseTo(0, 5)
    expect(tr.rotation).toBeCloseTo(0, 5)
    expect(tr.scaleX).toBeCloseTo(100, 5)
    expect(tr.scaleY).toBeCloseTo(100, 5)
    expect(tr.opacity).toBeCloseTo(100, 5)
  })

  it('عند إطار الانضغاط (200ms = إطار 6): نزول + انضغاط رأسي', () => {
    const tr = sampleLottieTransform(anim, 200)
    expect(tr.dy).toBeCloseTo(4, 3)
    expect(tr.scaleX).toBeCloseTo(106, 3)
    expect(tr.scaleY).toBeCloseTo(92, 3)
  })

  it('عند قمة القفزة (إطار 14 ≈ 466.7ms): صعود 20px وتمدد رأسي', () => {
    const tr = sampleLottieTransform(anim, 1400 / 3)
    expect(tr.dy).toBeCloseTo(-20, 3)
    expect(tr.scaleY).toBeCloseTo(105, 3)
  })

  it('الحلقة تلتف: زمن 1200ms (مدة الحلقة) = زمن صفر', () => {
    const a = sampleLottieTransform(anim, 0)
    const b = sampleLottieTransform(anim, 1200)
    expect(b.dy).toBeCloseTo(a.dy, 5)
    expect(b.scaleX).toBeCloseTo(a.scaleX, 5)
    expect(b.rotation).toBeCloseTo(a.rotation, 5)
  })

  it('الأزمنة السالبة تلتف بأمان داخل الحلقة', () => {
    const tr = sampleLottieTransform(anim, -200)
    expect(Number.isFinite(tr.dy)).toBe(true)
    expect(Number.isFinite(tr.rotation)).toBe(true)
  })
})
