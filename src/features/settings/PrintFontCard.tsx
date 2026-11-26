import { useState } from 'react'
import { CheckCircle2, Printer } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Field, Select } from '../../components/ui/form'
import { FormError } from '../../components/ui/form'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import {
  PRINT_FONT_KEYS,
  normalizePrintFont,
  printFontStyle,
  type PrintFontKey,
} from '../../lib/printFonts'
import { useTeacherSettings, useUpdatePrintFontSettings } from './hooks'
import { t } from '../../i18n'

const FONT_LABEL: Record<PrintFontKey, () => string> = {
  plex: () => t('settings.printFontPlex'),
  cairo: () => t('settings.printFontCairo'),
  tajawal: () => t('settings.printFontTajawal'),
  almarai: () => t('settings.printFontAlmarai'),
  amiri: () => t('settings.printFontAmiri'),
}

/**
 * بطاقة «خط طباعة المستندات» في الإعدادات (مهمة 12 — ج16-1 / مهاجرة
 * 0054): اختيار خط ورقة الامتحان وإيصال الدفع من قائمة مغلقة مضمّنة
 * محلياً. الحفظ فوري عند الاختيار (upsert جزئي print_font فقط)،
 * والمعاينة تحت القائمة تعرض الخط المختار حياً. مالك فقط —
 * teacher_settings بسياسة مالك فقط أصلاً. حتى تُطبَّق 0054 عند بوابة
 * تجميد فيز 2 يفشل الحفظ بخطأ قاعدة واضح ولا يتغيّر شيء.
 */
export function PrintFontCard() {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : ''
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const settingsQ = useTeacherSettings(teacherId || undefined, isOwner)
  const updateM = useUpdatePrintFontSettings(teacherId)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOwner) return null

  const current: PrintFontKey = normalizePrintFont(settingsQ.data?.print_font) ?? 'plex'

  const onChange = (key: PrintFontKey) => {
    setSaved(false)
    setError(null)
    updateM.mutate(key === 'plex' ? null : key, {
      onSuccess: () => setSaved(true),
      onError: (e) =>
        setError(e instanceof Error ? e.message : t('common.saveError')),
    })
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <Printer size={20} className="text-primary" />
        <span className="type-section">{t('settings.printFontCardTitle')}</span>
      </div>
      <p className="text-muted text-[13.5px] mb-3">{t('settings.printFontCardIntro')}</p>

      <Field label={t('settings.printFontCardTitle')}>
        <Select
          value={current}
          disabled={settingsQ.isPending || updateM.isPending}
          onChange={(e) => onChange(e.target.value as PrintFontKey)}
        >
          {PRINT_FONT_KEYS.map((k) => (
            <option key={k} value={k}>
              {FONT_LABEL[k]()}
            </option>
          ))}
        </Select>
      </Field>

      <div
        className="border border-border rounded-xl px-3 py-2.5 bg-soft text-[15px] leading-[1.9]"
        style={printFontStyle(current)}
      >
        {t('settings.printFontPreview')}
      </div>

      {saved && (
        <p className="flex items-center gap-1.5 text-primary-d text-[13.5px] font-semibold mt-2 mb-0">
          <CheckCircle2 size={16} />
          {t('settings.printFontSaved')}
        </p>
      )}
      {error && <FormError message={error} />}
    </Card>
  )
}
