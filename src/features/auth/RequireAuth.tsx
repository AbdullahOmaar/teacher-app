import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'
import { MascotSplash } from '../../components/mascot/MascotLoader'

/**
 * حماية المسارات الداخلية: لا محتوى بلا جلسة Supabase.
 * أثناء فحص الجلسة الأول تُعرض شاشة تحميل بلوجو دُفّي (MascotSplash —
 * أو لوجو الكتاب إن أوقف المالك الماسكوت)؛ وبدون جلسة يُعاد التوجيه
 * إلى /login مع حفظ المسار المطلوب للعودة إليه بعد الدخول.
 */
export function RequireAuth() {
  const { session, loading, configured } = useAuth()
  const location = useLocation()

  if (loading) {
    return <MascotSplash />
  }

  if (!configured || !session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
