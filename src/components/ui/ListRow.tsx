import type { ReactNode } from 'react'

/**
 * صف القائمة القياسي (بحث §5): عنصر قيادي 40px + اسم 15/600 + ثانوي 13.5
 * + عنصر ذيلي، والفاصل بين الصفوف يبدأ من محاذاة النص (حشوة 16 + قيادي 40
 * + فجوة 12 = 68px) لا من حافة البطاقة. يُستخدم داخل بطاقة `p-0 overflow-hidden`.
 */
export function ListRow({
  leading,
  title,
  secondary,
  trailing,
  first = false,
  className = '',
}: {
  leading?: ReactNode
  title: ReactNode
  secondary?: ReactNode
  trailing?: ReactNode
  first?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      {!first && <div className="ms-[68px] border-t border-border" aria-hidden="true" />}
      <div className="flex items-center gap-3 px-4 py-3 min-h-[64px]">
        {leading}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] leading-[1.6] truncate">{title}</div>
          {secondary != null && (
            /* السطر الثاني يلتف حتى سطرين بقصّ أنيق في النهاية فقط —
               كان truncate يقصّ أسماء المجموعات منتصف الكلمة («الثانو…») */
            <div className="text-muted text-[13.5px] leading-[1.7] line-clamp-2">{secondary}</div>
          )}
        </div>
        {trailing}
      </div>
    </div>
  )
}
