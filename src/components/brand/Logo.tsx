import { useId } from 'react'

/**
 * البصمة / الشعار — «نيلي الثقة» (Phase 2، الخطوة 1؛ بحث UIUX §4):
 * squircle بتدرّج نيلي (#4F46E5 ← #7C3AED) بداخله كتاب مفتوح أبيض
 * تُكمل صفحته اليمنى علامة صح بلون الأساسي الداكن — معرفة + إنجاز
 * في رمز واحد. SVG مبني يدوياً (لا صور مولّدة)، يعمل من 16px.
 *
 * النسخة الأحادية (mono): الكتاب وحده بلون currentColor، وعلامة الصح
 * وعمود الكتاب مفرّغان منه بقاعدة evenodd (بلا أقنعة — تعمل في كل
 * محركات العرض) — لون واحد فعلياً على أي خلفية، وتُستخدم فوق
 * تدرّج كارت الطالب.
 */
const BOOK_PATH =
  'M32 21.5C28.5 18 23 16.8 16.5 17.2L16.5 42.8C23 42.4 28.5 43.6 32 46.8C35.5 43.6 41 42.4 47.5 42.8L47.5 17.2C41 16.8 35.5 18 32 21.5Z'
const CHECK_POINTS = '35.8 29.6 39.8 33.6 45.6 24.6'
/* مسار أحادي: الكتاب + مستطيل العمود + مضلّع علامة الصح كمسارات فرعية
   تُفرَّغ من الكتاب بقاعدة evenodd */
const MONO_PATH =
  BOOK_PATH +
  'M30.9 21.5H33.1V46.8H30.9Z' +
  'M37.4 28L41.4 32L41.7 34.9L47.5 25.9L43.7 23.3L37.9 32.3L34.2 31.2Z'

interface LogoProps {
  size?: number
  /** نسخة أحادية اللون (بلا squircle) — اللون من className/style عبر currentColor */
  mono?: boolean
  className?: string
  title?: string
  /** زخرفة بحتة (علامة مائية): تُخفى من قارئات الشاشة */
  decorative?: boolean
}

export function Logo({
  size = 40,
  mono = false,
  className,
  title = 'تطبيق المدرس',
  decorative = false,
}: LogoProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const gradId = `logo-grad-${rawId}`
  const a11y = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': title } as const)

  if (mono) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        className={className}
        {...a11y}
        style={{ display: 'block', flexShrink: 0 }}
      >
        <path d={MONO_PATH} fill="currentColor" fillRule="evenodd" />
      </svg>
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      {...a11y}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${gradId})`} />
      <path d={BOOK_PATH} fill="#FFFFFF" />
      <path d="M32 21.5L32 46.8" stroke="#4338CA" strokeWidth="2.2" />
      <polyline
        points={CHECK_POINTS}
        fill="none"
        stroke="#4338CA"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
