import type { HTMLAttributes } from 'react'

/** البطاقة — انحناء 16px وحشوة 16px وظل البطاقة الموحد (بحث §5) */
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-card border border-border rounded-2xl p-4 mb-3 shadow-card ${className}`}
      {...props}
    />
  )
}
