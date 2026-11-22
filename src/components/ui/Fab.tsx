import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import type { IconComponent } from './EmptyState'

interface FabProps {
  onClick: () => void
  /** تسمية وصول إلزامية؛ عند تمرير label يظهر زر ممتد بنص بجانب الأيقونة */
  ariaLabel: string
  label?: string
  icon?: IconComponent
}

/** مدة بقاء الكلمة كاملة قبل الانكماش للأيقونة فقط (3A-317) */
const LABEL_LINGER_MS = 2600

/** منحنى حركة واحد لكل خصائص الانكماش — تزامنها هو سرّ النعومة */
const SHRINK_EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'

/**
 * زر الإجراء الأساسي العائم الموحد (بحث §5): ‏56px، ظل مرتفع واحد،
 * موضع ثابت فوق الشريط السفلي مع safe-area — إجراء أساسي واحد لكل شاشة قائمة.
 *
 * نمط «كلمة ثم أيقونة» (3A-317 — ملاحظات المالك ٣): عند وجود label يفتح
 * الزر ممتداً بكلمته كاملة، ثم ينكمش بنعومة إلى الأيقونة فقط — بعد مهلة
 * قصيرة أو عند أول تمرير، أيهما أول — فتبقى الشاشة أخفّ والإجراء حاضراً.
 * ‏aria-label ثابت في الحالتين، وقاعدة reduced-motion العامة تُسطّح
 * الانتقال تلقائياً.
 *
 * آلية الانكماش (3A-324 — ملاحظات المالك ٤: «التصغير مش سلس، بيتحرك
 * على مراحل»): السبب الجذري الذي كشفه القياس الحي على العنصر نفسه:
 * قاعدة CSS العامة في index.css ‏(button,a { transition: ألوان فقط
 * 180ms }) مكتوبة بلا طبقة (unlayered) فتكسب في التتالي على كلاسات
 * طبقة utilities كلها — أي أن صندوق الزر نفسه لم يكن ينتقل إطلاقاً
 * مهما وُضعت عليه كلاسات transition، وحدها العناصر الداخلية (span/
 * svg) كانت تتحرك، فينهار الصندوق قفزة واحدة حولها. يُضاف لها أن
 * آلية max-width القديمة (200px→0) كانت نصفها «منطقة ميتة» فوق
 * عرض النص الفعلي. الآلية المعتمدة: (١) عرض الكلمة يُقاس فعلياً من
 * DOM ويأخذ الزر عرضاً صريحاً بالبكسل في الحالتين (ممتد = الكلمة +
 * أيقونة وحشوة، مقفول = 48)؛ (٢) انتقال الزر نفسه inline style
 * محدد النطاق (العرض/الارتفاع/الحشوة/الفجوة 500ms بنفس المنحنى +
 * ألوان 180ms كما في قاعدة التطبيق العامة) — الأسلوب المضمّن يكسب
 * القاعدة العامة دون المساس بها، وقاعدة reduced-motion ذات
 * !important ما زالت تُسطّح الكل؛ (٣) غلاف الكلمة يُحرَّك بالبكسل
 * من عرضه الحقيقي إلى 0 وشفافيته تتلاشى معه، والأيقونة تصغر
 * بـ scale متناسب (24←20) — فتُقرأ حركة واحدة مستمرة.
 * المقاس المقفول 48×48px: أصغر من 56 السابقة بطلب المالك، وهو نفسه
 * حدّ اللمس الإرشادي الأدنى (Material ‏48dp / إرشادات اللمس الآمن) —
 * أصغر من كده كان هيكسر سلامة اللمس لزر الإجراء الأساسي.
 */
export function Fab({ onClick, ariaLabel, label, icon: Icon = Plus }: FabProps) {
  const [expanded, setExpanded] = useState(true)
  // عرض الكلمة الحقيقي مقاساً من DOM — أساس حركة الانكماش بالبكسل
  const labelRef = useRef<HTMLSpanElement | null>(null)
  const [labelW, setLabelW] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = labelRef.current
    if (!el) return
    const measure = () => setLabelW(el.offsetWidth)
    measure()
    // خط العرض قد يصل بعد أول قياس فيغيّر عرض النص — أعد القياس عند
    // جاهزية الخطوط حتى لا تنكمش الكلمة لعرض أضيق/أوسع من نصّها
    let cancelled = false
    if (typeof document.fonts !== 'undefined') {
      document.fonts.ready
        .then(() => {
          if (!cancelled) measure()
        })
        .catch(() => {
          // واجهة الخطوط غير متاحة: القياس الأول يبقى هو المعتمد
        })
    }
    return () => {
      cancelled = true
    }
  }, [label])

  useEffect(() => {
    if (!label) return
    const timer = setTimeout(() => setExpanded(false), LABEL_LINGER_MS)
    const onScroll = () => setExpanded(false)
    // capture: تمرير الحاويات الداخلية (قوائم الصفحات) لا يفقّع للـ window دائماً
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [label])

  if (!label) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className="fixed z-30 bottom-[calc(88px+env(safe-area-inset-bottom,0px))] end-4 h-14 w-14 bg-primary text-on-primary shadow-raised cursor-pointer border-0 flex items-center justify-center rounded-full hover:bg-primary-d transition-colors"
      >
        <Icon size={24} className="shrink-0" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-expanded={expanded}
      className={`fixed z-30 bottom-[calc(88px+env(safe-area-inset-bottom,0px))] end-4 max-w-[calc(100vw-2rem)] bg-primary text-on-primary shadow-raised cursor-pointer border-0 flex items-center justify-center font-bold text-[15px] rounded-full hover:bg-primary-d ${
        expanded ? 'h-14 px-5 gap-2' : 'h-12 px-0 gap-0'
      }`}
      style={{
        width: expanded ? (labelW != null ? labelW + 72 : undefined) : 48,
        // انتقال مضمّن محدد النطاق: قاعدة التطبيق العامة للأزرار
        // (unlayered) تحجب أي transition من الكلاسات — انظر شرح
        // الآلية أعلى المكوّن (3A-324)
        transition:
          'width 500ms cubic-bezier(0.22,1,0.36,1), height 500ms cubic-bezier(0.22,1,0.36,1), padding 500ms cubic-bezier(0.22,1,0.36,1), gap 500ms cubic-bezier(0.22,1,0.36,1), background-color 180ms ease-out, color 180ms ease-out, opacity 180ms ease-out',
      }}
    >
      <Icon
        size={24}
        className={`shrink-0 transition-transform duration-500 ${SHRINK_EASE} ${
          expanded ? 'scale-100' : 'scale-[0.83]'
        }`}
      />
      <span
        aria-hidden={!expanded}
        className={`overflow-hidden transition-all duration-500 ${SHRINK_EASE} ${
          expanded ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ width: expanded ? (labelW ?? undefined) : 0 }}
      >
        <span ref={labelRef} className="inline-block whitespace-nowrap">
          {label}
        </span>
      </span>
    </button>
  )
}
