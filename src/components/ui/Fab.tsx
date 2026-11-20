import { Plus } from 'lucide-react'
import type { IconComponent } from './EmptyState'

interface FabProps {
  onClick: () => void
  /** تسمية وصول إلزامية؛ عند تمرير label يظهر زر ممتد بنص بجانب الأيقونة */
  ariaLabel: string
  label?: string
  icon?: IconComponent
}

/**
 * زر الإجراء الأساسي العائم الموحد (بحث §5): ‏56px، ظل مرتفع واحد،
 * موضع ثابت فوق الشريط السفلي مع safe-area — إجراء أساسي واحد لكل شاشة قائمة.
 */
export function Fab({ onClick, ariaLabel, label, icon: Icon = Plus }: FabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`fixed z-30 bottom-[calc(88px+env(safe-area-inset-bottom,0px))] end-4 h-14 min-w-14 max-w-[calc(100vw-2rem)] bg-primary text-on-primary shadow-raised cursor-pointer border-0 flex items-center justify-center gap-2 font-bold text-[15px] hover:bg-primary-d transition-colors ${
        label ? 'rounded-full px-5' : 'rounded-full w-14'
      }`}
    >
      <Icon size={24} className="shrink-0" />
      {label ? <span className="truncate">{label}</span> : null}
    </button>
  )
}
