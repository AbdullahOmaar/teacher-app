import { useState } from 'react'
import { CheckCircle2, Download, MonitorSmartphone, Share } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useInstallPrompt } from '../../lib/installPrompt'

/**
 * بطاقة «تثبيت التطبيق» في الإعدادات (خطوة 11 — PWA): المكان الوحيد
 * لعرض التثبيت، بنمط غير مزعج (لا بانرات ولا منبثقات تلقائية):
 * - لو المتصفح أتاح beforeinstallprompt: زر تثبيت مباشر.
 * - لو مثبّت أصلاً: تأكيد حالة.
 * - غير ذلك (خصوصاً iOS/Safari حيث لا يوجد الحدث): إرشاد يدوي قصير
 *   (مشاركة ← إضافة إلى الشاشة الرئيسية).
 * التطبيق قابل للتثبيت فعلياً بالـ manifest + الـ SW + الأيقونات
 * بغض النظر عن هذه البطاقة — هي مجرد تلميح/اختصار.
 */
export function InstallAppCard() {
  const { canPrompt, isInstalled, promptInstall } = useInstallPrompt()
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleInstall = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const outcome = await promptInstall()
      if (outcome === 'accepted') setMsg('تمام — التطبيق بيُثبّت على جهازك دلوقتي.')
      else if (outcome === 'dismissed') setMsg('اتأجل التثبيت — الزر هيفضل هنا وقت ما تحب.')
      else setMsg('التثبيت المباشر مش متاح من المتصفح ده — جرّب الإرشاد اليدوي تحت.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="type-section mt-0 mb-3 flex items-center gap-2">
        <MonitorSmartphone size={22} className="text-primary" /> تثبيت التطبيق
      </h2>
      {isInstalled ? (
        <p className="text-[13.5px] bg-ok-soft text-ok-text rounded-xl px-3 py-2 mb-0 mt-0 flex items-center gap-2 font-semibold">
          <CheckCircle2 size={18} className="shrink-0" />
          التطبيق مثبّت على جهازك وبيفتح في وضع التطبيق الكامل.
        </p>
      ) : (
        <>
          <p className="text-muted text-[13.5px] mt-0 mb-3">
            ثبّت «تطبيق المدرس» على شاشة جهازك: بيفتح أسرع وبملء الشاشة،
            وتسجيل الحضور بيشتغل حتى لو النت قطع (بيتزامن لما يرجع).
          </p>
          {canPrompt && (
            <Button full onClick={handleInstall} disabled={busy} className="mb-3">
              <Download size={20} />
              {busy ? 'جارٍ التثبيت…' : 'تثبيت التطبيق على الجهاز'}
            </Button>
          )}
          {msg && (
            <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{msg}</p>
          )}
          <p className="text-muted text-[13.5px] mb-0 flex items-start gap-2">
            <Share size={18} className="shrink-0 mt-0.5" />
            <span>
              لو مفيش زر تثبيت (زي Safari في آيفون): من قائمة المشاركة في
              المتصفح اختر «إضافة إلى الشاشة الرئيسية». وفي Chrome/Edge
              هتلاقي «تثبيت التطبيق» في قائمة المتصفح كمان.
            </span>
          </p>
        </>
      )}
    </Card>
  )
}
