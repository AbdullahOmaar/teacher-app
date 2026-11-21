import { useState, type ReactNode } from 'react'
import { Logo } from '../brand/Logo'
import { useMascotVisible } from './useMascotVisible'
import welcomeImg from '../../assets/mascot/welcome.webp'
import celebrateImg from '../../assets/mascot/celebrate.webp'
import attendanceImg from '../../assets/mascot/attendance.webp'
import emptyImg from '../../assets/mascot/empty.webp'
import alertImg from '../../assets/mascot/alert.webp'
import successImg from '../../assets/mascot/success.webp'
import loadingImg from '../../assets/mascot/loading.webp'

// ===========================================================================
// دُفّي — مكوّن الماسكوت (MASCOT-PLAN §٦ بند ٢)
//
// الأوضاع الستة من الشيت المعتمد + ربط موثّق لوضع thinking: رسمة
// «بيفكّر» لم تُنتَج بعد (§٣ بند ٩ «يُنتج تاليًا»)، فـ thinking يستخدم
// رسمة لوجو التحميل (الوقوف والتلويح) — وهي رسمة مؤشرات التحميل داخل
// الصفحات في خطة الأنيميشن (§٤) أصلاً — حتى تُنتج رسمة التفكير.
// لقطة اللابتوب (§٣ بند ٧) أصل هوية/بطل محفوظ في assets/mascot/laptop.webp
// لاستخدامات لاحقة (صفحة تعريف/سوشيال) ولا حالة عرض لها هنا.
//
// الحركة: كلاسات CSS خفيفة لكل حالة (index.css — mascot-*) تعمل فقط
// تحت prefers-reduced-motion: no-preference. سلسلة السقوط عند فشل أي
// صورة: وضع بديل ثابت (اللوجو) ثم لوجو الكتاب — لا سطح ينكسر أبداً.
// الإخفاء الكلي من إعداد المدرس (useMascotVisible) يحكم كل النقاط.
// الصورة زخرفية دائماً (aria-hidden): المعنى تنقله النصوص المرافقة.
// ===========================================================================

export type MascotState =
  | 'welcome'
  | 'celebrate'
  | 'attendance'
  | 'empty'
  | 'alert'
  | 'success'
  | 'thinking'

const POSES: Record<MascotState, string> = {
  welcome: welcomeImg,
  celebrate: celebrateImg,
  attendance: attendanceImg,
  empty: emptyImg,
  alert: alertImg,
  success: successImg,
  // ربط موثّق (انظر الترويسة): لا رسمة تفكير بعد — رسمة لوجو التحميل
  thinking: loadingImg,
}

/** كلاس الحركة الخفيفة لكل حالة — بلا حركة = سلسلة فارغة */
const MOTION_CLASS: Record<MascotState, string> = {
  welcome: 'mascot-wave',
  celebrate: 'mascot-jump',
  attendance: '',
  empty: 'mascot-breathe',
  alert: 'mascot-nudge',
  success: 'mascot-bob',
  thinking: '',
}

interface MascotProps {
  state: MascotState
  /** عرض الصورة بالبكسل (الارتفاع تلقائي بحسب نسبة الرسمة) */
  size?: number
  className?: string
  /** إيقاف الحركة الخفيفة (الصورة ثابتة) — للأسطح المزدحمة بصرياً */
  still?: boolean
  /**
   * ما يُعرض بدلاً من دُفّي عندما يكون الماسكوت موقوفاً من الإعدادات —
   * للأسطح التي تحتاج عنصراً بصرياً دائماً (كحالة الفراغ: أيقونتها).
   * غيابه = لا شيء (النقطة نفسها اختيارية الظهور بالكامل).
   */
  fallback?: ReactNode
}

export function Mascot({ state, size = 96, className = '', still = false, fallback = null }: MascotProps) {
  const visible = useMascotVisible()
  // سلسلة السقوط مشتقة لا مرحلية: الرسمة التي فشل تحميلها تُستبعَد من
  // الترشيح (وضع ← لوجو ثابت ← لوجو الكتاب) — بلا إفكتات ولا إعادة ضبط
  const [failedSrcs, setFailedSrcs] = useState<ReadonlySet<string>>(new Set())

  if (!visible) return <>{fallback}</>

  const pose = POSES[state]
  const src = !failedSrcs.has(pose) ? pose : !failedSrcs.has(loadingImg) ? loadingImg : null

  if (src === null) {
    // آخر سقوط آمن: لوجو الكتاب الأصلي بنفس الحجم — لا فراغ ولا كسر
    return <Logo size={size} className={className} decorative />
  }

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      draggable={false}
      onError={() => setFailedSrcs((prev) => new Set(prev).add(src))}
      className={`${still ? '' : MOTION_CLASS[state]} select-none ${className}`}
      style={{ width: size, height: 'auto', display: 'block' }}
    />
  )
}
