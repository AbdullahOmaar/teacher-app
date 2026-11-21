import { t } from '../../i18n'

/**
 * أفاتار قياسي 40px (بحث §5: العنصر القيادي في صف القائمة) —
 * أول حرف من الاسم على حاوية النيلي الناعمة؛ بلا صور خارجية.
 */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const letter = name.trim().charAt(0) || t('components.avatarFallback')
  return (
    <span
      className="shrink-0 rounded-full bg-soft text-primary font-bold flex items-center justify-center select-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {letter}
    </span>
  )
}
