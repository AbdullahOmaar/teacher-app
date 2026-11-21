import { useEffect, useState } from 'react'
import { CheckCircle2, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import type { OfflineSyncState } from './useOfflineSync'
import { t } from '../../i18n'

/**
 * شريط حالة مزامنة الحضور أوفلاين (خطوة 11) — يعيش أعلى شاشة الحضور:
 * - أوفلاين: «غير متصل — التغييرات محفوظة على الجهاز» (+ عدد المعلّق).
 * - معلّقات بانتظار المزامنة: العدد + زر «مزامنة الآن» اليدوي.
 * - أثناء المزامنة: «جارٍ المزامنة…».
 * - عناصر فشلت نهائياً (غير شبكي، استنفدت المحاولات): تنبيه أحمر
 *   صريح بزر «إعادة المحاولة» — لا فشل صامت أبداً.
 * - نجاح حديث: «تمت المزامنة» خضراء تختفي بعد ثوانٍ.
 * الألوان من توكنز الحالات المصححة التباين، والأيقونات Lucide.
 * لا يظهر إطلاقاً في الحالة العادية (متصل + لا معلّقات + لا نجاح حديث).
 */
export function SyncStatusBar({
  online,
  sync,
}: {
  online: boolean
  sync: OfflineSyncState
}) {
  const { pendingCount, failedCount, syncing, lastSync } = sync
  // «تمت المزامنة» تظهر 5 ثوانٍ بعد آخر نجاح: نشتق العرض من طابع النجاح
  // ونخفيه بمؤقّت يعلّم ذلك الطابع مخفياً (setState داخل مؤقّت فقط)
  const [hiddenSyncAt, setHiddenSyncAt] = useState<number | null>(null)
  useEffect(() => {
    if (!lastSync) return
    const at = lastSync.at
    const t = setTimeout(() => setHiddenSyncAt(at), 5000)
    return () => clearTimeout(t)
  }, [lastSync])
  const showSynced =
    lastSync != null && pendingCount === 0 && hiddenSyncAt !== lastSync.at

  if (!online) {
    return (
      <div
        role="status"
        className="border border-warn/50 bg-warn-soft rounded-xl px-3 py-2.5 mb-3 text-[13.5px] font-semibold text-warn-text flex items-center gap-2 flex-wrap"
      >
        <CloudOff size={20} className="shrink-0" />
        <span className="flex-1">
          {t('attendance.syncOffline')}
          {pendingCount > 0 ? t('attendance.syncOfflinePending', { count: pendingCount }) : ''}
        </span>
      </div>
    )
  }

  if (failedCount > 0) {
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

  if (pendingCount > 0) {
    return (
      <div
        role="status"
        className="border border-warn/50 bg-warn-soft rounded-xl px-3 py-2.5 mb-3 text-[13.5px] font-semibold text-warn-text flex items-center gap-2 flex-wrap"
      >
        <RefreshCw size={20} className={`shrink-0 ${syncing ? 'animate-spin' : ''}`} />
        <span className="flex-1">
          {syncing
            ? t('attendance.syncingNow')
            : t('attendance.syncPending', { count: pendingCount })}
        </span>
        {!syncing && (
          <Button
            variant="soft"
            className="min-h-[48px] text-[13.5px] px-3"
            onClick={sync.syncNow}
          >
            <RefreshCw size={18} />
            {t('attendance.syncNow')}
          </Button>
        )}
      </div>
    )
  }

  if (syncing) {
    return (
      <div
        role="status"
        className="border border-border bg-soft rounded-xl px-3 py-2.5 mb-3 text-[13.5px] font-semibold text-muted flex items-center gap-2"
      >
        <RefreshCw size={20} className="shrink-0 animate-spin" />
        {t('attendance.syncing')}
      </div>
    )
  }

  if (showSynced && lastSync) {
    return (
      <div
        role="status"
        className="border border-ok/30 bg-ok-soft rounded-xl px-3 py-2.5 mb-3 text-[13.5px] font-semibold text-ok-text flex items-center gap-2"
      >
        <CheckCircle2 size={20} className="shrink-0" />
        {t('attendance.syncDone', { synced: lastSync.synced })}
      </div>
    )
  }

  return null
}
