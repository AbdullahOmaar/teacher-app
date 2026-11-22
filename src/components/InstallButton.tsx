import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Download } from 'lucide-react'
import { useInstallPrompt } from '../lib/installPrompt'
import { t } from '../i18n'

/**
 * مفتاح جلسة: ضغطة/تجاهل التنقّل يُخفي الزر لبقية الجلسة فقط —
 * جلسة جديدة (إعادة فتح المتصفح/تبويب جديد) تُعيد إظهاره (3A-317).
 */
const SESSION_HIDDEN_KEY = 'pwa-install-cta-hidden'

function sessionHidden(): boolean {
  try {
    return sessionStorage.getItem(SESSION_HIDDEN_KEY) === '1'
  } catch {
    // sessionStorage قد يُحجب (وضع خاص/متصفحات مقيّدة) — الحالة في الذاكرة تكفي
    return false
  }
}

function markSessionHidden() {
  try {
    sessionStorage.setItem(SESSION_HIDDEN_KEY, '1')
  } catch {
    // نفس تعليل القراءة: الإخفاء بالحالة المحلية يظل فعّالاً لهذه الجلسة
  }
}

/**
 * زر تثبيت PWA بسلوك ذكي (3A-317 — ملاحظات المالك ٣، بند ٢):
 * - يظهر فقط عندما يعرض المتصفح التثبيت فعلاً (beforeinstallprompt ملتقط)
 *   والتطبيق غير مثبّت/لا يعمل standalone — عبر useInstallPrompt القائم.
 * - لو لم يُضغط وانتقل المستخدم لصفحة أخرى: يختفي لبقية الجلسة، ويعود
 *   في جلسة جديدة — لا بانر لاصق ولا إلحاح.
 * - موضعه مقابل الـ Fab (start بدل end) فلا يزاحمه، وفوق الشريط السفلي.
 * بطاقة الإعدادات تبقى سطح التثبيت الدائم كما هي.
 */
export function InstallButton() {
  const { canPrompt, isInstalled, promptInstall } = useInstallPrompt()
  const location = useLocation()
  const [hidden, setHidden] = useState(sessionHidden)
  const firstPath = useRef(location.pathname)
  const interacted = useRef(false)

  useEffect(() => {
    if (location.pathname !== firstPath.current && !interacted.current) {
      markSessionHidden()
      setHidden(true)
    }
  }, [location.pathname])

  if (!canPrompt || isInstalled || hidden) return null

  return (
    <button
      type="button"
      aria-label={t('settings.installTitle')}
      onClick={() => {
        interacted.current = true
        void promptInstall().finally(() => {
          markSessionHidden()
          setHidden(true)
        })
      }}
      className="fixed z-30 bottom-[calc(88px+env(safe-area-inset-bottom,0px))] start-4 h-12 px-4 rounded-full bg-card text-text border border-border-interactive shadow-raised cursor-pointer flex items-center gap-2 font-bold text-[14px]"
    >
      <Download size={20} className="text-primary shrink-0" />
      {t('settings.installTitle')}
    </button>
  )
}
