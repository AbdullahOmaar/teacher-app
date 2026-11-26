import { Building2, CheckCircle2, GraduationCap, ShieldCheck } from 'lucide-react'
import { t } from '../../i18n'
import { Card } from '../../components/ui/Card'
import { ErrorState, LoadingState } from '../../components/ui/states'
import { usePlatformOverview } from './hooks'

/**
 * لوحة أدمن المنصة — نسخة الأساس (مهمة 17، الخطوة 1): أرقام تجميعية
 * فقط من platform_overview (عدّ مدرسين/مفعّلين/طلاب) — لا قوائم
 * حسابات ولا إدارة باقات هنا؛ تلك خطوات 3–7 من خطة الأدمن. الصفحة
 * لا تُرسم إلا خلف RequirePlatformAdmin، والخادم نفسه يرفض الـ RPC
 * لغير الأدمن، فالدفاع مزدوج (بوابة + قاعدة).
 */
export function PlatformAdminPage() {
  const overviewQ = usePlatformOverview(true)

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <header className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-full bg-card shadow-card flex items-center justify-center text-primary">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h1 className="type-title">{t('platformAdmin.pageTitle')}</h1>
            <p className="text-muted type-secondary">{t('platformAdmin.intro')}</p>
          </div>
        </header>

        <h2 className="type-section">{t('platformAdmin.overviewTitle')}</h2>

        {overviewQ.isPending ? (
          <LoadingState />
        ) : overviewQ.isError ? (
          <ErrorState
            message={t('platformAdmin.loadError')}
            onRetry={() => void overviewQ.refetch()}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="text-center py-5">
              <Building2 size={22} className="mx-auto mb-2 text-primary" />
              <div className="type-title">{overviewQ.data.teachersTotal}</div>
              <div className="text-muted type-secondary">
                {t('platformAdmin.teachersTotal')}
              </div>
            </Card>
            <Card className="text-center py-5">
              <CheckCircle2 size={22} className="mx-auto mb-2 text-primary" />
              <div className="type-title">{overviewQ.data.teachersActivated}</div>
              <div className="text-muted type-secondary">
                {t('platformAdmin.teachersActivated')}
              </div>
            </Card>
            <Card className="text-center py-5">
              <GraduationCap size={22} className="mx-auto mb-2 text-primary" />
              <div className="type-title">{overviewQ.data.studentsTotal}</div>
              <div className="text-muted type-secondary">
                {t('platformAdmin.studentsTotal')}
              </div>
            </Card>
          </div>
        )}

        <Card>
          <p className="text-muted type-secondary">{t('platformAdmin.foundationNote')}</p>
        </Card>
      </div>
    </div>
  )
}
