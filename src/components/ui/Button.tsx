import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'soft'

const variants: Record<Variant, string> = {
  // نص الزر الأساسي عبر توكن --on-primary: أبيض في الفاتح، داكن في الداكن
  // (الأبيض على أساسي الداكن #8B85F7 كان 3.09:1 — الداكن عليه 5.58:1)
  primary: 'bg-primary text-on-primary hover:bg-primary-d',
  ghost: 'bg-transparent border border-border text-text hover:bg-soft',
  danger: 'bg-bad text-white hover:opacity-90',
  soft: 'bg-soft text-primary hover:opacity-90',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  full?: boolean
}

/** زر موحد: هدف لمس 48px، انحناء 12px، نص 15px (سلم الخط — بحث §5) */
export function Button({ variant = 'primary', full = false, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-[48px] text-[15px] font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${full ? 'w-full' : ''} ${className}`}
      {...props}
    />
  )
}
