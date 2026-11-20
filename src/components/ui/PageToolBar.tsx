import type { ReactNode } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { TextInput } from './form'

/**
 * شريط أدوات الصفحات الطويلة الموحّد (موجة التحسينات W3 — بحث R-10/R-11):
 * شريط لاصق واحد فقط تحت شريط التطبيق مباشرة، ارتفاعه 56px، خلفيته
 * معتمة بلون البطاقة بحدّ سفلي، ويحتوي بالترتيب (RTL): حقل بحث (صفحات
 * السجلات فقط) + صف رقائق أفقي واحد قابل للتمرير بحافة تلاشٍ + عدّاد
 * نتائج + زر «تصفية» يفتح Sheet الفلاتر المتقدمة (مع شارة بعددها
 * المفعّل). ممنوع بموجب النمط: تكديس فلاتر في حقول متعددة فوق المحتوى،
 * أو شريط لاصق ثانٍ في نفس الصفحة.
 *
 * الرقائق نفسها يمرّرها المستدعي: فلاتر في صفحات السجلات، وأنقورز تنقّل
 * في صفحات الأقسام (إعدادات/إشعارات)، ورقائق فلاتر مفعّلة قابلة للإزالة
 * تُصفّ في أولها.
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
  return (
    <div
      className={`sticky top-[49px] z-10 bg-card border-b border-border mb-3 ${
        bleed ? '-mx-4 px-4' : ''
      }`}
    >
      <div className="flex items-center gap-2 h-14">
        {search && (
          <div className="relative w-[124px] min-[480px]:w-[176px] shrink-0">
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
        {chips && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar chip-row-fade flex-1 min-w-0 items-center py-1">
            {chips}
          </div>
        )}
        {resultCount != null && (
          <span className="shrink-0 text-muted text-[12.5px] font-semibold whitespace-nowrap">
            {resultCount} نتيجة
          </span>
        )}
        {onFilter && (
          <button
            type="button"
            onClick={onFilter}
            aria-label="تصفية متقدمة"
            className="relative shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[48px] px-3 rounded-full border border-border-interactive bg-card text-text text-[13.5px] font-semibold cursor-pointer hover:bg-soft"
          >
            <SlidersHorizontal size={19} />
            <span className="hidden min-[420px]:inline">تصفية</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -end-1 min-w-[20px] h-5 px-1 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * عنوان مجموعة لاصق فرعي داخل قوائم السجلات (W3 — R-11): يلتصق تحت
 * شريط الأدوات مباشرة (49px تطبيق + 56px شريط = 105px) أثناء تمرير
 * مجموعته، بخلفية الصفحة شبه معتمة حتى لا يختلط بالصفوف المارة تحته.
 */
export function StickyGroupHeader({
  children,
  bleed = true,
}: {
  children: ReactNode
  bleed?: boolean
}) {
  return (
    <div
      className={`sticky top-[105px] z-[6] bg-bg/95 backdrop-blur-sm py-1.5 text-[13.5px] font-bold text-muted ${
        bleed ? '-mx-4 px-4' : ''
      }`}
    >
      {children}
    </div>
  )
}
