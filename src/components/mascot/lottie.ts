// ===========================================================================
// عيّن تحويلات Lottie مصغّر (MASCOT-PLAN §٤) — يقرأ ملف Lottie قياسياً
// (doffy-loading.json: طبقة صورة واحدة بتحويلات position/scale/rotation
// مفتاحية) ويعيّن قيم التحويل عند أي زمن. اختير عيّن محلي صغير بدل
// مكتبة مشغّل كاملة (lottie-web ‏≈ 55KB gzip) لأن الأنيميشن المعتمد
// طبقة واحدة وتحويلات فقط — فتكلفة الحزمة هنا صفر اعتماديات، والملف
// نفسه Lottie قياسي يعمل في أي مشغّل خارجي كما هو.
//
// الدوال هنا نقية بالكامل (بلا DOM) حتى تُختبَر وحدوياً: الإدخال زمن
// بالمللي ثانية والإخراج تحويل الطبقة عند هذا الزمن.
// ===========================================================================

export interface LottieKeyframe {
  t: number
  s: number[]
  i?: { x: number[]; y: number[] }
  o?: { x: number[]; y: number[] }
}

interface LottieAnimatedProperty {
  a: 0 | 1
  k: number[] | LottieKeyframe[]
}

interface LottieTransform {
  o: LottieAnimatedProperty
  r: LottieAnimatedProperty
  p: LottieAnimatedProperty
  a: LottieAnimatedProperty
  s: LottieAnimatedProperty
}

interface LottieImageAsset {
  id: string
  w: number
  h: number
  p: string
  e?: number
}

export interface LottieAnimation {
  v: string
  fr: number
  ip: number
  op: number
  w: number
  h: number
  assets: LottieImageAsset[]
  layers: { ty: number; refId?: string; ks: LottieTransform }[]
}

export interface SampledTransform {
  /** إزاحة الموضع عن موضع أول إطار (بكسل فضاء التركيب) */
  dx: number
  dy: number
  /** الدوران بالدرجات */
  rotation: number
  /** النسبة المئوية للمقياس */
  scaleX: number
  scaleY: number
  /** الشفافية 0..100 */
  opacity: number
}

function staticValue(prop: LottieAnimatedProperty): number[] {
  if (prop.a === 0) return prop.k as number[]
  const frames = prop.k as LottieKeyframe[]
  return frames.length > 0 ? frames[0].s : []
}

/** منحنى بيزيه مكعب: y عند x معطاة لنقطتي تحكم (x1,y1),(x2,y2) */
export function cubicBezierY(x: number, x1: number, y1: number, x2: number, y2: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  // حلّ u من x(u) = x بالتنصيف (رتيب في نطاقات تخفيف Lottie المعتادة)
  let lo = 0
  let hi = 1
  let u = x
  for (let iter = 0; iter < 24; iter++) {
    u = (lo + hi) / 2
    const v = 1 - u
    const xu = 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u
    if (xu < x) lo = u
    else hi = u
  }
  const v = 1 - u
  return 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u
}

function sampleProperty(prop: LottieAnimatedProperty, frame: number): number[] {
  if (prop.a === 0) return prop.k as number[]
  const frames = prop.k as LottieKeyframe[]
  if (frames.length === 0) return []
  if (frame <= frames[0].t) return frames[0].s
  for (let idx = 0; idx < frames.length - 1; idx++) {
    const from = frames[idx]
    const to = frames[idx + 1]
    if (frame <= to.t) {
      const span = to.t - from.t
      const raw = span > 0 ? (frame - from.t) / span : 1
      const x1 = from.o?.x[0] ?? 0
      const y1 = from.o?.y[0] ?? 0
      const x2 = to.i?.x[0] ?? 1
      const y2 = to.i?.y[0] ?? 1
      const eased = cubicBezierY(raw, x1, y1, x2, y2)
      return from.s.map((start, c) => start + ((to.s[c] ?? start) - start) * eased)
    }
  }
  return frames[frames.length - 1].s
}

/**
 * عيّن تحويل الطبقة الأولى عند زمن بالمللي ثانية (يلتف حول مدة الحلقة).
 * dx/dy إزاحة عن موضع أول إطار حتى يضعها العرض حول نقطة ارتكاز ثابتة.
 */
export function sampleLottieTransform(anim: LottieAnimation, timeMs: number): SampledTransform {
  const layer = anim.layers[0]
  const ks = layer.ks
  const durationFrames = Math.max(1, anim.op - anim.ip)
  const durationMs = (durationFrames / anim.fr) * 1000
  const wrapped = ((timeMs % durationMs) + durationMs) % durationMs
  const frame = anim.ip + (wrapped / 1000) * anim.fr

  const baseP = staticValue(ks.p)
  const p = sampleProperty(ks.p, frame)
  const s = sampleProperty(ks.s, frame)
  const r = sampleProperty(ks.r, frame)
  const o = sampleProperty(ks.o, frame)

  return {
    dx: (p[0] ?? 0) - (baseP[0] ?? 0),
    dy: (p[1] ?? 0) - (baseP[1] ?? 0),
    rotation: r[0] ?? 0,
    scaleX: s[0] ?? 100,
    scaleY: s[1] ?? s[0] ?? 100,
    opacity: o[0] ?? 100,
  }
}
