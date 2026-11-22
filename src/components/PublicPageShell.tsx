import type { ReactNode } from 'react'
import { Users } from 'lucide-react'
import { darken } from '../lib/brand'
import type { IconComponent } from './ui/EmptyState'

// ===========================================================================
// صدفة الصفحات العامة المشتركة (COD-5 / 3A-362): بوابة ولي الأمر، بوابة
// الطالب، صفحة التسجيل، وصفحة الامتحان — كلها صفحات مجهولة الهوية
// بروابط موقّعة، بنفس بنية الصدفة حرفياً (رأس لاصق بهوية السنتر البيضاء
// + محتوى بعرض 640px). الفروق محفوظة كبرمترات: أيقونة السقوط، نص
// السقوط، العنوان الفرعي (نص ثابت، أو عنوان الامتحان، أو غائب)، تسمية
// الشعار البديلة، وأي محتوى إضافي في الرأس (دُفّي في البوابتين).
// لا نص ولا مفتاح i18n يتغير — المستدعي يمرّر نصوصه الجاهزة.
// ===========================================================================

export interface PublicBrandLike {
  name: string | null
  logo_url: string | null
  accent: string | null
}

export function PublicPageShell({
  children,
  brand,
  logoAlt,
  fallbackTitle,
  subtitle,
  subtitleTruncate = false,
  FallbackIcon = Users,
  headerExtra,
}: {
  children: ReactNode
  brand?: PublicBrandLike | null
  logoAlt: string
  fallbackTitle: string
  /** العنوان الفرعي تحت اسم السنتر — يُعرض فقط عند تمريره */
  subtitle?: string | null
  subtitleTruncate?: boolean
  FallbackIcon?: IconComponent
  headerExtra?: ReactNode
}) {
  // لون اللهجة يلوّن عناصر الأساسي في الصفحة كلها عبر متغيرات الثيم —
  // بلا لهجة تبقى الهوية الافتراضية كما هي.
  const accentVars = brand?.accent
    ? ({
        '--primary': brand.accent,
        '--primary-d': darken(brand.accent, 0.15),
      } as React.CSSProperties)
    : undefined
  return (
    <div className="min-h-screen bg-bg text-text" style={accentVars}>
      <header className="sticky top-0 z-20 h-[52px] bg-card border-b border-border">
        <div className="mx-auto max-w-[640px] h-full px-4 flex items-center gap-2">
          {brand?.logo_url ? (
            <img
              src={brand.logo_url}
              alt={brand.name ?? logoAlt}
              className="w-9 h-9 rounded-full object-contain bg-soft p-0.5 shrink-0"
            />
          ) : (
            <span className="w-9 h-9 rounded-full bg-soft text-primary flex items-center justify-center">
              <FallbackIcon size={20} />
            </span>
          )}
          <div className="min-w-0">
            <div className="type-section leading-[1.4] truncate">
              {brand?.name ?? fallbackTitle}
            </div>
            {subtitle ? (
              <div className={`text-muted text-[12px] leading-[1.4]${subtitleTruncate ? ' truncate' : ''}`}>{subtitle}</div>
            ) : null}
          </div>
          {headerExtra}
        </div>
      </header>
      <main className="mx-auto max-w-[640px] px-4 pt-[14px] pb-10">{children}</main>
    </div>
  )
}
