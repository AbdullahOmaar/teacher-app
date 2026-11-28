import { t } from '../../i18n'

/** شارة «جديد» — تظهر عند مداخل الخصائص غير المشاهَدة (قائمة «المزيد» وتبويبها) */
export function NewBadge() {
  return (
    <span className="shrink-0 text-[12.5px] font-extrabold bg-primary/10 text-primary rounded-full px-2 py-0.5">
      {t('whatsNew.badge')}
    </span>
  )
}
