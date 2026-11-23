import { useRef, useState, type ReactNode } from 'react'
import { t } from '../../i18n'
import { Search, SlidersHorizontal } from 'lucide-react'
import { TextInput } from './form'

/**
 * شريط أدوات الصفحات الطويلة الموحّد (موجة التحسينات W3 — بحث R-10/R-11،
 * وأعيد ترتيبه 2026-11-21 بملاحظة مالك من استخدام حقيقي — 3A-304):
 * شريط لاصق واحد فقط تحت شريط التطبيق مباشرة، خلفيته معتمة بلون البطاقة
 * بحدّ سفلي، وبنيته صفوف متراكبة لا صف واحد مزدحم:
 *  - صف بحث مستقل بعرض الشاشة كاملاً على الموبايل (يُحدّ بعرض أقصى على
 *    الشاشات الأوسع حتى لا يتمدد بلا معنى) — لا يتقاسم صفه مع أي عنصر.
 *  - صف فلاتر تحته: رقائق أفقية قابلة للتمرير بحافة تلاشٍ + زر «تصفية»
 *    في طرف الصف يفتح Sheet الفلاتر المتقدمة (مع شارة بعددها المفعّل).
 *  - عدّاد النتائج خارج الشريط اللاصق أصلاً: سطر نصي خفيف فوق القائمة
 *    مباشرة في مكانه الطبيعي، لا يُحشر بين الأدوات.
 * ممنوع بموجب النمط: حشر البحث والرقائق والعدّاد والتصفية في صف واحد،
 * أو شريط لاصق ثانٍ في نفس الصفحة.
 *
 * الرقائق نفسها يمرّرها المستدعي: فلاتر في صفحات السجلات، وأنقورز تنقّل
 * في صفحات الأقسام (إعدادات/إشعارات)، ورقائق فلاتر مفعّلة قابلة للإزالة
 * تُصفّ في أولها.
 *
 * ارتفاعات الشريط (لضبط التصاق رؤوس المجموعات تحتها): رقائق فقط = 57px
 * (رأس المجموعة عند 105)، بحث + رقائق = 117px (رأس المجموعة عند 166) —
 * انظر الثوابت أسفل المكوّن.
 */
export function PageToolBar({
  search,
  chips,
  onFilter,
  activeFilterCount = 0,
  resultCount,
  bleed = true,
}: {
  search?: {
    value: string
    onChange: (value: string) => void
    placeholder: string
  }
  chips?: ReactNode
  onFilter?: () => void
  activeFilterCount?: number
  resultCount?: number
  /** true: يمتد لحواف الحاوية (صفحات العرض الواحد) — false داخل عمود List-Detail */
  bleed?: boolean
}) {
  const hasChipsRow = chips != null || onFilter != null
  // تلاشي حافة بداية صف الرقائق عند التمرير (3A-384 — ملاحظة المالك ٥-أ:
  // الرقائق تُقصّ عند الحافة): التلاشي القائم (.chip-row-fade) يغطي حافة
  // الفائض فقط؛ عند تمرير الصف تبقى الرقائق مقصوصة بحدّ حاد عند حافة
  // البداية. غطاء تدرّجي بلون الشريط يظهر فقط أثناء التمرير فيحوّل
  // القصّ إلى ذوبان متناسق مع حافة الفائض.
  const [chipsScrolled, setChipsScrolled] = useState(false)
  const chipsScrollRef = useRef<HTMLDivElement>(null)
  return (
    <>
      <div
        className={`sticky top-[49px] z-10 bg-card border-b border-border shadow-[0_10px_24px_-18px_rgba(15,23,42,0.45)] ${
          resultCount == null ? 'mb-3' : ''
        } ${bleed ? '-mx-4 px-4' : ''}`}
      >
        {search && (
          <div
            className={`relative w-full min-[560px]:max-w-[340px] ${
              hasChipsRow ? 'pt-2' : 'py-2'
            }`}
          >
            <Search
              size={18}
              className="absolute start-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
            <TextInput
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder}
              className="ps-8"
              aria-label={search.placeholder}
            />
          </div>
        )}
        {hasChipsRow && (
          <div className="flex items-center gap-2 h-14">
            {/* pe-10 في صفّ الرقائق: حشوة نهاية تمرير (3A-331) مثل ChipRow — آخر شيب يستقر عند نهاية التمرير ظاهراً كاملاً خارج مدى تلاشي .chip-row-fade (36px) */}
            {chips && (
              <div className="relative flex-1 min-w-0">
                <div
                  ref={chipsScrollRef}
                  onScroll={(e) =>
                    setChipsScrolled(Math.abs(e.currentTarget.scrollLeft) > 4)
                  }
                  className="flex gap-2 overflow-x-auto no-scrollbar chip-row-fade items-center py-1 pe-10"
                >
                  {chips}
                </div>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-y-0 start-0 w-7 transition-opacity duration-200 ${
                    chipsScrolled ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{
                    background:
                      'linear-gradient(to left, var(--card) 0%, transparent 100%)',
                  }}
                />
              </div>
            )}
            {onFilter && (
              <button
                type="button"
                onClick={onFilter}
                aria-label={t('common.filterAdvanced')}
                className="relative shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[48px] px-3 rounded-full border border-border-interactive bg-card text-text text-[13.5px] font-semibold cursor-pointer hover:bg-soft"
              >
                <SlidersHorizontal size={19} />
                <span className="hidden min-[420px]:inline">{t('common.filter')}</span>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -end-1 min-w-[20px] h-5 px-1 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            )}
          </div>
        )}
      </div>
      {resultCount != null && (
        <div className="mt-2 mb-3 text-muted text-[12.5px] font-semibold">
          {t('common.resultsCount', { count: resultCount })}
        </div>
      )}
    </>
  )
}

/** موضع التصاق رأس المجموعة تحت شريط رقائق فقط (49 تطبيق + 56 شريط + حدّه) */
export const GROUP_HEADER_TOP = 105
/** موضع التصاق رأس المجموعة تحت شريط بحث + رقائق (49 + 117) */
export const GROUP_HEADER_TOP_WITH_SEARCH = 166

/**
 * عنوان مجموعة لاصق فرعي داخل قوائم السجلات (W3 — R-11): يلتصق تحت
 * شريط الأدوات مباشرة أثناء تمرير مجموعته، بخلفية الصفحة شبه معتمة حتى
 * لا يختلط بالصفوف المارة تحته. الصفحات ذات البحث تمرّر
 * GROUP_HEADER_TOP_WITH_SEARCH لأن شريطها أطول بصف البحث.
 */
export function StickyGroupHeader({
  children,
  bleed = true,
  top,
}: {
  children: ReactNode
  bleed?: boolean
  /** موضع الالتصاق بالبكسل (يُشتق من ثابتَي ارتفاع الشريط أعلاه) */
  top?: number
}) {
  return (
    <div
      style={top != null ? { top } : undefined}
      className={`sticky ${top == null ? 'top-[105px]' : ''} z-[6] bg-bg/95 backdrop-blur-sm py-1.5 text-[13.5px] font-bold text-muted ${
        bleed ? '-mx-4 px-4' : ''
      }`}
    >
      {children}
    </div>
  )
}
