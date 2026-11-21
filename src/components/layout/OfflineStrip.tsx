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
 * - صفحة الحضور مستثناة في AppShell: شريطها الوظيفي (SyncStatusBar)
 *   يغطي الحالة هناك بالتفصيل، ودُفّي مدمج في فرع أوفلاينه نفسه —
 *   لا شريطان مكرران أبداً.
 * - مفتاح «إظهار دُفّي» يحكم الشريط كله (قاعدة الخطة §٥-٣: كل ظهور
 *   جديد بلا استثناء): عند الإيقاف لا يظهر الشريط إطلاقاً — فهو
 *   ظهور شخصية لا قناة معلومات وحيدة، ومعلومة المزامنة الوظيفية
 *   تبقى في مكانها الأصلي داخل صفحة الحضور.
 * - الشريط معلوماتي فقط: لا يعد إلا بما تفعله مزامنة الحضور القائمة
 *   فعلاً (الحفظ على الجهاز ثم الرفع عند عودة الاتصال).
 */
export function OfflineStrip({ containerCls }: { containerCls: string }) {
  const online = useOnlineStatus()
  const mascotVisible = useMascotVisible()
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const items = useQueueItems()

  if (online || !mascotVisible) return null

  const pendingCount = teacherId
    ? itemsForTeacher(items, teacherId).filter((i) => !i.failed).length
    : 0

  return (
    <div role="status" className="bg-warn-soft border-b border-warn/50 text-warn-text">
      <div className={`mx-auto ${containerCls} px-4 py-1.5 flex items-center gap-2`}>
        <Mascot state="empty" size={22} still className="shrink-0" />
        <span className="flex-1 text-[13px] font-semibold">
          {t('mascot.offline')}
          {pendingCount > 0 ? t('attendance.syncOfflinePending', { count: pendingCount }) : ''}
        </span>
      </div>
    </div>
  )
}
