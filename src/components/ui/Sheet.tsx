import { useEffect, type ReactNode } from 'react'

interface SheetProps {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
}

/**
 * مودال بنمط Bottom Sheet كما في المرجع (§6.6):
 * overlay معتم، sheet يصعد من الأسفل بعرض أقصى 640px وانحناء علوي 22px،
 * إغلاق بالضغط خارجاً أو Escape.
 */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(15,23,42,0.5)]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-card w-full max-w-[640px] max-h-[90vh] overflow-y-auto rounded-t-[22px] p-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="w-10 h-1 rounded-full bg-border mx-auto mb-3" />
        {title && <h3 className="text-[17px] font-bold mb-3">{title}</h3>}
        {children}
      </div>
    </div>
  )
}
