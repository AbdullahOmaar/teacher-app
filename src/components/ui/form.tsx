import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

const inputCls =
  'w-full border border-border rounded-xl px-3 min-h-[46px] bg-card text-text text-[15px] outline-none focus:border-primary'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="block text-[13px] text-muted font-semibold mb-1">{label}</span>
      {children}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ''}`} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full border border-border rounded-xl px-3 py-2 min-h-[46px] bg-card text-text text-[15px] outline-none focus:border-primary ${props.className ?? ''}`}
    />
  )
}

/** رقاقة فلترة/اختيار — نمط الرقائق في المرجع (§3.3) */
export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 min-h-[34px] rounded-full border text-[13px] font-semibold cursor-pointer whitespace-nowrap ${
        active
          ? 'bg-primary text-white border-primary'
          : 'bg-card text-muted border-border hover:bg-soft'
      }`}
    >
      {children}
    </button>
  )
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto pb-1 mb-3 -mx-1 px-1">{children}</div>
}
