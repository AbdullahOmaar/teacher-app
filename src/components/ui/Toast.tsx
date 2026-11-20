import { useCallback, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { ToastContext } from './toast'

/**
 * نظام التوست الموحد (بحث §5): موضع واحد ومدة واحدة لكل التطبيق —
 * أسفل الشاشة فوق الشريط السفلي (مع safe-area)، ومدة العرض 3500ms.
 * الاستخدام: لفّ التطبيق بـ ToastProvider مرة واحدة، وفي أي مكوّن:
 * const toast = useToast(); toast('تم الحفظ')
 */
const TOAST_DURATION_MS = 3500

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((next: string) => {
    setMessage(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), TOAST_DURATION_MS)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-[70] flex justify-center px-4 pointer-events-none"
        >
          <div className="pointer-events-auto flex items-center gap-2 bg-text text-bg type-secondary font-semibold rounded-full px-4 min-h-[48px] shadow-raised">
            <CheckCircle2 size={20} className="shrink-0" />
            <span>{message}</span>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
