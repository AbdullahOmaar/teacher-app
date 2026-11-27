import { TriangleAlert } from 'lucide-react'
import { Sheet } from '../../components/ui/Sheet'
import { t } from '../../i18n'

/**
 * حاجز الترقية الناعم (0062 — الخطوة 5): يظهر عند محاولة كتابة
 * جديدة بعد بلوغ الحد — القراءة ماشية، والكتابة واقفة، ودعوة
 * الترقية ظاهرة. لا بوابة دفع هنا (الدفع قرار مالك ق3): الترقية
 * تتم من إدارة المنصة. إغلاق الحاجز يرجع للقائمة فقط — الحد نفسه
 * لا يتغيّر، فالمحاولة التالية تعرضه من جديد.
 */
export function UsageBarrier({
  open,
  onClose,
  limitKey,
  limit,
  used,
}: {
  open: boolean
  onClose: () => void
  limitKey: 'max_students' | 'max_messages_month'
  limit: number | null
  used: number
}) {
  const body =
    limitKey === 'max_students'
      ? t('settings.usageBarrierStudentsBody')
      : t('settings.usageBarrierMessagesBody')
  const usageLine =
    limit === null
      ? `${used.toLocaleString('ar-EG')}`
      : `${used.toLocaleString('ar-EG')} / ${limit.toLocaleString('ar-EG')}`
  return (
    <Sheet open={open} title={t('settings.usageBarrierTitle')} onClose={onClose}>
      <div className="flex flex-col items-center text-center gap-3 py-2">
        <TriangleAlert size={40} className="text-warn-text" aria-hidden="true" />
        <p className="text-[15px] font-semibold mb-0">{body}</p>
        <p className="text-muted text-[13.5px] mb-0">{usageLine}</p>
        <p className="text-muted text-[13.5px] mb-0">
          {t('settings.usageBarrierContact')}
        </p>
      </div>
    </Sheet>
  )
}
