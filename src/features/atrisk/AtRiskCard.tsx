import { Link } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { useAtRisk } from './hooks'

/**
 * بطاقة «معرّضون للفقد» في الرئيسية (Phase 5 / خطوة 1): تظهر فقط عند
 * وجود حالات فعلية — عدد الطلاب وأخطر سببين (أول طالبين في ترتيب
 * الخطورة وسبب كلٍّ منهما الأول) — وتفتح صفحة القائمة الكاملة.
 * لا تُعرض أثناء التحميل أو عند الخطأ: غيابها أصدق من بطاقة فارغة.
 */
export function AtRiskCard() {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const atRiskQ = useAtRisk(teacherId, isOwner)

  const items = atRiskQ.data ?? []
  if (!teacherId || atRiskQ.isPending || atRiskQ.error || items.length === 0) {
    return null
  }

  return (
    <Link to="/at-risk" className="block no-underline text-text">
      <Card className="border-warn/50">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="font-bold text-[15px] flex items-center gap-2">
            <TriangleAlert size={20} className="text-warn-text" />
            معرّضون للفقد
          </span>
          <span className="shrink-0 text-[13px] font-extrabold bg-warn/15 text-warn-text rounded-full px-2.5 py-0.5">
            {items.length} طالب
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
          تابعهم بدري — طالب بيكمل معاك أرخص بكتير من طالب جديد.
        </p>
      </Card>
    </Link>
  )
}
