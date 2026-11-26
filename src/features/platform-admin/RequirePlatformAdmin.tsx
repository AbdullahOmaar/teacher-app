import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '../../lib/useAuth'
import { t } from '../../i18n'
import { MascotSplash } from '../../components/mascot/MascotLoader'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useIsPlatformAdmin } from './hooks'

/** حالات بوابة أدمن المنصة — قرار نقي قابل للاختبار بلا تصيير */
export type AdminGateState = 'loading' | 'signed-out' | 'denied' | 'allowed'

export interface AdminGateInput {
  /** جلسة المصادقة ما زالت تُفحص */
  sessionLoading: boolean
  /** توجد جلسة Supabase أصلاً */
  hasSession: boolean
  /** فحص صفة الأدمن (RPC) ما زال جارياً أو لم يبدأ */
  adminPending: boolean
  /** فحص الأدمن انتهى بنجاح وقال: نعم أدمن */
  isAdmin: boolean
}

/**
 * قرار البوابة: لا «allowed» إلا بجلسة قائمة + إثبات أدمن ناجح.
 * أي فشل/غياب في الفحص (ومنها غياب 0055 قبل بوابة التجميد) = denied،
 * لا دخول افتراضي أبداً — الفصل بين نوعي المستخدمين يُفرض هنا وفي
 * قاعدة البيانات (RLS) معاً، لا في الواجهة وحدها.
 */
export function adminGateState(input: AdminGateInput): AdminGateState {
  if (input.sessionLoading) return 'loading'
  if (!input.hasSession) return 'signed-out'
  if (input.adminPending) return 'loading'
  return input.isAdmin ? 'allowed' : 'denied'
}

/** شاشة الرفض: حساب مصادق لكنه ليس أدمن منصة */
function PlatformAdminDenied() {
  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center py-8">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-warn/15 text-warn-text flex items-center justify-center">
          <ShieldAlert size={28} />
        </div>
        <h1 className="type-section mb-2">{t('platformAdmin.deniedTitle')}</h1>
        <p className="text-muted type-secondary mb-5">{t('platformAdmin.deniedHint')}</p>
        <Link to="/">
          <Button variant="soft">{t('platformAdmin.backHome')}</Button>
        </Link>
      </Card>
    </div>
  )
}

/**
 * حماية مسارات /admin: طبقة فوق RequireAuth (الجلسة) تضيف إثبات نوع
 * المستخدم «أدمن منصة» عبر my_platform_admin — المدرس والمجهول لا
 * يعبران، والأدمن لا يحتاج أي ملف مدرس ليصل إلى لوحته.
 */
export function RequirePlatformAdmin() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const adminQ = useIsPlatformAdmin(Boolean(session))

  const gate = adminGateState({
    sessionLoading: loading,
    hasSession: Boolean(session),
    adminPending: adminQ.isPending,
    isAdmin: adminQ.data === true,
  })

  if (gate === 'loading') return <MascotSplash />
  if (gate === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (gate === 'denied') return <PlatformAdminDenied />
  return <Outlet />
}
