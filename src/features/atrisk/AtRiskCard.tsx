import { Link } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { useAtRisk } from './hooks'
import { t } from '../../i18n'

/**
 * بطاقة «معرّضون للفقد» في الرئيسية (Phase 5 / خطوة 1): تظهر فقط عند
 * وجود حالات فعلية — عدد الطلاب وأخطر سببين (أول طالبين في ترتيب
 * الخطورة وسبب كلٍّ منهما الأول) — وتفتح صفحة القائمة الكاملة.
 *
 * حجز المكان أثناء التحميل (موجة W1 — بند د-3): اشتقاق المعرّضين هو
 * أثقل استعلام في الصفحة، وكانت البطاقة تنبثق متأخرة وتزيح «حصص
 * اليوم» تحتها. أثناء تحميله يظهر هيكل ثابت الارتفاع في موضع البطاقة
 * نفسه: 157px هو ارتفاع البطاقة الحقيقية المقاس حياً على الديمو
 * (ترويسة + صفّا طالبين + سطر إرشادي، مع mb-3 مثل البطاقة)، فاستبدال
 * الهيكل بالبطاقة عند وصول البيانات لا يحرّك أي محتوى. عند الخطأ أو
 * غياب الحالات لا يبقى أي أثر: غيابها أصدق من بطاقة فارغة.
 * منطق اشتقاق المعرّضين نفسه لم يتغيّر إطلاقاً.
 */
export function AtRiskCard() {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const atRiskQ = useAtRisk(teacherId, isOwner)

  if (teacherId && atRiskQ.isPending) {
    return <Skeleton className="h-[157px] mb-3" />
  }

  const items = atRiskQ.data ?? []
  if (!teacherId || atRiskQ.error || items.length === 0) {
    return null
  }

  return (
    <Link to="/at-risk" className="block no-underline text-text">
      <Card className="border-warn/50">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="font-bold text-[15px] flex items-center gap-2">
            <TriangleAlert size={20} className="text-warn-text" />
            {t('atrisk.cardTitle')}
          </span>
          <span className="shrink-0 text-[13px] font-extrabold bg-warn/15 text-warn-text rounded-full px-2.5 py-0.5">
            {t('common.studentsCount', { count: items.length })}
          </span>
        </div>
        {items.slice(0, 2).map((item) => (
          <div
            key={item.student.id}
            className="flex items-baseline justify-between gap-2 py-1 text-[13.5px]"
          >
            <span className="font-semibold truncate">{item.student.name}</span>
            <span className="text-muted shrink-0">{item.reasons[0]?.text}</span>
          </div>
        ))}
        <p className="text-muted text-[12px] mt-1.5 mb-0">
          {t('atrisk.cardHint')}
        </p>
      </Card>
    </Link>
  )
}
