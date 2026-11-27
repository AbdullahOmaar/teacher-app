import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '../../lib/useAuth'
import { t } from '../../i18n'
import { MascotSplash } from '../../components/mascot/MascotLoader'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ErrorState } from '../../components/ui/states'
import { useIsPlatformAdmin, useMfaStatus } from './hooks'
import {
  MfaChallengeScreen,
  MfaEnrollScreen,
  MfaUnavailableScreen,
  SignOutButton,
} from './MfaScreens'
import type { MfaStatus } from './mfa'

/** حالات بوابة أدمن المنصة — قرار نقي قابل للاختبار بلا تصيير */
export type AdminGateState =
  | 'loading'
  | 'signed-out'
  | 'denied'
  | 'mfa-enroll'
  | 'mfa-challenge'
  | 'mfa-unavailable'
  | 'mfa-error'
  | 'allowed'

export interface AdminGateInput {
  /** جلسة المصادقة ما زالت تُفحص */
  sessionLoading: boolean
  /** توجد جلسة Supabase أصلاً */
  hasSession: boolean
  /** فحص صفة الأدمن (RPC) ما زال جارياً أو لم يبدأ */
  adminPending: boolean
  /** فحص الأدمن انتهى بنجاح وقال: نعم أدمن */
  isAdmin: boolean
  /** فحص حالة MFA جارٍ أو لم يبدأ */
  mfaPending: boolean
  /** فحص MFA انتهى بخطأ (لا حالة موثوقة) */
  mfaError: boolean
  /** حالة MFA الموثقة — null عند غيابها (لا دخول بلا حالة) */
  mfaStatus: MfaStatus | null
}

/**
 * قرار البوابة: لا «allowed» إلا بجلسة قائمة + إثبات أدمن ناجح +
 * عامل TOTP موثّق + جلسة aal2. أي فشل/غياب في الفحص (ومنها غياب
 * 0055 قبل بوابة التجميد) = denied، والمدرّس يُرفض قبل فحص MFA
 * إطلاقاً. الفصل بين نوعي المستخدمين يُفرض هنا وفي قاعدة البيانات
 * (RLS) معاً، لا في الواجهة وحدها — وشرط aal2 في الواجهة هو طبقة
 * العميل؛ والإنفاذ الخادمي الكامل (0067) خطوة لاحقة موثقة.
 */
export function adminGateState(input: AdminGateInput): AdminGateState {
  if (input.sessionLoading) return 'loading'
  if (!input.hasSession) return 'signed-out'
  if (input.adminPending) return 'loading'
  if (!input.isAdmin) return 'denied'
  if (input.mfaPending) return 'loading'
  if (input.mfaError || input.mfaStatus === null) return 'mfa-error'
  if (input.mfaStatus.unavailable) return 'mfa-unavailable'
  if (!input.mfaStatus.enrolled) return 'mfa-enroll'
  if (input.mfaStatus.aal !== 'aal2') return 'mfa-challenge'
  return 'allowed'
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

/** شاشة خطأ فحص MFA: مصممة بزر إعادة محاولة + خروج، لا نص خام */
function MfaErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <ErrorState
          message={t('platformAdmin.mfaStatusError')}
          onRetry={onRetry}
        />
        <div className="flex items-center justify-center gap-4 mt-3">
          <Link to="/">
            <Button variant="soft">{t('platformAdmin.backHome')}</Button>
          </Link>
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}

/**
 * حماية مسارات /admin: طبقة فوق RequireAuth (الجلسة) تضيف إثبات نوع
 * المستخدم «أدمن منصة» عبر my_platform_admin ثم شرط التحقق بخطوتين
 * (TOTP، مهمة 23): أدمن بلا عامل موثّق يُوجَّه للتسجيل من جلسته
 * نفسها (تمهيد أول أدمن ممكن دائماً)، وأدمن بعامل موثّق وجلسة aal1
 * يُوجَّه للتحدي، وأدمن بـ aal2 فقط يعبر. المدرس والمجهول لا يعبران،
 * والأدمن لا يحتاج أي ملف مدرس ليصل إلى لوحته.
 */
export function RequirePlatformAdmin() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const adminQ = useIsPlatformAdmin(Boolean(session))
  const isAdmin = adminQ.data === true
  const mfaQ = useMfaStatus(isAdmin)

  const gate = adminGateState({
    sessionLoading: loading,
    hasSession: Boolean(session),
    adminPending: adminQ.isPending,
    isAdmin,
    mfaPending: mfaQ.isPending,
    mfaError: mfaQ.isError,
    mfaStatus: mfaQ.data ?? null,
  })

  if (gate === 'loading') return <MascotSplash />
  if (gate === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (gate === 'denied') return <PlatformAdminDenied />
  if (gate === 'mfa-error') {
    return <MfaErrorScreen onRetry={() => void mfaQ.refetch()} />
  }
  if (gate === 'mfa-unavailable') return <MfaUnavailableScreen />
  if (gate === 'mfa-enroll') {
    return (
      <MfaEnrollScreen
        unverifiedFactorId={mfaQ.data?.unverifiedFactorId ?? null}
      />
    )
  }
  if (gate === 'mfa-challenge') {
    const factorId = mfaQ.data?.factorId
    if (!factorId) {
      return <MfaEnrollScreen unverifiedFactorId={null} />
    }
    return <MfaChallengeScreen factorId={factorId} />
  }
  return <Outlet />
}
