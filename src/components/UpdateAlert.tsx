import { useState, useSyncExternalStore } from 'react'
import { RefreshCw } from 'lucide-react'
import { t } from '../i18n'
import {
  getStaleClientSnapshot,
  subscribeStaleClient,
} from '../lib/staleClient'
import { forceClientUpdate } from '../lib/versionGuard'
import { Button } from './ui/Button'

/**
 * ألرت التحديث الثابت (3A-903 — مطلب المالك 2026-11-26 20:06): لما
 * تُكتشف نسخة قديمة (حارس النسخة بعد فشل الشفاء الصامت، أو خطأ فئة
 * المفتاح القديم) يظهر هذا الألرت المصمم — لا خطأ خام ولا سكوت —
 * وبلا أي زر إغلاق: يبقى ظاهراً حتى يضغط المستخدم «تحديث التطبيق»
 * فيعيد التحميل القسري لأحدث بناء، وبعدها لا تعود الإشارة أصلاً.
 *
 * يُركَّب عند جذر التطبيق في App (خارج المسارات) فيظهر قبل الدخول
 * (شاشتا الدخول وإنشاء الحساب في لقطات المالك) وبعده على حد سواء.
 *
 * فحص 375px (قراءةً من كود التخطيط): الشريط بعرض الشاشة كاملاً مع
 * حشوة جانبية 16px، والمحتوى عمودي — صف (أيقونة + عنوان) ثم نص ثم
 * زر بعرض كامل (هدف لمس 48px) — فلا عنصر أفقياً مضغوطاً عند 375px
 * ولا تمرير أفقياً؛ والنصان قصيران بسطر واحد/سطرين على هذا العرض.
 * مكانه أسفل الشاشة فوق شريط التنقل (z-80) لأنه قرار مطلوب من
 * المستخدم الآن، بعكس التوست العابر.
 */
export function UpdateAlert() {
  const stale = useSyncExternalStore(
    subscribeStaleClient,
    getStaleClientSnapshot,
    () => false,
  )
  const [updating, setUpdating] = useState(false)
  if (!stale) return null

  const onUpdate = () => {
    setUpdating(true)
    forceClientUpdate().catch(() => {
      // مصير واضح عند فشل الإجراء (مسح/تنقّل): إعادة الزر لحالته حتى
      // يعيد المستخدم الضغط — الألرت نفسه لا يختفي أبداً من تلقائه
      setUpdating(false)
    })
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] px-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
      <div
        role="alert"
        className="bg-card border border-border rounded-2xl p-4 shadow-raised"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="w-9 h-9 rounded-full bg-soft text-primary flex items-center justify-center shrink-0">
            <RefreshCw size={18} className={updating ? 'animate-spin' : undefined} />
          </span>
          <div className="type-section">{t('shell.updateAlert.title')}</div>
        </div>
        <p className="type-secondary text-muted mb-3">{t('shell.updateAlert.body')}</p>
        <Button full disabled={updating} onClick={onUpdate}>
          <RefreshCw size={18} />
          {updating ? t('shell.updateAlert.updating') : t('shell.updateAlert.action')}
        </Button>
      </div>
    </div>
  )
}
