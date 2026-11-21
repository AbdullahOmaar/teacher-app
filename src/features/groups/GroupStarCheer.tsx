import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Mascot } from '../../components/mascot/Mascot'
import { useMascotVisible } from '../../components/mascot/useMascotVisible'
import { t } from '../../i18n'
import {
  loadCelebratedMilestones,
  pickStarCelebration,
  reachedMilestones,
  saveCelebratedMilestones,
  type GroupMilestone,
} from './starCheer'

/**
 * شريط احتفال «النجم» عند محطات المجموعة (خطة الهوية P-12) — أول
 * استخدام حي لوضعية star: دُفّي بالنجمة + سطر §٨ «نجمة جديدة في
 * دفترك! شغل يستاهل يتوثّق.» + شرح واقعي للمحطة المحققة. المنطق
 * النقي في starCheer.ts (اشتقاق من قائمة المجموعة وبصمتها + مرة
 * واحدة لكل محطة لكل مجموعة من التخزين المحلي). حارس عمر الصفحة
 * يمنع احتفالين في زيارة واحدة، ومحطات نوعٍ تأخرت بياناته عن
 * احتفال الزيارة تُعلَّم بصمت في الخلفية فلا تعود في زيارة لاحقة،
 * ومفتاح «إظهار دُفّي» يحكم الشريط كله.
 */
export function GroupStarCheer({
  teacherId,
  groupId,
  studentsCount,
  sessionsCount,
}: {
  teacherId: string
  groupId: string
  /** عدد المسجلين في المجموعة — null = لم تصل البيانات بعد */
  studentsCount: number | null
  /** عدد حصص المجموعة من بصمتها — null = غير متاح بعد/لدور المساعد */
  sessionsCount: number | null
}) {
  const mascotVisible = useMascotVisible()
  const [celebrated, setCelebrated] = useState<ReadonlySet<string>>(() =>
    loadCelebratedMilestones(teacherId, groupId),
  )
  const [current, setCurrent] = useState<GroupMilestone | null>(null)
  /** احتفال عُرض في تركيب الصفحة هذا — حارس «واحد لكل زيارة» */
  const [shown, setShown] = useState(false)

  // تبديل المجموعة دون فكّ التركيب (نفس نمط المسار): ضبط الحالة
  // أثناء التصيير عند تغيّر الهوية — نمط React الموثق لضبط الحالة
  // من الخصائص، بدل إفكت يعيد التحميل بعد أول رسم
  const [prevIdentity, setPrevIdentity] = useState(`${teacherId}:${groupId}`)
  const identity = `${teacherId}:${groupId}`
  if (prevIdentity !== identity) {
    setPrevIdentity(identity)
    setCelebrated(loadCelebratedMilestones(teacherId, groupId))
    setCurrent(null)
    setShown(false)
  }

  useEffect(() => {
    const reached = reachedMilestones({ students: studentsCount, sessions: sessionsCount })
    // تعليم كل المحطات المحققة «محتفَلاً بها» دفعة واحدة (العتبات
    // تراكمية: وصول ٢٥ يعني أن ١٠ تحققت قبله) — ويشمل محطات نوعٍ
    // تصل بياناته متأخرة بعد احتفال هذه الزيارة (بصمة المجموعة بعد
    // قائمتها مثلاً): تُعلَّم بصمت ولا تُطلق احتفالاً ثانياً أبداً،
    // فلا يعود الشريط في زيارة لاحقة بمحطة كانت محققة من أول مرة
    const markAll = (): ReadonlySet<string> => {
      const next = new Set(celebrated)
      for (const m of reached) next.add(m.id)
      if (next.size !== celebrated.size) {
        setCelebrated(next)
        saveCelebratedMilestones(teacherId, groupId, next)
      }
      return next
    }
    if (current !== null || shown) {
      markAll()
      return
    }
    const pick = pickStarCelebration(reached, celebrated)
    if (!pick) return
    setShown(true)
    setCurrent(pick)
    markAll()
  }, [studentsCount, sessionsCount, celebrated, current, shown, teacherId, groupId])

  if (!mascotVisible || !current) return null

  return (
    <div
      role="status"
      className="border border-warn/40 bg-warn-soft rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2.5"
    >
      <Mascot state="star" size={44} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-bold text-warn-text">{t('mascot.achievement')}</div>
        <div className="text-[12.5px] text-warn-text opacity-80">
          {current.kind === 'students'
            ? t('groups.starStudents', { count: current.threshold })
            : t('groups.starSessions', { count: current.threshold })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setCurrent(null)}
        aria-label={t('common.close')}
        className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-transparent border-0 text-warn-text cursor-pointer"
      >
        <X size={18} />
      </button>
    </div>
  )
}
