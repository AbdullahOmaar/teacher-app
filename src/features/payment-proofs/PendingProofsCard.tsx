import { Link } from 'react-router-dom'
import { SearchCheck } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatMoney } from '../../lib/format'
import { PAYMENT_METHOD_LABELS } from '../invoices/api'
import { usePendingProofs } from './hooks'

/** تاريخ رفع الإثبات بصيغة محلية مختصرة (يوم/شهر/سنة) */
function proofDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('ar-EG')
}

/**
 * بطاقة «إثباتات دفع معلّقة» في الرئيسية (موجة W1 — بند د-1): بنفس نمط
 * بطاقة «معرّضون للفقد» الشرطي — تظهر فقط عند وجود إثباتات بحالة
 * pending فعلاً، تعرض العدد وأقدم إثباتين (قائمة الانتظار في الـ API
 * الأقدم أولاً)، وتنقل لصفحة الفواتير حيث يعيش قسم المراجعة
 * (ProofsReviewSection) بلا أي تغيير في منطق الاعتماد/الرفض.
 *
 * الصلاحيات بنفس قاعدة المالية في بطاقة المعرّضين: هناك سبب المتأخرات
 * مالي فيُحجب عن المساعد ويبقى له سبب الغياب فقط؛ وهنا البطاقة كلها
 * مالية (وRLS على payment_proofs مالك فقط أصلاً، وصفحة الفواتير نفسها
 * للمالك فقط) فلا تظهر للمساعد إطلاقاً ولا يُفعَّل استعلامها له.
 * أثناء التحميل هيكل محجوز الارتفاع (W5 — R-12: بطاقات الإجراء في
 * الرئيسية لا تقفز بالمحتوى)؛ وعند الخطأ أو الفراغ لا تُعرض إطلاقاً:
 * غيابها أصدق من بطاقة فارغة.
 */
export function PendingProofsCard() {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const proofsQ = usePendingProofs(teacherId, isOwner)

  const proofs = proofsQ.data ?? []
  if (!teacherId || !isOwner) return null
  if (proofsQ.isPending) return <Skeleton className="h-[150px] mb-3" />
  if (proofsQ.error || proofs.length === 0) {
    return null
  }

  return (
    <Link to="/invoices" className="block no-underline text-text">
      <Card className="border-primary/40">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="font-bold text-[15px] flex items-center gap-2">
            <SearchCheck size={20} className="text-primary" />
            إثباتات دفع معلّقة
          </span>
          <span className="shrink-0 text-[13px] font-extrabold bg-bad/15 text-bad-text rounded-full px-2.5 py-0.5">
            {proofs.length} إثبات
          </span>
        </div>
        {proofs.slice(0, 2).map((p) => (
          <div
            key={p.id}
            className="flex items-baseline justify-between gap-2 py-1 text-[13.5px]"
          >
            <span className="font-semibold truncate">{p.student_name}</span>
            <span className="text-muted shrink-0">
              {formatMoney(p.amount)} · {PAYMENT_METHOD_LABELS[p.method]} ·{' '}
              {proofDate(p.created_at)}
            </span>
          </div>
        ))}
        <p className="text-muted text-[12px] mt-1.5 mb-0">
          أقدم إثبات في المقدمة — راجع واعتمد من صفحة الفواتير، والاعتماد
          بيسجّل دفعة حقيقية بإيصال.
        </p>
      </Card>
    </Link>
  )
}
