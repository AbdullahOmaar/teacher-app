import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './supabase'
import { clearUserLocalData } from './logoutCleanup'
import { AuthContext, type AuthContextValue } from './useAuth'

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
        // مسح بقايا الجهاز حتى لا يرثها الحساب التالي (SEC-L5 — الجرد
        // الكامل والتصنيف في lib/logoutCleanup): مفاتيح الجلسة وحالة
        // الواجهة المنسوبة للمدرس النشط تُحذف، وطابور الحضور المعلّق
        // بيانات مستخدم لا تُحذف أبداً (يُحذف مفتاحه فارغاً فقط)
        try {
          clearUserLocalData(localStorage)
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
