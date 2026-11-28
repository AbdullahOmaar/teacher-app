import { useState } from 'react'
import { CheckCircle2, Download, MonitorSmartphone, Share } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useInstallPrompt } from '../../lib/installPrompt'
import { t } from '../../i18n'

/**
 * بطاقة «تثبيت التطبيق» داخل البوابات العامة (ملاحظة المالك الحية
 * 2026-11-28): نفس آلية بطاقة الإعدادات (InstallAppCard) ونفس
 * useInstallPrompt — بلا مسار تثبيت موازٍ:
 * - لو المتصفح أتاح beforeinstallprompt: زر تثبيت مباشر يعمل.
 * - لو مثبّت أصلاً: تأكيد حالة.
 * - غير ذلك (خصوصاً iOS/Safari حيث لا يوجد الحدث): إرشاد يدوي
 *   مصمم (مشاركة ← إضافة إلى الشاشة الرئيسية) — لا زر ميت أبداً.
 * نصوصها من قاموس البوابات (portal.*) لأن جمهورها الطالب وولي
 * الأمر لا المدرس.
 */
export function PortalInstallCard() {
  const { canPrompt, isInstalled, promptInstall } = useInstallPrompt()
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleInstall = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const outcome = await promptInstall()
      if (outcome === 'accepted') setMsg(t('portal.installAccepted'))
      else if (outcome === 'dismissed') setMsg(t('portal.installDismissed'))
      else setMsg(t('portal.installUnavailable'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h3 className="type-section mt-5 mb-2 flex items-center gap-2">
        <MonitorSmartphone size={22} className="text-primary" />
        {t('portal.installTitle')}
      </h3>
      <Card>
        {isInstalled ? (
          <p className="text-[13.5px] bg-ok-soft text-ok-text rounded-xl px-3 py-2 mb-0 mt-0 flex items-center gap-2 font-semibold">
            <CheckCircle2 size={18} className="shrink-0" />
            {t('portal.installInstalled')}
          </p>
        ) : (
          <>
            <p className="text-muted text-[13.5px] mt-0 mb-3">{t('portal.installIntro')}</p>
            {canPrompt && (
              <Button full onClick={handleInstall} disabled={busy} className="mb-3">
                <Download size={20} />
                {busy ? t('portal.installInstalling') : t('portal.installAction')}
              </Button>
            )}
            {msg && <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{msg}</p>}
            <p className="text-muted text-[13.5px] mb-0 flex items-start gap-2">
              <Share size={18} className="shrink-0 mt-0.5" />
              <span>{t('portal.installManualHint')}</span>
            </p>
          </>
        )}
      </Card>
    </>
  )
}
