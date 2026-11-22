import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react'

/** تعريف قسم إعدادات واحد في خريطة الصفحة (أنكورز + أكورديون) */
export interface SettingsSectionDef {
  id: string
  title: string
  icon: LucideIcon
}

/**
 * قسم إعدادات قابل للطي (موجة W3 — بحث R-11: أكورديون صفحات الأقسام):
 * ترويسة وصفية تعمل كخريطة للصفحة، والمحتوى تحتها عند الفتح. الأقسام
 * المدمجة (بطاقات مكوّنات قائمة بعناوينها الداخلية مثل Push) تُمرَّر
 * بـ bare: تُعرض كما هي ويُخفى عنوانها الداخلي اكتفاءً بالترويسة.
 */
export function SettingsSection({
  def,
  open,
  onToggle,
  bare = false,
  children,
}: {
  def: SettingsSectionDef
  open: boolean
  onToggle: () => void
  bare?: boolean
  children: ReactNode
}) {
  const Icon = def.icon
  return (
    <div
      className="mb-3 scroll-mt-[118px]"
      id={`settings-section-${def.id}`}
      data-settings-section={def.id}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 bg-card border border-border rounded-2xl px-3 min-h-[52px] cursor-pointer text-text"
      >
        <Icon size={22} className="text-primary shrink-0" />
        <span className="font-bold text-[15px] flex-1 text-start">{def.title}</span>
        {open ? (
          <ChevronUp size={20} className="text-muted shrink-0" />
        ) : (
          <ChevronDown size={20} className="text-muted shrink-0" />
        )}
      </button>
      {open &&
        (bare ? (
          <div className="mt-2 -mb-3 [&_h2]:hidden">{children}</div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-4 shadow-card mt-2">
            {children}
          </div>
        ))}
    </div>
  )
}
