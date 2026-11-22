import { useEffect, useRef, useState, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { Mascot } from '../mascot/Mascot'
import { useMascotVisible, usePrefersReducedMotion } from '../mascot/useMascotVisible'
import { t } from '../../i18n'
import {
  initialPtrState,
  ptrCancel,
  ptrEnd,
  ptrMove,
  ptrRefreshed,
  ptrStart,
  PTR_MAX_PULL_PX,
  PTR_THRESHOLD_PX,
  type PtrState,
} from './pullToRefresh'

/**
 * السحب للتحديث (خطة الهوية P-11 — 3A-307): إيماءة لمس من قمة الصفحة
 * تُظهر مؤشر دُفّي (سطر §٨ «ثواني… بقلّب في الدفتر.») ينزلق مع السحب،
 * والإفلات فوق العتبة يُطلق onRefresh الخاص بالصفحة (إبطال
 * استعلاماتها). منطق الإيماءة كله في pullToRefresh.ts النقي؛
 * هذا المكوّن يربط أحداث اللمس به ويرسم المؤشر.
 *
 * مؤشر اللابتوب المتحرك (3A-325 — دفعة ملاحظات المالك ٥، بند ٢):
 * دُفّي بوضعية اللابتوب (state="laptop"، حركة mascot-type «شغل على
 * لابتوب») بدل وضع التفكير الثابت، وغلافه يحمل تحوّل تقدم مرتبطاً
 * بمسافة السحب نفسها: كلما اقترب السحب من عتبة الإطلاق اعتدل دُفّي
 * (rotate من ‎-7deg‎ إلى ‎0deg‎) وكبر (scale من ‎0.85‎ إلى ‎1‎) —
 * تغذية بصرية فورية بقرب الإطلاق بلا حالة React أثناء السحب.
 *
 * قرارات تصميم موثقة:
 * - موضع المؤشر يُكتب مباشرة على DOM (لا حالة React أثناء السحب) حتى
 *   لا يُعاد تصيير محتوى الصفحة الثقيل مع كل حدث لمس.
 * - المؤشر طبقة ثابتة (fixed) فوق المحتوى — لا يحجز مكاناً في التدفق
 *   فلا يزاح أي محتوى ولا يتأثر التولبار/الترويسات اللاصقة (3A-304).
 * - الانخراط من قمة الصفحة فقط، وقفل الاتجاه يحمي تمرير رقائق
 *   الفلاتر الأفقي، وقفل تمرير الخلفية (شيت/مودال مفتوح) يمنع
 *   الانخراط أصلاً. preventDefault أثناء السحب العمودي يمنع تحديث
 *   متصفح كروم الأصلي للصفحة (يرافقه overscroll-behavior في CSS).
 * - مفتاح «إظهار دُفّي» يحكم المؤشر: مطفياً يبقى سهم تحديث محايد
 *   (الإيماءة وظيفة لا ظهور شخصية) ويسقط سطر دُفّي لأنه صوته.
 * - تقليل الحركة: المؤشر يظهر بعتامة فقط في موضع ثابت بلا انزلاق.
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  /** إعادة جلب بيانات الصفحة (إبطال استعلاماتها) — تُستدعى مرة عند الإطلاق */
  onRefresh: () => Promise<unknown>
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const doffyRef = useRef<HTMLSpanElement>(null)
  // هل كُتب تحوّل تقدم على غلاف دُفّي؟ (لتصفيره مرة واحدة عند الحاجة
  // في فرع تقليل الحركة بدل كتابته مع كل حدث لمس)
  const doffyTransformedRef = useRef(false)
  const stateRef = useRef<PtrState>(initialPtrState)
  const refreshRef = useRef(onRefresh)
  const [refreshing, setRefreshing] = useState(false)
  const mascotVisible = useMascotVisible()
  const reducedMotion = usePrefersReducedMotion()
  const reducedRef = useRef(reducedMotion)
  // المرايا تُحدَّث في إفكتات لا أثناء التصيير (قاعدة refs في اللنت):
  // مستمعات اللمس (تُربط مرة واحدة) تقرأ أحدث قيم من هذه المرايا
  useEffect(() => {
    refreshRef.current = onRefresh
  })
  useEffect(() => {
    reducedRef.current = reducedMotion
  }, [reducedMotion])

  /** كتابة موضع المؤشر/عتامته مباشرة — المسار الحار أثناء السحب */
  function applyIndicator(pull: number, animate: boolean) {
    const el = indicatorRef.current
    if (!el) return
    el.style.transition = animate ? 'transform 220ms ease-out, opacity 180ms ease-out' : 'none'
    if (reducedRef.current) {
      // بلا انزلاق: ظهور بعتامة فقط في موضع ثابت أعلى المحتوى،
      // وبلا أي تحوّل تقدم على غلاف دُفّي (يُصفَّر مرة واحدة إن كُتب)
      el.style.transform = 'translateY(10px)'
      el.style.opacity = pull > 0 ? '1' : '0'
      if (doffyTransformedRef.current && doffyRef.current) {
        doffyRef.current.style.transform = ''
        doffyTransformedRef.current = false
      }
      return
    }
    const y = Math.min(-52 + pull * 0.97, -52 + PTR_MAX_PULL_PX * 0.97)
    el.style.transform = `translateY(${y}px)`
    el.style.opacity = String(Math.min(pull / 32, 1))
    // تحوّل تقدم دُفّي المرتبط بمسافة السحب (3A-325): يعتدل ويكبر
    // كلما اقترب الإطلاق — يُكتب على الغلاف لا على الصورة نفسها حتى
    // لا يتصارع مع حركة mascot-type على عنصر واحد
    const doffy = doffyRef.current
    if (doffy) {
      const frac = Math.min(Math.max(pull / PTR_THRESHOLD_PX, 0), 1)
      doffy.style.transform = `rotate(${-7 + 7 * frac}deg) scale(${0.85 + 0.15 * frac})`
      doffyTransformedRef.current = true
    }
  }

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    /** سطح مفتوح فوق الصفحة؟ الشيتات تقفل تمرير الخلفية على body */
    const isBlocked = () =>
      document.body.style.overflow === 'hidden' ||
      document.querySelector('[role="dialog"]') !== null
    const atTop = () => window.scrollY <= 0 && document.documentElement.scrollTop <= 0

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        // لمسة ثانية أثناء التتبع = إلغاء (لا إطلاق أبداً من إيماءة مشوشة)
        stateRef.current = ptrCancel(stateRef.current)
        applyIndicator(0, true)
        return
      }
      const touch = e.touches[0]
      stateRef.current = ptrStart(stateRef.current, touch.clientX, touch.clientY, {
        atTop: atTop(),
        blocked: isBlocked(),
      })
    }
    const onTouchMove = (e: TouchEvent) => {
      const s = stateRef.current
      if (s.phase !== 'tracking') return
      if (isBlocked()) {
        stateRef.current = ptrCancel(s)
        applyIndicator(0, true)
        return
      }
      const touch = e.touches[0]
      const next = ptrMove(s, touch.clientX, touch.clientY)
      stateRef.current = next
      if (next.direction === 'vertical' && next.pull > 0) {
        // منع تمرير الصفحة/تحديث المتصفح الأصلي أثناء سحب منخرط فقط —
        // اللمسات العادية والتمرير الأفقي لا تُمسّ أبداً
        e.preventDefault()
        applyIndicator(next.pull, false)
      } else if (next.direction !== 'none') {
        applyIndicator(0, false)
      }
    }
    const onTouchEnd = () => {
      const { state, trigger } = ptrEnd(stateRef.current)
      stateRef.current = state
      if (!trigger) {
        applyIndicator(0, true)
        return
      }
      setRefreshing(true)
      applyIndicator(state.pull, true)
      const startedAt = Date.now()
      void Promise.resolve()
        .then(() => refreshRef.current())
        .catch(() => {
          // فشل إعادة الجلب ليس حدث إيماءة: أسطح الصفحة نفسها تعرض
          // أخطاء استعلاماتها؛ هنا ننهي المؤشر فقط بلا ابتلاع إضافي
        })
        .then(async () => {
          // حد أدنى لظهور المؤشر حتى لا يومض مع جلب سريع جداً
          const wait = 450 - (Date.now() - startedAt)
          if (wait > 0) await new Promise((r) => setTimeout(r, wait))
        })
        .then(() => {
          stateRef.current = ptrRefreshed(stateRef.current)
          setRefreshing(false)
          applyIndicator(0, true)
        })
    }
    const onTouchCancel = () => {
      stateRef.current = ptrCancel(stateRef.current)
      applyIndicator(0, true)
    }

    wrap.addEventListener('touchstart', onTouchStart, { passive: true })
    wrap.addEventListener('touchmove', onTouchMove, { passive: false })
    wrap.addEventListener('touchend', onTouchEnd, { passive: true })
    wrap.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      wrap.removeEventListener('touchstart', onTouchStart)
      wrap.removeEventListener('touchmove', onTouchMove)
      wrap.removeEventListener('touchend', onTouchEnd)
      wrap.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [])

  return (
    <div ref={wrapRef}>
      {/* المؤشر: طبقة ثابتة متمركزة أعلى الشاشة فوق المحتوى وتحت الشيتات */}
      <div
        ref={indicatorRef}
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-30 flex justify-center pointer-events-none opacity-0"
      >
        <div className="flex items-center gap-2 bg-elevated border border-border shadow-raised rounded-full ps-2 pe-3 py-1.5">
          {mascotVisible ? (
            <>
              <span ref={doffyRef} className="flex shrink-0">
                <Mascot state="laptop" size={30} />
              </span>
              <span className="text-[12.5px] font-semibold text-muted">{t('mascot.loading')}</span>
            </>
          ) : (
            <RefreshCw
              size={18}
              className={`text-muted ${refreshing ? 'animate-spin' : ''}`}
            />
          )}
        </div>
      </div>
      <span className="sr-only" role="status">
        {refreshing ? t('common.loading') : t('common.pullToRefresh')}
      </span>
      {children}
    </div>
  )
}
