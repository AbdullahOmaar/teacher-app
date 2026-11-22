import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { Save } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Chip, Field, TextArea, TextInput } from '../../../components/ui/form'
import { ErrorState, LoadingState } from '../../../components/ui/states'
import type { ThemeMode, useTheme } from '../../../hooks/useTheme'
import type { TeacherSettingsRow } from '../../../types/database'
import { DEFAULT_WA_TEMPLATE } from '../../invoices/api'
import { formatDateLabel } from '../../schedule/api'
import { REMINDER_OPTIONS, THEME_MODES } from '../api'
import type { useTeacherSettings, useUpdateTeacherSettings } from '../hooks'
import { t } from '../../../i18n'

/** متغيرات قالب رسالة واتساب المتاحة في الإيصال (المرجع §3.16) */
const WA_TEMPLATE_VARS = ['{guardian}', '{name}', '{period}', '{paid}', '{total}', '{balance}']

/** محتوى قسم «إعدادات التطبيق» — نموذج teacher_settings كاملاً */
export function AppSettingsSection({
  settingsQ,
  settingsRow,
  waTpl,
  setWaTpl,
  centerShare,
  setCenterShare,
  reminder,
  setReminder,
  theme,
  handleThemePick,
  settingsMsg,
  handleSettingsSave,
  updateSettings,
}: {
  settingsQ: ReturnType<typeof useTeacherSettings>
  settingsRow: TeacherSettingsRow | null
  waTpl: string | null
  setWaTpl: Dispatch<SetStateAction<string | null>>
  centerShare: string | null
  setCenterShare: Dispatch<SetStateAction<string | null>>
  reminder: number | null
  setReminder: Dispatch<SetStateAction<number | null>>
  theme: ReturnType<typeof useTheme>
  handleThemePick: (mode: ThemeMode) => void
  settingsMsg: string | null
  handleSettingsSave: (e: FormEvent) => void
  updateSettings: ReturnType<typeof useUpdateTeacherSettings>
}) {
  return (
    <>
      {settingsQ.isPending ? (
        <LoadingState label={t('settings.loadingSettingsForm')} />
      ) : settingsQ.isError ? (
        <ErrorState
          message={
            settingsQ.error instanceof Error ? settingsQ.error.message : t('common.unknownError')
          }
          onRetry={() => {
            // PAT-1 (3A-377): إعادة محاولة موجّهة للاستعلامات الفاشلة نفسها — إبطال 'settings' كان سيعيد جلب إعداد واتساب وبطاقات أخرى سليمة أيضاً.
            void settingsQ.refetch()
          }}
        />
      ) : (
        <form onSubmit={handleSettingsSave}>
          <Field label={t('settings.waTemplateLabel')}>
            <TextArea
              rows={3}
              value={waTpl ?? settingsRow?.whatsapp_template ?? DEFAULT_WA_TEMPLATE}
              onChange={(e) => setWaTpl(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-1.5 mb-4 -mt-1">
            {WA_TEMPLATE_VARS.map((v) => (
              <code
                key={v}
                dir="ltr"
                className="text-[12px] bg-soft text-primary rounded-full px-2 py-0.5 font-semibold"
              >
                {v}
              </code>
            ))}
          </div>

          <Field label={t('settings.centreShareLabel')}>
            <TextInput
              type="number"
              dir="ltr"
              min={0}
              max={100}
              step="0.5"
              value={
                centerShare ?? String(Number(settingsRow?.center_share_percent) || 0)
              }
              onChange={(e) => setCenterShare(e.target.value)}
            />
          </Field>

          <div className="mb-4">
            <div className="text-[13.5px] text-muted font-semibold mb-2">
              {t('settings.reminderLabel')}
            </div>
            <div className="flex flex-wrap gap-2">
              {REMINDER_OPTIONS.map((opt) => (
                <Chip
                  key={opt.minutes}
                  active={(reminder ?? settingsRow?.reminder_minutes ?? 0) === opt.minutes}
                  onClick={() => setReminder(opt.minutes)}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="text-[13.5px] text-muted font-semibold mb-2">{t('settings.themeLabel')}</div>
            <div className="flex flex-wrap gap-2">
              {THEME_MODES.map((opt) => (
                <Chip
                  key={opt.code}
                  active={theme.mode === opt.code}
                  onClick={() => handleThemePick(opt.code)}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
            <p className="text-muted text-[12px] mb-0 mt-2">
              {t('settings.themeHint')}
            </p>
          </div>

          <div className="text-[13.5px] text-muted mb-3">
            {t('settings.lastExportLabel')}{' '}
            <b className="text-text">
              {settingsRow?.last_export_at
                ? formatDateLabel(settingsRow.last_export_at.slice(0, 10))
                : t('settings.noExportYet')}
            </b>{' '}
            — <Link to="/backup" className="text-primary font-semibold">{t('settings.backup')}</Link>
          </div>

          {settingsMsg && (
            <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{settingsMsg}</p>
          )}
          <Button full type="submit" disabled={updateSettings.isPending}>
            <Save size={18} />
            {updateSettings.isPending ? t('settings.saving') : t('settings.saveSettings')}
          </Button>
        </form>
      )}
    </>
  )
}
