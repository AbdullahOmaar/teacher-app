import { useEffect, useRef, useState, type ReactNode } from 'react'

interface SheetProps {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
  /** تذييل مثبت أسفل الـ Sheet (زر الحفظ في النماذج — بحث §5) يبقى ظاهراً أثناء التمرير */
  footer?: ReactNode
}

/** عتبة السحب للإغلاق (px) — بعدها يُغلق الـ Sheet عند الإفلات */
const DISMISS_THRESHOLD = 90

/**
 * مودال بنمط Bottom Sheet (بحث §5):
 * overlay معتم، sheet يصعد من الأسفل بعرض أقصى 640px وانحناء علوي 24px،
 * إغلاق بالسحب للأسفل من المقبض/الترويسة + النقر خارجاً + Escape،
 * وقفل تمرير الخلفية (body scroll lock) أثناء الفتح.
 */
export function Sheet({ open, title, onClose, children, footer }: SheetProps) {
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // قفل تمرير الخلفية أثناء فتح الـ Sheet
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientY
    setIsDragging(true)
    setDragY(0)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging || dragStart.current == null) return
    const dy = e.clientY - dragStart.current
    setDragY(Math.max(0, dy))
  }
  const endDrag = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > DISMISS_THRESHOLD) {
      onClose()
    }
    setDragY(0)
    dragStart.current = null
  }

  return (
    <div
      className="sheet-overlay-in fixed inset-0 z-50 flex items-end justify-center bg-[rgba(15,23,42,0.5)]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="sheet-panel-in bg-elevated w-full max-w-[640px] max-h-[90vh] overflow-y-auto rounded-t-[24px] p-4 shadow-raised"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 200ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* منطقة المقبض: السحب منها للأسفل يُغلق الـ Sheet */}
        <div
          className="cursor-grab active:cursor-grabbing touch-none -mt-1 pt-1 pb-2"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          role="presentation"
        >
          <div className="w-11 h-1.5 rounded-full bg-border mx-auto" />
        </div>
        {title && <h3 className="type-section mb-3">{title}</h3>}
        {children}
        {footer && (
          <div className="sticky bottom-0 bg-elevated border-t border-border -mx-4 px-4 pt-3 pb-1 mt-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
