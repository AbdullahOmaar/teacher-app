import type { HTMLAttributes } from 'react'

/** البطاقة — وحدة البناء الأساسية في المرجع (§6.5): خلفية card، حد 1px، انحناء 16px، حشوة 14px */
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-card border border-border rounded-2xl p-[14px] mb-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
      {...props}
    />
  )
}
