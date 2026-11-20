import { formatMoney } from '../../lib/format'
import { DIFF_BADGE_CLS, DIFF_LABELS, diffState } from './cashboxApi'

/**
 * شارة فرق إغلاق: تسمية الحالة + المبلغ بعلامته معزول الاتجاه.
 * المعلومة لا تُنقل باللون وحده — التسمية النصية دائماً حاضرة (بحث §5).
 */
export function DiffBadge({ diff, className = '' }: { diff: number; className?: string }) {
  const state = diffState(diff)
  const signed = diff > 0.005 ? `+${formatMoney(diff)}` : formatMoney(diff)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 type-badge ${DIFF_BADGE_CLS[state]} ${className}`}
    >
      {DIFF_LABELS[state]}
      <span dir="ltr">{signed}</span>
    </span>
  )
}
