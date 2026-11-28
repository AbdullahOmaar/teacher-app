import { useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import { versionStampLine } from '../../lib/buildInfo'
import { Logo } from '../brand/Logo'
import { sampleLottieTransform, type LottieAnimation, type LottieKeyframe } from './lottie'
import { useMascotVisible, usePrefersReducedMotion } from './useMascotVisible'
import loadingAnim from '../../assets/mascot/doffy-loading.json'
import loadingImg from '../../assets/mascot/loading.webp'

// ===========================================================================
// لوجو التحميل المتحرك — دُفّي (MASCOT-PLAN §٤ + قرار المالك: دُفّي هو
// لوجو التطبيق في السبلاش وكل تحميل عام)
//
// الأنيميشن: ملف Lottie قياسي (doffy-loading.json — قفزة خفيفة + تمايل،
// حلقة ١٫٢ ثانية، ~٢١KB بصورة WebP مضمّنة) يعيّنه العيّن المحلي في
// lottie.ts (صفر اعتماديات تشغيل — انظر ترويسة lottie.ts لسبب عدم
// استخدام lottie-web). السقوط عند أي فشل/تعذّر: الصورة الثابتة نفسها،
// وعند تقليل الحركة (prefers-reduced-motion) ثابت من أول إطار.
// وعند إيقاف المالك للماسكوت: لوجو الكتاب الأصلي كما كان قبل دُفّي.
// ===========================================================================

const anim = loadingAnim as unknown as LottieAnimation
const ASSET = anim.assets[0]
const ANCHOR = (anim.layers[0]?.ks.a.k as number[]) ?? [0, 0]
const BASE_P = (() => {
  const p = anim.layers[0]?.ks.p
  if (!p) return [0, 0]
  if (p.a === 0) return p.k as number[]
  const frames = p.k as LottieKeyframe[]
  return frames[0]?.s ?? [0, 0]
})()

interface MascotLoaderProps {
  /** عرض صندوق التركيب بالبكسل (الارتفاع بحسب نسبة 256:288) */
  size?: number
  className?: string
}

export function MascotLoader({ size = 96, className = '' }: MascotLoaderProps) {
  const visible = useMascotVisible()
  const reducedMotion = usePrefersReducedMotion()
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgFailed, setImgFailed] = useState(false)

  const animated = visible && !reducedMotion && !imgFailed && Boolean(ASSET)

  useEffect(() => {
    if (!animated) return
    const el = imgRef.current
    if (!el) return
    const scaleF = size / anim.w
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const tr = sampleLottieTransform(anim, now - start)
      el.style.transform =
        `translate(${tr.dx * scaleF}px, ${tr.dy * scaleF}px) ` +
        `rotate(${tr.rotation}deg) scale(${tr.scaleX / 100}, ${tr.scaleY / 100})`
      el.style.opacity = String(tr.opacity / 100)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animated, size])

  if (!visible) {
    // الماسكوت موقوف من الإعدادات: لوجو التحميل هو الكتاب الأصلي.
    // (3A-325): كان اللوجو ثابتاً تماماً هنا بينما دُفّي متحرك، فأخذ
    // كلاس «mascot-breathe» القائم في index.css (نبض هادئ مستمر —
    // الأنسب للودر: rise-in دخلة لمرة واحدة تنتهي ساكنة، وmascot-jump
    // أسرع/أنطّ من اللازم؛ والجمع بين كلاسين مستحيل لأن كليهما يكتب
    // خاصية animation فتُلغي المتأخرةُ في الملف الأولى). قاعدة
    // prefers-reduced-motion العامة في index.css تُسطّحه تلقائياً.
    return (
      <Logo
        size={size}
        className={`${className} mascot-breathe`.trim()}
        decorative
      />
    )
  }

  if (imgFailed || !ASSET) {
    // (ملاحظات المالك 2026-11-28): مسار السقوط ده كان بيرجع لوجو الكتاب
    // ثابتاً تماماً بينما كل أسطح السبلاش/التحميل التانية متحركة — لو
    // فشل أصل اللوتي على جهاز المستخدم بقى ده وش التطبيق الثابت اللي
    // شايفه. بياخد نفس «mascot-breathe» بتاع مسار إيقاف الماسكوت فوق
    // (3A-325) فالسقوط متحرك بنفس لغة الحركة القائمة.
    return (
      <Logo
        size={size}
        className={`${className} mascot-breathe`.trim()}
        decorative
      />
    )
  }

  const scaleF = size / anim.w
  const boxH = size * (anim.h / anim.w)
  return (
    <div
      className={className}
      role="img"
      aria-label={t('mascot.label')}
      style={{ width: size, height: boxH, position: 'relative', flexShrink: 0 }}
    >
      <img
        ref={imgRef}
        src={animated ? ASSET.p : loadingImg}
        alt=""
        aria-hidden="true"
        draggable={false}
        onError={() => setImgFailed(true)}
        className="select-none"
        style={{
          position: 'absolute',
          width: ASSET.w * scaleF,
          height: ASSET.h * scaleF,
          left: (BASE_P[0] - ANCHOR[0]) * scaleF,
          top: (BASE_P[1] - ANCHOR[1]) * scaleF,
          transformOrigin: `${(ANCHOR[0] / ASSET.w) * 100}% ${(ANCHOR[1] / ASSET.h) * 100}%`,
          display: 'block',
        }}
      />
    </div>
  )
}

/**
 * شاشة تحميل كاملة (سبلاش داخل التطبيق): دُفّي المتحرك + اسم التطبيق +
 * سطر التحميل — تُستخدم أثناء فحص الجلسة الأول (RequireAuth) حتى لا
 * يرى المستخدم نصاً عارياً أو شاشة بيضاء.
 */
export function MascotSplash() {
  return (
    <div className="min-h-screen bg-bg text-text flex flex-col items-center justify-center gap-2 px-6">
      <MascotLoader size={132} />
      <div className="font-extrabold text-[22px] mt-2">{t('shell.appName')}</div>
      <div className="text-muted text-[14px]">{t('mascot.loading')}</div>
      {/* ختم الإصدار ووقت النشر (قاعدة المالك 2026-11-25): سطر ظاهر
          أسفل هوية السبلاش، مبني من بيانات البناء عبر lib/buildInfo */}
      <div className="text-muted text-[13.5px] mt-3">{versionStampLine()}</div>
    </div>
  )
}
