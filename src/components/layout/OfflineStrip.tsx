import { CloudOff } from 'lucide-react'
import { Mascot } from '../mascot/Mascot'
import { useMascotVisible } from '../mascot/useMascotVisible'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import {
  useOnlineStatus,
  useQueueItems,
} from '../../features/attendance/useOfflineSync'
import { itemsForTeacher } from '../../features/attendance/offlineQueue'
import { t } from '../../i18n'

/**
 * شريط الأوفلاين العام (خطة الهوية P-9 — §٨ سطر ١٢): شريط رفيع على
 * مستوى AppShell يظهر عند انقطاع الاتصال في أي شاشة: دُفّي النايم +
 * «مفيش نت — شغلك محفوظ» (صياغة المالك) + عدّاد عناصر الحضور
 * المعلّقة لهذا المدرس حيثما وُجدت. يختفي تلقائياً عند عودة الاتصال
 * (useOnlineStatus على حدثي online/offline).
 *
 * قرارات موثقة:
 * - صفحة الحضور كانت مستثناة قديماً؛ منذ 3A-384 صار شريطها الوظيفي
 *   (SyncStatusBar) لحالة فشل المزامنة فقط (طلب المالك إخفاء كلام
 *   الحفظ/المزامنة الروتيني)، فصار هذا الشريط هو مؤشر الأوفلاين الوحيد
 *   هناك أيضاً — لا شريطان مكرران أبداً.
 * - مفتاح «إظهار دُفّي» يحكم الشريط في الشاشات العادية (قاعدة الخطة
 *   §٥-٣: كل ظهور جديد بلا استثناء): عند الإيقاف لا يظهر الشريط هناك.
 *   **استثناء الحضور (essential):** منذ 3A-384 صار هذا الشريط مؤشر
 *   الأوفلاين الوحيد في صفحة الحضور (شريطها الوظيفي للفشل النهائي
 *   فقط)، فلا يختفي هناك بإيقاف دُفّي — يظهر بأيقونة CloudOff بديلة
 *   (ضمانة فرع الأوفلاين القديم في SyncStatusBar قبل 3A-384، وشرط
 *   مراجعتَي الكود والأمان المستقلتين B2).
 * - الشريط معلوماتي فقط: لا يعد إلا بما تفعله مزامنة الحضور القائمة
 *   فعلاً (الحفظ على الجهاز ثم الرفع عند عودة الاتصال).
 */
export function OfflineStrip({
  containerCls,
  essential = false,
}: {
  containerCls: string
  /** شاشة لا بديل فيها عن المؤشر (الحضور): يظهر ولو أُوقف دُفّي */
  essential?: boolean
}) {
  const online = useOnlineStatus()
  const mascotVisible = useMascotVisible()
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const items = useQueueItems()

  if (online || (!mascotVisible && !essential)) return null

  const pendingCount = teacherId
    ? itemsForTeacher(items, teacherId).filter((i) => !i.failed).length
    : 0

  return (
    <div role="status" className="bg-warn-soft border-b border-warn/50 text-warn-text">
      <div className={`mx-auto ${containerCls} px-4 py-1.5 flex items-center gap-2`}>
        {mascotVisible ? (
          <Mascot state="empty" size={22} still className="shrink-0" />
        ) : (
          <CloudOff size={18} className="shrink-0" />
        )}
        <span className="flex-1 text-[13px] font-semibold">
          {t('mascot.offline')}
          {pendingCount > 0 ? t('attendance.syncOfflinePending', { count: pendingCount }) : ''}
        </span>
      </div>
    </div>
  )
}
