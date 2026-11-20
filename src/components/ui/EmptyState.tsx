import type { ComponentType } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button } from './Button'

export type IconComponent = ComponentType<{ size?: number | string; className?: string; strokeWidth?: number | string }>

interface EmptyStateProps {
  /** أيقونة Lucide (مكوّن) — لا إيموجي في الواجهة نهائياً (بحث §5) */
  icon?: IconComponent
  title: string
  hint?: string
  /** زر إجراء اختياري تحت الإرشاد */
  action?: { label: string; onClick: () => void }
}

/** حالة الفراغ الكاملة — أيقونة Lucide + عنوان + إرشاد + زر إجراء اختياري (بحث §5) */
export function EmptyState({ icon: Icon = FolderOpen, title, hint, action }: EmptyStateProps) {
  return (
    <div className="text-center py-10 px-4">
      <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
        <Icon size={28} />
      </div>
      <div className="type-section mb-1">{title}</div>
      {hint && <div className="text-muted type-secondary">{hint}</div>}
      {action && (
        <div className="mt-4">
          <Button onClick={action.onClick}>{action.label}</Button>
        </div>
      )}
    </div>
  )
}
