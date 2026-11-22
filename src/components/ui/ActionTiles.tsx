import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'

type TileVariant = 'soft' | 'ghost' | 'ok'

const tileVariants: Record<TileVariant, string> = {
  soft: 'bg-soft text-primary border border-primary/25 hover:opacity-90',
  ghost: 'bg-transparent text-text border border-border-interactive hover:bg-soft',
  // أخضر دلالي لإجراءات الواتساب/النجاح (نفس جلد زر واتساب المعرّضين W6)
  ok: 'bg-ok/10 text-ok-text border border-ok/30 hover:bg-ok/15',
}

const tileBase =
  'flex flex-col items-center justify-center gap-1.5 h-[68px] w-full rounded-xl px-1 text-[12.5px] font-bold leading-tight text-center no-underline cursor-pointer transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed'

/**
 * شبكة إجراءات موحّدة (ملاحظات المالك — نقطة ٢): خلايا متساوية تماماً
 * (أيقونة فوق تسمية، ارتفاع ثابت 68px) بدل صفوف أزرار بعرض المحتوى
 * تلتفّ على أسطر غير متناسقة. تُستخدم حيث تتعدد إجراءات الترويسة
 * (٤–٦ إجراءات)؛ للإجراءين/الثلاثة القصيرة يبقى نمط الصف المدمج.
 * التسمية تلتفّ متوازنةً (text-balance — 3A-331 عائلة ج): وسمان من
 * سطرين (مثل «رابط بوابة الطالب» عند 360px) يتوزّعان على سطرين
 * متقاربين بدل سطر ممتلئ وآخر يتيم، والارتفاع ثابت أصلاً فلا تتمدد
 * خلية عن شقيقاتها.
 */
export function ActionTiles({
  cols = 3,
  className = '',
  children,
}: {
  cols?: 2 | 3
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`grid ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-2 ${className}`}>
      {children}
    </div>
  )
}

interface ActionTileProps {
  icon: LucideIcon
  label: string
  variant?: TileVariant
  onClick?: () => void
  /** رابط خارجي/هاتف (a عادية) */
  href?: string
  /** مسار داخلي (react-router Link — تنقّل SPA بلا إعادة تحميل) */
  to?: string
  target?: string
  rel?: string
  disabled?: boolean
}

/** خلية إجراء واحدة: زر أو رابط بنفس الجلد البصري والحجم بالضبط */
export function ActionTile({
  icon: Icon,
  label,
  variant = 'soft',
  onClick,
  href,
  to,
  target,
  rel,
  disabled = false,
}: ActionTileProps) {
  const cls = `${tileBase} ${tileVariants[variant]}`
  const inner = (
    <>
      <Icon size={20} className="shrink-0" />
      <span className="line-clamp-2 text-balance">{label}</span>
    </>
  )
  if (to) {
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} target={target} rel={rel} className={cls} aria-disabled={disabled || undefined}>
        {inner}
      </a>
    )
  }
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {inner}
    </button>
  )
}
