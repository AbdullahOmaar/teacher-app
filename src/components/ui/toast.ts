import { createContext, useContext } from 'react'

/** سياق التوست الموحد — انظر Toast.tsx للمزوّد والعرض */
export const ToastContext = createContext<(message: string) => void>(() => {})

/** إظهار توست من أي مكوّن داخل ToastProvider: const toast = useToast() */
export function useToast() {
  return useContext(ToastContext)
}
