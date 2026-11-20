import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/AuthProvider'

/**
 * حماية المسارات الداخلية: لا محتوى بلا جلسة Supabase.
 * أثناء فحص الجلسة الأول تُعرض شاشة تحميل؛ وبدون جلسة يُعاد التوجيه
 * إلى /login مع حفظ المسار المطلوب للعودة إليه بعد الدخول.
 */
export function RequireAuth() {
  const { session, loading, configured } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center">
        <div className="text-muted text-[14px]">بنحمّل…</div>
      </div>
    )
  }

  if (!configured || !session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
