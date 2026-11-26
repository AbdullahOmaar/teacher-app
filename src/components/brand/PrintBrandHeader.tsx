import type { ReactNode } from 'react'
import type { BrandIdentity } from '../../lib/brand'

// ===========================================================================
// ترويسة الهوية للمطبوعات (مهمة 12 — ج9-1: فصل المحتوى عن التصميم).
//
// قبل المهمة 12 كانت ترويسة الهوية (شعار + اسم + خط لهجة) مكررة inline
// بنفس النمط في ورقة الامتحان وإيصال الدفع، فأي تعديل تصميمي كان يلمس
// كل سطح على حدة. الآن العرض يعيش هنا مرة واحدة، والأسطح تمرّر المحتوى
// فقط: العنوان الاحتياطي عند غياب اسم السنتر، وشعار بديل اختياري عند
// غياب الشعار المرفوع (الإيصال يعرض شعار التطبيق، ورقة الامتحان لا
// تعرض شيئاً)، وسطور العنوان الفرعي كأبناء (children) بنصوص كل سطح.
// لا تغيير بصري: نفس الفئات والأحجام حرفياً كما كانت في السطحين.
// ===========================================================================

export function PrintBrandHeader({
  brand,
  fallbackTitle,
  logoAlt,
  fallbackLogo = null,
  className = 'mb-3',
  children,
}: {
  brand: BrandIdentity
  /** العنوان عند غياب اسم السنتر التجاري واسم المدرس معاً */
  fallbackTitle: string
  /** نص بديل صورة الشعار عند غياب الاسم */
  logoAlt: string
  /** يُعرض داخل نفس غلاف التوسيط عند غياب الشعار المرفوع — أو لا شيء */
  fallbackLogo?: ReactNode
  /** هامش سفلي إضافي بجانب الفئات الثابتة (الامتحان mb-3، الإيصال mb-2) */
  className?: string
  /** سطور العنوان الفرعي الخاصة بكل سطح طباعة */
  children?: ReactNode
}) {
  return (
    <div
      className={`text-center border-b border-slate-200 pb-2 ${className}`}
      style={
        brand.accent
          ? { borderBottomColor: brand.accent, borderBottomWidth: 2 }
          : undefined
      }
    >
      {brand.logoUrl ? (
        <div className="flex justify-center mb-1.5">
          <img
            src={brand.logoUrl}
            alt={brand.name ?? logoAlt}
            className="h-[52px] max-w-[180px] object-contain"
          />
        </div>
      ) : fallbackLogo ? (
        <div className="flex justify-center mb-1.5">{fallbackLogo}</div>
      ) : null}
      <div
        className="font-extrabold text-[16px]"
        style={brand.accent ? { color: brand.accent } : undefined}
      >
        {brand.name ?? fallbackTitle}
      </div>
      {children}
    </div>
  )
}
