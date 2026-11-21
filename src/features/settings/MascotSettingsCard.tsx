import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Mascot } from '../../components/mascot/Mascot'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { useTeacherSettings, useUpdateMascotVisibility } from './hooks'
import { t } from '../../i18n'

/**
 * بطاقة «الماسكوت دُفّي» في الإعدادات (MASCOT-PLAN §٦ — بند ٥):
 * مفتاح «إظهار دُفّي» محفوظ في teacher_settings.show_mascot ‏(0028)،
 * افتراضياً يعمل. الإيقاف فوري وشامل: يختفي دُفّي من التحميل والحالات
 * الفارغة والاحتفال والترحيب ورأس التنبيهات، ويرجع لوجو التحميل
 * والسبلاش للكتاب الأصلي (المرآة المحلية في useMascotVisible تغذّي
 * سكربت الإقلاع). البطاقة للمالك فقط لأن teacher_settings بسياسة
 * المالك فقط أصلاً — والمساعد لا يراها ولا يتأثر ظهور دُفّي عنده
 * بقراءة صفّ لا يملكه (يبقى على الافتراضي/المرآة).
 */
export function MascotSettingsCard() {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : ''
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const settingsQ = useTeacherSettings(teacherId || undefined, isOwner)
  const update = useUpdateMascotVisibility(teacherId)
  const [error, setError] = useState<string | null>(null)

  if (!isOwner) return null

  const row = settingsQ.data ?? null
  const show = row?.show_mascot ?? true

  return (
    <Card>
      <div className="flex items-start gap-3">
        {/* دُفّي يقدّم بطاقته بنفسه — وعند إيقافه تختفي صورته ويبقى الشرح */}
        <Mascot state="welcome" size={56} still />
        <div className="flex-1 min-w-0">
          <h2 className="type-section mt-0 mb-1">{t('settings.mascotTitle')}</h2>
          <p className="text-muted text-[13.5px] mt-0 mb-0">{t('settings.mascotHint')}</p>
        </div>
      </div>

      {settingsQ.isPending ? (
        <p className="text-muted text-[13.5px] mb-0 mt-3">{t('settings.digestLoading')}</p>
      ) : settingsQ.isError ? (
        <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-0 mt-3">
          {t('settings.digestLoadFailed')}
        </p>
      ) : (
        <label className="flex items-center justify-between gap-3 mt-3 cursor-pointer">
          <span>
            <span className="text-[14px] font-semibold block">{t('settings.mascotToggle')}</span>
            <span className="text-muted text-[12.5px]">
              {show ? t('settings.mascotOn') : t('settings.mascotOff')}
            </span>
          </span>
          <input
            type="checkbox"
            className="h-6 w-6 shrink-0 accent-primary"
            checked={show}
            disabled={update.isPending}
            onChange={(e) => {
              setError(null)
              update.mutate(e.target.checked, {
                onError: () => setError(t('settings.mascotSaveFailed')),
              })
            }}
          />
        </label>
      )}
      {error && (
        <p className="text-[13.5px] bg-bad-soft text-bad-text rounded-xl px-3 py-2 mb-0 mt-3">
          {error}
        </p>
      )}
    </Card>
  )
}
