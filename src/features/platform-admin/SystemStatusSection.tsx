import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Archive,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Link2,
  Loader2,
  RefreshCw,
  Server,
  XCircle,
} from 'lucide-react'
import { t } from '../../i18n'
import { versionStampLine } from '../../lib/buildInfo'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useLastBackupAt } from './hooks'
import {
  buildSystemLinks,
  checkAppHealth,
  checkDbHealth,
  copyTextToClipboard,
  productionUrl,
  type HealthProbeResult,
  type SystemLinks,
} from './systemStatus'

/**
 * قسم «حالة النظام» (3A-933 — طلب مالك 2026-11-28): الأدمن يتأكد
 * إن الدنيا تمام من مكان واحد — الروابط الرسمية بزر نسخ لكل واحد،
 * نسخة البناء ووقت نشره من lib/buildInfo (مصدر سطر الإصدار نفسه)،
 * فحوص سلامة حية تُقاس لحظة فتح القسم (لا قيم محفوظة)، ووقت آخر
 * نسخة ليلية من نقطة ربطها في platform_settings. القسم داخل بوابة
 * /admin نفسها فلا سطح صلاحيات جديد، وكل غياب (رابط برودكشن غير
 * مضبوط/نسخ غير مفعّل/فحص لا يرد) حالة مصممة — لا خطأ خام أبداً.
 */
export function SystemStatusSection() {
  const [links] = useState<SystemLinks>(() =>
    buildSystemLinks(window.location.origin, productionUrl()),
  )
  const [appProbe, setAppProbe] = useState<HealthProbeResult | null>(null)
  const [dbProbe, setDbProbe] = useState<HealthProbeResult | null>(null)
  const [checking, setChecking] = useState(true)
  const [runId, setRunId] = useState(0)
  const backupQ = useLastBackupAt(true)

  // الفحص عند فتح القسم وكل إعادة: الحالة تُضبط في استمرار الوعد
  // فقط (لا ضبط متزامن داخل الأثر) — النتائج حالات معروضة لا أخطاء.
  useEffect(() => {
    let cancelled = false
    void Promise.all([checkAppHealth(), checkDbHealth()]).then(([app, db]) => {
      if (cancelled) return
      setAppProbe(app)
      setDbProbe(db)
      setChecking(false)
    })
    return () => {
      cancelled = true
    }
  }, [runId])

  function recheck() {
    setAppProbe(null)
    setDbProbe(null)
    setChecking(true)
    setRunId((n) => n + 1)
  }

  return (
    <section className="space-y-3">
      <h2 className="type-section">{t('platformAdmin.systemStatusTitle')}</h2>

      <Card className="space-y-3">
        <div className="font-semibold text-[15px] flex items-center gap-2">
          <Link2 size={18} className="text-primary" />
          {t('platformAdmin.systemLinksTitle')}
        </div>
        <LinkRow
          label={t('platformAdmin.systemProductionLink')}
          url={links.production}
          missingText={t('platformAdmin.systemProductionUnpublished')}
        />
        <LinkRow label={t('platformAdmin.systemDemoLink')} url={links.demo} />
        <LinkRow
          label={t('platformAdmin.systemBookingLink')}
          url={links.booking}
        />
      </Card>

      <Card className="space-y-2">
        <div className="font-semibold text-[15px]">
          {t('platformAdmin.systemVersionTitle')}
        </div>
        <p className="text-muted type-secondary mb-0">{versionStampLine()}</p>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="font-semibold text-[15px]">
            {t('platformAdmin.systemHealthTitle')}
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={checking}
            onClick={recheck}
          >
            <RefreshCw size={15} />
            {t('platformAdmin.systemRecheck')}
          </Button>
        </div>
        <HealthRow
          icon={<Server size={18} className="text-primary" />}
          label={t('platformAdmin.systemAppResponds')}
          probe={appProbe}
          showLatency
        />
        <HealthRow
          icon={<Database size={18} className="text-primary" />}
          label={t('platformAdmin.systemDbResponds')}
          probe={dbProbe}
        />
      </Card>

      <Card className="space-y-2">
        <div className="font-semibold text-[15px] flex items-center gap-2">
          <Archive size={18} className="text-primary" />
          {t('platformAdmin.systemBackupTitle')}
        </div>
        {backupQ.isError ? (
          <p className="text-muted type-secondary mb-0">
            {t('platformAdmin.systemBackupReadError')}
          </p>
        ) : backupQ.data ? (
          <p className="type-secondary mb-0">
            {t('platformAdmin.systemBackupLastLabel')}:{' '}
            <span className="font-semibold">
              {new Date(backupQ.data).toLocaleString('ar-EG')}
            </span>
          </p>
        ) : (
          <>
            <p className="font-semibold text-[14px] mb-0">
              {t('platformAdmin.systemBackupDormant')}
            </p>
            <p className="text-muted type-secondary mb-0">
              {t('platformAdmin.systemBackupDormantHint')}
            </p>
          </>
        )}
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// صف رابط رسمي: التسمية + الرابط (اتجاه LTR لكسر صحيح) + زر نسخ
// بتغذية راجعة «اتنسخ». غياب الرابط (البرودكشن) = نص مصمم بلا زر.
// ---------------------------------------------------------------------------

type CopyState = 'idle' | 'copied' | 'failed'

function LinkRow({
  label,
  url,
  missingText,
}: {
  label: string
  url: string | null
  missingText?: string
}) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  async function onCopy() {
    if (!url) return
    const copied = await copyTextToClipboard(url)
    setCopyState(copied ? 'copied' : 'failed')
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopyState('idle'), 2500)
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[14px] font-semibold">{label}</span>
        {url ? (
          <Button size="sm" variant="ghost" onClick={() => void onCopy()}>
            {copyState === 'copied' ? <Check size={15} /> : <Copy size={15} />}
            {copyState === 'copied'
              ? t('platformAdmin.systemCopied')
              : t('platformAdmin.systemCopyLink')}
          </Button>
        ) : null}
      </div>
      {url ? (
        <div
          dir="ltr"
          className="text-start text-[13px] text-muted break-all bg-soft rounded-lg px-3 py-2"
        >
          {url}
        </div>
      ) : (
        <p className="text-muted type-secondary mb-0">{missingText}</p>
      )}
      {copyState === 'failed' && (
        <p className="text-muted text-[12.5px] mb-0">
          {t('platformAdmin.systemCopyFailed')}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// صف فحص حي: جارٍ الفحص (probe=null) ثم شغال/لا يرد — الفشل حالة
// معروضة بشريحة لونية، لا خطأ خام أبداً.
// ---------------------------------------------------------------------------

function HealthRow({
  icon,
  label,
  probe,
  showLatency = false,
}: {
  icon: ReactNode
  label: string
  probe: HealthProbeResult | null
  showLatency?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <span className="flex items-center gap-2 text-[14px] font-semibold">
        {icon}
        {label}
        {showLatency && probe?.ok && probe.latencyMs !== null && (
          <span className="text-muted text-[12.5px] font-normal">
            {t('platformAdmin.systemHealthLatency', { ms: probe.latencyMs })}
          </span>
        )}
      </span>
      {probe === null ? (
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
          <Loader2 size={15} className="animate-spin" />
          {t('platformAdmin.systemHealthChecking')}
        </span>
      ) : probe.ok ? (
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-emerald-600">
          <CheckCircle2 size={16} />
          {t('platformAdmin.systemHealthOk')}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-red-600">
          <XCircle size={16} />
          {t('platformAdmin.systemHealthDown')}
        </span>
      )}
    </div>
  )
}
