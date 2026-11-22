import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

/**
 * سياق المصادقة + خطافه — نُقلا من AuthProvider (3A-361): الملف كان
 * يصدّر مكوّناً (AuthProvider) وخطافاً (useAuth) معاً فيخالف
 * react(only-export-components)؛ هنا لا يوجد أي مكوّن، والمزوّد
 * وحده بقي في AuthProvider ويستورد السياق من هنا.
 */
export interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  /** false تعني الوضع التجريبي بلا اتصال بـ Supabase */
  configured: boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  configured: false,
  signOut: async () => undefined,
})

export function useAuth() {
  return useContext(AuthContext)
}
