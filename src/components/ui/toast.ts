import { createContext, useContext } from 'react'

/** نوع التوست: نجاح (افتراضي) أو خطأ (PAT-2 — كان كل توست أخضر حتى الأخطاء) */
export type ToastKind = 'success' | 'error'

/** سياق التوست الموحد — انظر Toast.tsx للمزوّد والعرض */
export const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {})

/** إظهار توست من أي مكوّن داخل ToastProvider: const toast = useToast() */
export function useToast() {
  return useContext(ToastContext)
}
