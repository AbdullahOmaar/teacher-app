import { useEffect, useState } from 'react'
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

/**
 * زر الإجراء الأساسي العائم الموحد (بحث §5): ‏56px، ظل مرتفع واحد،
 * موضع ثابت فوق الشريط السفلي مع safe-area — إجراء أساسي واحد لكل شاشة قائمة.
 *
 * نمط «كلمة ثم أيقونة» (3A-317 — ملاحظات المالك ٣): عند وجود label يفتح
 * الزر ممتداً بكلمته كاملة، ثم ينكمش بنعومة إلى الأيقونة فقط — بعد مهلة
 * قصيرة أو عند أول تمرير، أيهما أول — فتبقى الشاشة أخفّ والإجراء حاضراً.
 * ‏aria-label ثابت في الحالتين، وقاعدة reduced-motion العامة تُسطّح
 * الانتقال تلقائياً.
 */
export function Fab({ onClick, ariaLabel, label, icon: Icon = Plus }: FabProps) {
  const [expanded, setExpanded] = useState(true)

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
      className={`fixed z-30 bottom-[calc(88px+env(safe-area-inset-bottom,0px))] end-4 h-14 min-w-14 max-w-[calc(100vw-2rem)] bg-primary text-on-primary shadow-raised cursor-pointer border-0 flex items-center justify-center font-bold text-[15px] rounded-full hover:bg-primary-d transition-all duration-300 ${
        expanded ? 'px-5 gap-2' : 'px-0 gap-0'
      }`}
    >
      <Icon size={24} className="shrink-0" />
      <span
        aria-hidden={!expanded}
        className={`truncate overflow-hidden transition-all duration-300 ${
          expanded ? 'max-w-[200px] opacity-100' : 'max-w-0 opacity-0'
        }`}
      >
        {label}
      </span>
    </button>
  )
}
