import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { Save } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Field, TextInput } from '../../../components/ui/form'
import type { TeacherRow } from '../../../types/database'
import type { useUpdateOwnProfile } from '../../auth/hooks'
import { t } from '../../../i18n'

/** محتوى قسم «ملف المدرس» — بيانات السنتر المُدار (الاسم/الموبايل/الصورة) */
export function ProfileSection({
  managedCentre,
  profileMsg,
  profileName,
  profilePhone,
  profileAvatar,
  setProfileName,
  setProfilePhone,
  setProfileAvatar,
  handleProfileSave,
  updateProfile,
}: {
  managedCentre: TeacherRow
  profileMsg: string | null
  profileName: string | null
  profilePhone: string | null
  profileAvatar: string | null
  setProfileName: Dispatch<SetStateAction<string | null>>
  setProfilePhone: Dispatch<SetStateAction<string | null>>
  setProfileAvatar: Dispatch<SetStateAction<string | null>>
  handleProfileSave: (e: FormEvent) => void
  updateProfile: ReturnType<typeof useUpdateOwnProfile>
}) {
  return (
    <>
      {profileMsg && <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{profileMsg}</p>}
      <form noValidate onSubmit={handleProfileSave}>
        <Field label={t('settings.teacherNameLabel')}>
          <TextInput
            value={profileName ?? managedCentre.display_name}
            onChange={(e) => setProfileName(e.target.value)}
            required
          />
        </Field>
        <Field label={t('settings.phoneLabel')}>
          <TextInput
            type="tel"
            dir="ltr"
            value={profilePhone ?? managedCentre.phone ?? ''}
            onChange={(e) => setProfilePhone(e.target.value)}
            placeholder="01xxxxxxxxx"
          />
        </Field>
        <Field label={t('settings.avatarUrlLabel')}>
          <TextInput
            type="url"
            dir="ltr"
            value={profileAvatar ?? managedCentre.avatar_url ?? ''}
            onChange={(e) => setProfileAvatar(e.target.value)}
            placeholder="https://…"
          />
        </Field>
        {(profileAvatar ?? managedCentre.avatar_url) && (
          <div className="flex items-center gap-2 mb-3">
            <img
              src={profileAvatar ?? managedCentre.avatar_url ?? ''}
              alt={t('settings.teacherPhotoAlt')}
              className="w-10 h-10 rounded-full object-cover border border-border"
            />
            <span className="text-muted text-[12px]">{t('settings.photoPreview')}</span>
          </div>
        )}
        <Button full type="submit" disabled={updateProfile.isPending}>
          <Save size={18} />
          {updateProfile.isPending ? t('settings.saving') : t('settings.save')}
        </Button>
      </form>
    </>
  )
}
