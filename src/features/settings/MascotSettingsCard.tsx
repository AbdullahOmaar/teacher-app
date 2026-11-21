import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Mascot, type MascotState } from '../../components/mascot/Mascot'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { useTeacherSettings, useUpdateMascotVisibility } from './hooks'
import { t, type I18nKey } from '../../i18n'

/** أوضاع المعرض (خطة الهوية P-13): كل الأوضاع المسجلة بأسمائها الوصفية */
const GALLERY_POSES: { state: MascotState; labelKey: I18nKey }[] = [
  { state: 'welcome', labelKey: 'settings.mascotPose.welcome' },
  { state: 'celebrate', labelKey: 'settings.mascotPose.celebrate' },
  { state: 'attendance', labelKey: 'settings.mascotPose.attendance' },
  { state: 'empty', labelKey: 'settings.mascotPose.empty' },
  { state: 'alert', labelKey: 'settings.mascotPose.alert' },
  { state: 'success', labelKey: 'settings.mascotPose.success' },
  { state: 'thinking', labelKey: 'settings.mascotPose.thinking' },
  { state: 'oops', labelKey: 'settings.mascotPose.oops' },
  { state: 'inspector', labelKey: 'settings.mascotPose.inspector' },
  { state: 'writing', labelKey: 'settings.mascotPose.writing' },
  { state: 'explaining', labelKey: 'settings.mascotPose.explaining' },
  { state: 'star', labelKey: 'settings.mascotPose.star' },
]

/**
 * جُمل المعرض: سطور §٨ الاثنا عشر المعتمدة كلها — تُقرأ من مفاتيحها
 * القاموسية الأصلية أينما وُجدت (لا نسخ موازية تنحرف مع الوقت).
 */
const GALLERY_LINES: { labelKey: I18nKey; lineKey: I18nKey }[] = [
  { labelKey: 'settings.mascotLineLabel.morning', lineKey: 'home.welcome.morning' },
  { labelKey: 'settings.mascotLineLabel.evening', lineKey: 'home.welcome.evening' },
  { labelKey: 'settings.mascotLineLabel.studentsEmpty', lineKey: 'students.emptyNoneTitle' },
  { labelKey: 'settings.mascotLineLabel.invoicesEmpty', lineKey: 'invoices.emptyNoneTitle' },
  { labelKey: 'settings.mascotLineLabel.payment', lineKey: 'mascot.paymentSuccess' },
  { labelKey: 'settings.mascotLineLabel.attendance', lineKey: 'mascot.attendanceDone' },
  { labelKey: 'settings.mascotLineLabel.atRisk', lineKey: 'mascot.atRisk' },
  { labelKey: 'settings.mascotLineLabel.search', lineKey: 'students.emptyNoMatchTitle' },
  { labelKey: 'settings.mascotLineLabel.error', lineKey: 'mascot.error' },
  { labelKey: 'settings.mascotLineLabel.loading', lineKey: 'mascot.loading' },
  { labelKey: 'settings.mascotLineLabel.achievement', lineKey: 'mascot.achievement' },
  { labelKey: 'settings.mascotLineLabel.offline', lineKey: 'mascot.offline' },
]

/**
 * بطاقة «الماسكوت دُفّي» في الإعدادات (MASCOT-PLAN §٦ — بند ٥):
 * مفتاح «إظهار دُفّي» محفوظ في teacher_settings.show_mascot ‏(0028)،
 * افتراضياً يعمل. الإيقاف فوري وشامل: يختفي دُفّي من التحميل والحالات
 * الفارغة والاحتفال والترحيب ورأس التنبيهات، ويرجع لوجو التحميل
 * والسبلاش للكتاب الأصلي (المرآة المحلية في useMascotVisible تغذّي
 * سكربت الإقلاع). البطاقة للمالك فقط لأن teacher_settings بسياسة
 * المالك فقط أصلاً — والمساعد لا يراها ولا يتأثر ظهور دُفّي عنده
 * بقراءة صفّ لا يملكه (يبقى على الافتراضي/المرآة).
 * تحت المفتاح «معرض دُفّي» (خطة الهوية P-13): كل الأوضاع المسجلة
 * وسطور §٨ الاثنا عشر معاينةً — ويختفي مع إيقاف الماسكوت كأي سطح له.
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
        <>
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

          {/* معرض دُفّي (خطة الهوية P-13): الأوضاع والجُمل معاينةً قبل
              قرار الإيقاف — وسطح ماسكوت كامل فيختفي كلياً عند إيقافه */}
          {show && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-[13.5px] font-bold">{t('settings.mascotGalleryTitle')}</div>
              <p className="text-muted text-[12.5px] mt-0.5 mb-3">
                {t('settings.mascotGalleryHint')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {GALLERY_POSES.map((pose) => (
                  <div
                    key={pose.state}
                    className="flex flex-col items-center gap-1 bg-soft rounded-xl px-1 py-2.5"
                  >
                    <Mascot state={pose.state} size={52} still />
                    <span className="text-[11.5px] text-muted text-center">{t(pose.labelKey)}</span>
                  </div>
                ))}
              </div>
              <ul className="list-none m-0 p-0 mt-3 flex flex-col gap-1.5">
                {GALLERY_LINES.map((line) => (
                  <li key={line.labelKey} className="text-[12.5px] leading-relaxed">
                    <span className="font-bold">{t(line.labelKey)}:</span>{' '}
                    <span className="text-muted">{t(line.lineKey)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {error && (
        <p className="text-[13.5px] bg-bad-soft text-bad-text rounded-xl px-3 py-2 mb-0 mt-3">
          {error}
        </p>
      )}
    </Card>
  )
}
