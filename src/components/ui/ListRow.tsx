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
          {/* (3A-331 عائلة ب): العنوان يلتف كاملاً بدل truncate — القصّ كان
              يخفي أسماء طلاب عند 360px («منى يوسف بر…»)، والالتفاف يحافظ
              على بنية الصف (القيادي/الذيلي ثابتان والبطاقة تتمدد رأسياً) */}
          <div className="font-semibold text-[15px] leading-[1.6] break-words">{title}</div>
          {secondary != null && (
            /* (3A-331 عائلة ب): الثانوي يلتف كاملاً بلا line-clamp — التثبيت
               بسطرين كان يقصّ سطر بيانات الفاتورة/الطالب منتصف السنة
               («نوفمبر 026…») عند 360–390px؛ الالتفاف الكامل يعرضه كله */
            <div className="text-muted text-[13.5px] leading-[1.7] break-words">{secondary}</div>
          )}
        </div>
        {trailing}
      </div>
    </div>
  )
}
