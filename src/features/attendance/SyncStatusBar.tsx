import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import type { OfflineSyncState } from './useOfflineSync'
import { t } from '../../i18n'

/**
 * شريط حالة مزامنة الحضور أوفلاين — منذ 3A-384 (ملاحظة المالك ٢-و:
 * «مش لازم توضح للمستخدم موضوع المزامنه أو الحفظ») يعرض حالة واحدة
 * فقط: عناصر فشلت نهائياً (غير شبكي، استنفدت المحاولات) — تنبيه أحمر
 * صريح بزر «إعادة المحاولة»، فلا فشل صامت أبداً (قاعدة PAT-2).
 * بقية الحالات لا تظهر هنا إطلاقاً: انقطاع الاتصال يغطيه شريط
 * الأوفلاين العام (OfflineStrip) في كل الشاشات، والمعلّقات والمزامنة
 * الجارية والنجاح سلوك صامت افتراضي لا يحتاج شرحاً تقنياً للمستخدم.
 * خاصية online باقية في العقد لاستقرار المستدعين ولا تؤثر في العرض.
 */
export function SyncStatusBar({
  sync,
}: {
  online: boolean
  sync: OfflineSyncState
}) {
  const { pendingCount, failedCount, syncing } = sync

  if (failedCount === 0) return null

  return (
    <div
      role="alert"
      className="border border-bad/40 bg-bad-soft rounded-xl px-3 py-2.5 mb-3 text-[13.5px] font-semibold text-bad-text flex items-center gap-2 flex-wrap"
    >
      <TriangleAlert size={20} className="shrink-0" />
      <span className="flex-1">
        {t('attendance.syncFailed', { count: failedCount })}
        {pendingCount > 0 ? t('attendance.syncFailedPending', { count: pendingCount }) : ''}
      </span>
      <Button
        variant="soft"
        className="min-h-[48px] text-[13.5px] px-3"
        onClick={sync.retryFailed}
        disabled={syncing}
      >
        <RefreshCw size={18} />
        {t('common.retry')}
      </Button>
    </div>
  )
}
