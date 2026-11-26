import type { ReactNode } from 'react'
import { Hourglass } from 'lucide-react'
import { t } from '../../i18n'
import { Card } from '../../components/ui/Card'
import { ErrorState, LoadingState } from '../../components/ui/states'
import type { PanelSectionState } from './panel'

/**
 * غلاف قسم في لوحة الأدمن: يرسم حالة القسم من قرار panelSectionState
 * النقي — تحميل، أو «قريباً» مصممة عندما تكون مهاجرة القسم غير
 * مطبّقة بعد، أو خطأ مصمم بزر إعادة محاولة، أو المحتوى نفسه.
 * قاعدة مالك 2026-11-26: لا خطأ خام لخاصية غير مُطلقة أبداً.
 */
export function PanelSection({
  title,
  state,
  onRetry,
  children,
}: {
  title: string
  state: PanelSectionState
  onRetry?: () => void
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="type-section">{title}</h2>
      {state === 'loading' ? (
        <LoadingState />
      ) : state === 'coming-soon' ? (
        <ComingSoonCard />
      ) : state === 'error' ? (
        <ErrorState
          message={t('platformAdmin.sectionLoadError')}
          onRetry={onRetry}
        />
      ) : (
        children
      )}
    </section>
  )
}

/** بطاقة «قريباً» المصممة — حالة الأقسام النائمة الموحّدة في اللوحة */
export function ComingSoonCard({ hint }: { hint?: string }) {
  return (
    <Card className="text-center py-6">
      <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
        <Hourglass size={28} />
      </div>
      <div className="type-section mb-1">{t('platformAdmin.comingSoonTitle')}</div>
      <p className="text-muted type-secondary mb-0">
        {hint ?? t('platformAdmin.comingSoonHint')}
      </p>
    </Card>
  )
}
