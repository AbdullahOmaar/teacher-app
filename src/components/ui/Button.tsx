import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'soft'
type Size = 'md' | 'sm'

const variants: Record<Variant, string> = {
  // نص الزر الأساسي عبر توكن --on-primary: أبيض في الفاتح، داكن في الداكن
  // (الأبيض على أساسي الداكن #8B85F7 كان 3.09:1 — الداكن عليه 5.58:1)
  primary: 'bg-primary text-on-primary hover:bg-primary-d',
  ghost: 'bg-transparent border border-border-interactive text-text hover:bg-soft',
  danger: 'bg-bad text-white hover:opacity-90',
  soft: 'bg-soft text-primary hover:opacity-90',
}

// سلم أحجام موحّد (3A-317 — تدقيق الأزرار؛ عدّله 3A-325 — ملاحظات المالك ٥):
// المفاضلة: الأساسي md محفوظ عند أرضية لمس 48px وتصغيره البصري من الحشوة
// فقط (px-3.5 بدل px-4، والخط يبقى 15px)، والثانوي sm صغُر إلى 36px/px-2.5
// (أزرار داخل البطاقات — فوق حد WCAG 2.2 AA ‏(24px) بهامش مريح،
// وخطه يبقى 13.5px أرضية النص التفاعلي)
const sizes: Record<Size, string> = {
  md: 'px-3.5 min-h-[48px] text-[15px] rounded-xl',
  sm: 'px-2.5 min-h-[36px] text-[13.5px] rounded-[10px]',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  full?: boolean
}

/** زر موحد: هدف لمس 48px، انحناء 12px، نص 15px (سلم الخط — بحث §5) */
export function Button({ variant = 'primary', size = 'md', full = false, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${full ? 'w-full' : ''} ${className}`}
      {...props}
    />
  )
}
