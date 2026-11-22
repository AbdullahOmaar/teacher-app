import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { Check, ImagePlus, Save, Trash2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Field, TextInput } from '../../../components/ui/form'
import { ErrorState, LoadingState } from '../../../components/ui/states'
import { Logo } from '../../../components/brand/Logo'
import { ACCENT_PRESETS, brandLogoUrl } from '../../../lib/brand'
import type { TeacherSettingsRow } from '../../../types/database'
import type {
  useRemoveBrandLogo,
  useTeacherSettings,
  useUpdateTeacherSettings,
  useUploadBrandLogo,
} from '../hooks'
import { t } from '../../../i18n'

/** محتوى قسم «هوية السنتر» — الهوية البيضاء: الشعار + الاسم + لون اللهجة */
export function BrandSection({
  settingsQ,
  settingsRow,
  brandName,
  setBrandName,
  brandAccent,
  setBrandAccent,
  brandMsg,
  confirmLogoRemove,
  setConfirmLogoRemove,
  uploadLogo,
  removeLogo,
  handleBrandSave,
  handleLogoFile,
  handleLogoRemove,
  updateSettings,
}: {
  settingsQ: ReturnType<typeof useTeacherSettings>
  settingsRow: TeacherSettingsRow | null
  brandName: string | null
  setBrandName: Dispatch<SetStateAction<string | null>>
  brandAccent: string | null | undefined
  setBrandAccent: Dispatch<SetStateAction<string | null | undefined>>
  brandMsg: string | null
  confirmLogoRemove: boolean
  setConfirmLogoRemove: Dispatch<SetStateAction<boolean>>
  uploadLogo: ReturnType<typeof useUploadBrandLogo>
  removeLogo: ReturnType<typeof useRemoveBrandLogo>
  handleBrandSave: (e: FormEvent) => void
  handleLogoFile: (file: File | null) => void
  handleLogoRemove: () => void
  updateSettings: ReturnType<typeof useUpdateTeacherSettings>
}) {
  return (
    <>
      <p className="text-muted text-[13.5px] mt-0 mb-3">
        {t('settings.brandIntro')}
      </p>
      {settingsQ.isPending ? (
        <LoadingState label={t('settings.loadingBrand')} />
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
        <>
          {/* الشعار — رفع/استبدال/حذف فوري مع معاينة */}
          <div className="flex items-center gap-3 mb-3">
            {settingsRow?.brand_logo_path && brandLogoUrl(settingsRow.brand_logo_path) ? (
              <img
                src={brandLogoUrl(settingsRow.brand_logo_path) ?? ''}
                alt={t('settings.centreLogoAlt')}
                className="w-16 h-16 rounded-2xl object-contain bg-soft border border-border p-1 shrink-0"
              />
            ) : (
              <span className="shrink-0">
                <Logo size={56} />
              </span>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[15px]">
                {settingsRow?.brand_logo_path ? t('settings.logoCurrent') : t('settings.logoNone')}
              </div>
              <div className="text-muted text-[12px]">
                {t('settings.logoHint')}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mb-4">
            <label className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-primary text-on-primary font-semibold text-[15px] cursor-pointer px-3">
              <ImagePlus size={20} />
              {uploadLogo.isPending
                ? t('settings.uploading')
                : settingsRow?.brand_logo_path
                  ? t('settings.logoReplace')
                  : t('settings.logoUpload')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploadLogo.isPending}
                onChange={(e) => {
                  handleLogoFile(e.target.files?.[0] ?? null)
                  e.target.value = ''
                }}
              />
            </label>
            {settingsRow?.brand_logo_path &&
              (confirmLogoRemove ? (
                <>
                  <Button
                    variant="danger"
                    className="min-h-[48px] text-[13.5px]"
                    disabled={removeLogo.isPending}
                    onClick={handleLogoRemove}
                  >
                    {t('settings.confirmDelete')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-[48px] text-[13.5px]"
                    onClick={() => setConfirmLogoRemove(false)}
                  >
                    {t('settings.undo')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  className="min-h-[48px] text-[13.5px] text-bad-text"
                  onClick={() => setConfirmLogoRemove(true)}
                >
                  <Trash2 size={18} /> {t('settings.delete')}
                </Button>
              ))}
          </div>

          <form onSubmit={handleBrandSave}>
            <Field label={t('settings.brandNameLabel')}>
              <TextInput
                value={brandName ?? settingsRow?.brand_name ?? ''}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder={t('settings.brandNamePlaceholder')}
                maxLength={80}
              />
            </Field>

            <div className="mb-4">
              <div className="text-[13.5px] text-muted font-semibold mb-2">
                {t('settings.accentLabel')}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENT_PRESETS.map((p) => {
                  const active =
                    (brandAccent !== undefined
                      ? brandAccent
                      : settingsRow?.brand_accent) === p.hex
                  return (
                    <button
                      key={p.hex}
                      type="button"
                      title={p.label}
                      aria-label={p.label}
                      onClick={() => setBrandAccent(p.hex)}
                      className={`w-[48px] h-[48px] rounded-full border-2 cursor-pointer flex items-center justify-center ${
                        active ? 'border-text' : 'border-border'
                      }`}
                      style={{ background: p.hex }}
                    >
                      {active && <Check size={20} color="#fff" />}
                    </button>
                  )
                })}
                <label
                  className="inline-flex items-center gap-2 min-h-[48px] px-3 rounded-full border border-border cursor-pointer text-[13.5px] font-semibold"
                  title={t('settings.customColorTitle')}
                >
                  <input
                    type="color"
                    className="w-8 h-8 p-0 border-0 bg-transparent cursor-pointer"
                    value={
                      (brandAccent !== undefined
                        ? brandAccent
                        : settingsRow?.brand_accent) ?? '#4f46e5'
                    }
                    onChange={(e) => setBrandAccent(e.target.value.toLowerCase())}
                  />
                  {t('settings.custom')}
                </label>
                <button
                  type="button"
                  onClick={() => setBrandAccent(null)}
                  className={`px-3 min-h-[48px] rounded-full border text-[13.5px] font-semibold cursor-pointer ${
                    (brandAccent !== undefined
                      ? brandAccent
                      : settingsRow?.brand_accent) == null
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-card text-muted border-border'
                  }`}
                >
                  {t('settings.accentDefault')}
                </button>
              </div>
              <p className="text-muted text-[12px] mb-0 mt-2">
                {t('settings.accentHint')}
              </p>
            </div>

            {brandMsg && (
              <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{brandMsg}</p>
            )}
            <Button full type="submit" disabled={updateSettings.isPending}>
              <Save size={18} />
              {updateSettings.isPending ? t('settings.saving') : t('settings.saveBrand')}
            </Button>
          </form>
        </>
      )}
    </>
  )
}
