import { Lock } from 'lucide-react'
import { PERMISSION_LABELS } from '../../auth/api'
import { t } from '../../../i18n'

/**
 * منتقي صلاحيات المساعد الموحّد (3A-324): كان مرسوماً ثلاث مرات
 * منسوخة (دعوة البريد + إضافة UUID + بطاقات الأعضاء) فتكرّر شكله حتى
 * بدا كأنه خطأ عرض، وشيب «عرض المالية» كان زر تبديل حيّاً يُلوَّن
 * كمفعَّل رغم أن الصلاحية محجوبة في قاعدة البيانات أصلاً — يوحي
 * بأنها قابلة للمنح وهي ليست كذلك. الآن مكوّن واحد: الصلاحيات
 * القابلة للمنح أزرار تبديل كما هي، و«عرض المالية» شيب مقفل دائماً
 * (قفل + حدّ متقطع + تعتيم + بلا تفاعل) بنفس مقاس الشقيقات وسطر
 * واحد، وسبب القفل ملحوظة صريحة تحت الصفّ.
 */
export function PermChips({
  value,
  onToggle,
  disabled = false,
  note = true,
}: {
  value: Record<string, boolean>
  onToggle: (key: string) => void
  disabled?: boolean
  note?: boolean
}) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {Object.keys(PERMISSION_LABELS).map((key) => {
          if (key === 'can_view_money') {
            return (
              <span
                key={key}
                aria-disabled="true"
                className="inline-flex items-center gap-1.5 px-3 min-h-[48px] rounded-full border border-dashed border-border bg-soft/60 text-[13.5px] font-semibold text-muted/80 cursor-not-allowed select-none"
              >
                <Lock size={16} className="shrink-0" />
                {PERMISSION_LABELS[key]}
              </span>
            )
          }
          const on = !!value[key]
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onToggle(key)}
              className={`px-3 min-h-[48px] rounded-full border text-[13.5px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                on
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-card text-muted border-border'
              }`}
            >
              {PERMISSION_LABELS[key]}
            </button>
          )
        })}
      </div>
      {note && <p className="text-muted text-[12px] mt-1.5 mb-0">{t('settings.permMoneyLockedNote')}</p>}
    </>
  )
}
