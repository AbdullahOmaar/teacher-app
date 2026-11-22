import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { AlertCircle } from 'lucide-react'

/** حقل موحد: هدف 52px، انحناء 12px، نص جسم 15px (بحث §5).
    حدوده تفاعلية (W6 — R-2) وتركيزه حدّ --primary-d + حلقة 2px منه */
const inputCls =
  'w-full border border-border-interactive rounded-xl px-3 min-h-[52px] bg-card text-text text-[15px] leading-[1.75] outline-none focus:border-primary-d focus:ring-2 focus:ring-primary-d/35'

/** خطأ حقل — مباشرة تحت الحقل مع أيقونة (بحث §5: نماذج منضبطة) */
export function FieldError({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-1.5 text-bad-text text-[13.5px] font-semibold mt-1.5 mb-0" role="alert">
      <AlertCircle size={16} className="shrink-0" />
      {message}
    </p>
  )
}

/** خطأ نموذج عام (أخطاء خادم/حفظ لا ترتبط بحقل بعينه) — بأيقونة وخلفية خطر ناعمة */
export function FormError({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 bg-bad-soft text-bad-text text-[13.5px] font-semibold rounded-xl px-3 py-2.5 mb-3 mt-0" role="alert">
      <AlertCircle size={18} className="shrink-0 mt-0.5" />
      <span>{message}</span>
    </p>
  )
}

export function Field({
  label,
  children,
  error,
}: {
  label: string
  children: ReactNode
  /** خطأ الحقل — يظهر مباشرة تحت الحقل مع أيقونة */
  error?: string | null
}) {
  return (
    <label className="block mb-3">
      <span className="block text-[13.5px] leading-[1.7] text-muted font-semibold mb-1">{label}</span>
      {children}
      {error ? <FieldError message={error} /> : null}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  // لوحة مفاتيح مناسبة تلقائياً حسب نوع الحقل ما لم تُمرَّر صراحة (بحث §5)
  const autoInputMode =
    props.inputMode ??
    (props.type === 'tel' ? 'tel' : props.type === 'email' ? 'email' : undefined)
  return <input {...props} inputMode={autoInputMode} className={`${inputCls} ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ''}`} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full border border-border-interactive rounded-xl px-3 py-2 min-h-[52px] bg-card text-text text-[15px] leading-[1.75] outline-none focus:border-primary-d focus:ring-2 focus:ring-primary-d/35 ${props.className ?? ''}`}
    />
  )
}

/** رقاقة فلترة/اختيار — نص 13.5px (لا تفاعلي تحت 13.5px).
    هدف لمسها 40px بعد 3A-325 (ملاحظات المالك ٥): شيبات فلاتر ثانوية
    صغُرت من 48px/px-4 إلى 40px/px-3 — و40px هو نفس مقاس «لمس سليم»
    المعتمد سابقاً لزر sm في 3A-317 */
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
      className={`px-3 min-h-[40px] rounded-full border text-[13.5px] font-semibold cursor-pointer whitespace-nowrap inline-flex items-center justify-center gap-1.5 ${
        active
          ? 'bg-primary text-on-primary border-primary'
          : 'bg-card text-muted border-border-interactive hover:bg-soft'
      }`}
    >
      {children}
    </button>
  )
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar chip-row-fade pb-1 mb-3 -mx-1 px-1">
      {children}
    </div>
  )
}
