import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'soft'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-d',
  ghost: 'bg-transparent border border-border text-text hover:bg-soft',
  danger: 'bg-bad text-white hover:opacity-90',
  soft: 'bg-soft text-primary hover:opacity-90',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  full?: boolean
}

export function Button({ variant = 'primary', full = false, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-[44px] font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${full ? 'w-full' : ''} ${className}`}
      {...props}
    />
  )
}
