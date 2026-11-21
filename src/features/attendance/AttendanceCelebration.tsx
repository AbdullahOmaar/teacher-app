import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Mascot } from '../../components/mascot/Mascot'
import { useMascotVisible } from '../../components/mascot/useMascotVisible'
import { t } from '../../i18n'
import {
  dismissCelebration,
  initialCelebrationTracker,
  observeCompletion,
} from './celebration'

/**
 * شريط احتفال إكمال حضور مجموعة (خطة الهوية P-7) — أول استخدام حي
 * لحالة attendance: دُفّي باللوحة + سطر §٨ «الحضور اتاخد كله… يومك
 * بقى أخف.» عند اكتمال ترميز كل طلاب الجلسة. منطق الظهور كله في
 * celebration.ts النقي (انتقال فقط + مرة واحدة لكل جلسة)؛ هذا
 * المكوّن يغذّيه بالملاحظات ويرسم الشريط. وضع attendance بلا كلاس
 * حركة أصلاً (ثابت — وreduced-motion محترم بذلك دائماً)، ومفتاح
 * «إظهار دُفّي» يحكم الشريط كله: الإيقاف = لا احتفال إطلاقاً.
 */
export function AttendanceCelebration({
  sessionId,
  isComplete,
}: {
  sessionId: string | null
  /** null = بيانات الجلسة لم تجهز بعد (لا ملاحظة) */
  isComplete: boolean | null
}) {
  const [tracker, setTracker] = useState(initialCelebrationTracker)
  useEffect(() => {
    setTracker((prev) => observeCompletion(prev, sessionId, isComplete))
  }, [sessionId, isComplete])
  const mascotVisible = useMascotVisible()

  if (!mascotVisible || !sessionId || tracker.visibleSessionId !== sessionId) {
    return null
  }

  return (
    <div
      role="status"
      className="border border-ok/30 bg-ok-soft rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2.5"
    >
      <Mascot state="attendance" size={44} className="shrink-0" />
      <span className="flex-1 text-[14px] font-bold text-ok-text">
        {t('mascot.attendanceDone')}
      </span>
      <button
        type="button"
        onClick={() => setTracker((prev) => dismissCelebration(prev))}
        aria-label={t('common.close')}
        className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-transparent border-0 text-ok-text cursor-pointer"
      >
        <X size={18} />
      </button>
    </div>
  )
}
