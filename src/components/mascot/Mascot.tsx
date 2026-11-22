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
import thinkingImg from '../../assets/mascot/thinking.webp'
import oopsImg from '../../assets/mascot/oops.webp'
import inspectorImg from '../../assets/mascot/inspector.webp'
import writingImg from '../../assets/mascot/writing.webp'
import explainingImg from '../../assets/mascot/explaining.webp'
import starImg from '../../assets/mascot/star.webp'
import laptopImg from '../../assets/mascot/laptop.webp'

// ===========================================================================
// دُفّي — مكوّن الماسكوت (MASCOT-PLAN §٦ بند ٢)
//
// الأوضاع الستة من الشيت الأول المعتمد + أوضاع الشيت الثاني (دفعة الهوية
// ٢ — خطة الهوية P-4/P-5/P-6): thinking برسمة التفكير الحقيقية (أُغلق
// ربط 3A-303 المؤقت بلوجو التحميل)، oops للخطأ والـ404 و«غير موجود»،
// inspector للمخاطر، writing للدرجات/الواجبات، explaining للشرح و«ابدأ
// هنا». حالة star وجدت موضعها في احتفالات محطات المجموعات (P-12)،
// وكل الأوضاع تُعاين في معرض الإعدادات (P-13).
// لقطة اللابتوب (§٣ بند ٧) كانت أصل هوية/بطل محفوظاً في
// assets/mascot/laptop.webp لاستخدامات لاحقة بلا حالة عرض — وبقرار
// 3A-325 (دفعة ملاحظات المالك ٥، بند ٢) بقيت حالة عرض رسمية: مؤشر
// السحب للتحديث المتحرك (PullToRefresh) بحركة «شغل على لابتوب».
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
  | 'oops'
  | 'inspector'
  | 'writing'
  | 'explaining'
  | 'star'
  | 'laptop'

const POSES: Record<MascotState, string> = {
  welcome: welcomeImg,
  celebrate: celebrateImg,
  attendance: attendanceImg,
  empty: emptyImg,
  alert: alertImg,
  success: successImg,
  thinking: thinkingImg,
  oops: oopsImg,
  inspector: inspectorImg,
  writing: writingImg,
  explaining: explainingImg,
  star: starImg,
  laptop: laptopImg,
}

/** كلاس الحركة الخفيفة لكل حالة — بلا حركة = سلسلة فارغة */
const MOTION_CLASS: Record<MascotState, string> = {
  welcome: 'mascot-wave',
  celebrate: 'mascot-jump',
  attendance: '',
  empty: 'mascot-breathe',
  alert: 'mascot-nudge',
  success: 'mascot-bob',
  thinking: 'mascot-bob',
  oops: '',
  inspector: '',
  writing: '',
  explaining: 'mascot-bob',
  star: 'mascot-jump',
  laptop: 'mascot-type',
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
  /**
   * تجاوز رؤية خارجي (خطة الهوية P-10): للأسطح العامة بلا جلسة
   * (البوابات) حيث تأتي الرؤية من حمولة خادمية — إعداد مدرس السنتر
   * كما أعاده RPC البوابة في brand.show_mascot — لا من جلسة متصفح
   * الزائر. عند تمريره يحسم وحده ويُتجاهَل مصدر الجلسة تماماً.
   */
  visibleOverride?: boolean
}

export function Mascot({ state, size = 96, className = '', still = false, fallback = null, visibleOverride }: MascotProps) {
  const sessionVisible = useMascotVisible()
  const visible = visibleOverride ?? sessionVisible
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
