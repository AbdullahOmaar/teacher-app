import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  /** false تعني الوضع التجريبي بلا اتصال بـ Supabase */
  configured: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  configured: false,
  signOut: async () => undefined,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      // وضع تجريبي: لا توجد جلسة ولا اتصال
      setLoading(false)
      return
    }

    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: isSupabaseConfigured,
      signOut: async () => {
        // مسح بقايا الجهاز حتى لا يرثها الحساب التالي (SEC-L5): اختيار
        // مساحة العمل دائماً، ومفتاح طابور الحضور فقط إن كان فارغاً —
        // عناصر معلّقة غير مُزامَنة بيانات مستخدم لا تُحذف أبداً عند
        // الخروج (وهي مقيدة بـ teacher_id ولا تُزامَن إلا في جلسته)
        try {
          localStorage.removeItem('teacher-app-active-teacher')
          const rawQueue = localStorage.getItem('teacher-app-attendance-queue-v1')
          if (rawQueue) {
            const parsed: unknown = JSON.parse(rawQueue)
            if (Array.isArray(parsed) && parsed.length === 0) {
              localStorage.removeItem('teacher-app-attendance-queue-v1')
            }
          }
        } catch {
          // تجاهل: تخزين غير متاح
        }
        await supabase?.auth.signOut()
      },
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
