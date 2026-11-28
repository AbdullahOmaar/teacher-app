import type { Ref } from 'react'
import { CheckCheck, ScanQrCode } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { ATTENDANCE_STATUSES, STATUS_FILL } from '../api'
import { t } from '../../../i18n'

/**
 * شريط ملخص لاصق: عدّادات حية لكل حالة + «الكل حاضر» —
 * يطفو فوق الشريط السفلي أثناء تمرير القائمة ويتحدث مع كل تعديل.
 * يتبعه فاصل سفلي بارتفاع الشريط نفسه (مقاس فعلياً
 * بـ ResizeObserver — 3A-324): الشريط كان يطفو فوق
 * آخر المحتوى (زر «إرسال وصل» للطالب الأخير مقصوص
 * وراءه)؛ الفاصل يمنح القائمة مدى تمرير إضافياً بقدر
 * ارتفاع الشريط فيمرّ كل محتوى بالكامل فوقه.
 */
export function SummaryBar({
  barRef,
  barH,
  statusCounts,
  cancelled,
  anyNotPresent,
  syncing,
  onScanOpen,
  onMarkAllPresent,
}: {
  barRef: Ref<HTMLDivElement>
  barH: number
  statusCounts: Record<'p' | 'a' | 'l' | 'm' | 'none', number>
  cancelled: boolean
  anyNotPresent: boolean
  syncing: boolean
  onScanOpen: () => void
  onMarkAllPresent: () => void
}) {
  return (
    <>
      <div ref={barRef} className="sticky bottom-[calc(84px+env(safe-area-inset-bottom,0px))] lg:static z-10 mt-1">
        <div className="bg-card border border-border shadow-raised rounded-2xl px-3 py-2">
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
            {ATTENDANCE_STATUSES.map(({ code, label }) => (
              <span key={code} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: STATUS_FILL[code] }}
                  aria-hidden="true"
                />
                {label} {statusCounts[code]}
              </span>
            ))}
            <span className="text-[13.5px] font-semibold text-muted">
              {statusCounts.none > 0
                ? t('attendance.remainingNoStatus', { count: statusCounts.none })
                : t('attendance.allMarked')}
            </span>
          </div>
          {/* مسح QR + الكل حاضر: زرّان صغيران متجاوران في صف
              مستقل (3A-384 — ملاحظات المالك ٢-هـ و٦): كانا
              يزاحمان العدّادات فينكسر الشريط. و«الكل حاضر»
              نفسه يتغيّر شكله بعد تطبيقه (أخضر مُطبَّق +
              علامتا صح) ويبقى ظاهراً معطّلاً بدل أن يختفي */}
          {!cancelled && (
            <div className="flex gap-2 mt-2">
              <Button
                variant="soft"
                size="sm"
                className="flex-1"
                onClick={onScanOpen}
              >
                <ScanQrCode size={16} />
                {t('attendance.scanQr')}
              </Button>
              {anyNotPresent ? (
                <Button
                  variant="soft"
                  size="sm"
                  className="flex-1"
                  onClick={onMarkAllPresent}
                  disabled={syncing}
                >
                  <CheckCheck size={16} />
                  {t('attendance.markAllPresent')}
                </Button>
              ) : (
                <Button
                  variant="soft"
                  size="sm"
                  className="flex-1 border border-ok/40"
                  style={{
                    backgroundColor: 'var(--ok-soft)',
                    color: 'var(--ok-text)',
                  }}
                  disabled
                  aria-label={t('attendance.markAllPresent')}
                >
                  <CheckCheck size={16} />
                  {t('attendance.markAllPresent')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      {/* الفاصل بلا معنى على الديسكتوب: الشريط هناك ثابت داخل السكة
          الجانبية اللاصقة لا عائم فوق المحتوى (3A-930) */}
      <div aria-hidden="true" className="lg:hidden" style={{ height: barH }} />
    </>
  )
}
