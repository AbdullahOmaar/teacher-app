import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field, FormError, TextArea, TextInput } from '../../components/ui/form'
import { ErrorState, LoadingState } from '../../components/ui/states'
import { useToast } from '../../components/ui/toast'
import { t } from '../../i18n'
import { copyText } from '../../lib/clipboard'
import {
  buildPublicProfileUrl,
  isProfileSchemaMissing,
  isSlugTakenByOther,
  isValidCoverUrl,
  isValidProfileSlug,
  normalizeProfileSlug,
} from './api'
import { useMyProfile, useUpsertMyProfile } from './hooks'
import { ProfileComingSoon, ProfileManageShell } from './ManageShell'

/**
 * شاشة «بيانات الصفحة والظهور» (0074): السلاج + العنوان + النبذة +
 * الغلاف (رابط خارجي فقط) + مفتاح الظهور العام. الحفظ upsert على صف
 * المدرّس؛ الظهور الفعلي للعامة محكوم خادمياً بالاستحقاق أيضاً —
 * فالمفتاح وحده بلا خطة لا ينشر شيئاً.
 */
function ProfileForm({ teacherId }: { teacherId: string }) {
  const toast = useToast()
  const profileQ = useMyProfile(teacherId, true)
  const upsert = useUpsertMyProfile(teacherId)

  const [slug, setSlug] = useState('')
  const [headline, setHeadline] = useState('')
  const [bio, setBio] = useState('')
  const [cover, setCover] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // تهيئة الحقول من الصف المحمّل مرة واحدة (ضبط حالة أثناء التصيير —
  // نمط DangerConfirmSheet)؛ بعدها الحقول ملك المستخدم حتى الحفظ
  if (!hydrated && profileQ.data !== undefined) {
    const p = profileQ.data
    setSlug(p?.slug ?? '')
    setHeadline(p?.headline ?? '')
    setBio(p?.bio ?? '')
    setCover(p?.cover_image_url ?? '')
    setIsPublic(p?.is_public ?? false)
    setHydrated(true)
  }

  if (profileQ.isPending) return <LoadingState />
  if (profileQ.isError) {
    if (isProfileSchemaMissing(profileQ.error)) return <ProfileComingSoon />
    return (
      <ErrorState
        message={t('profile.errSaveGeneric')}
        onRetry={() => void profileQ.refetch()}
      />
    )
  }

  const publicUrl = slug ? buildPublicProfileUrl(window.location.origin, slug) : ''

  const onSave = async () => {
    setError(null)
    const cleanSlug = normalizeProfileSlug(slug)
    if (!isValidProfileSlug(cleanSlug)) {
      setError(t('profile.errSlugInvalid'))
      return
    }
    const coverTrimmed = cover.trim()
    if (coverTrimmed !== '' && !isValidCoverUrl(coverTrimmed)) {
      setError(t('profile.errUrlInvalid'))
      return
    }
    try {
      if (await isSlugTakenByOther(teacherId, cleanSlug)) {
        setError(t('profile.errSlugTaken'))
        return
      }
    } catch {
      // فحص الودّي فشل (شبكة) — الحفظ نفسه هو الحاكم بقيد التفرد
    }
    upsert.mutate(
      {
        slug: cleanSlug,
        headline: headline.trim() === '' ? null : headline.trim(),
        bio: bio.trim() === '' ? null : bio.trim(),
        coverImageUrl: coverTrimmed === '' ? null : coverTrimmed,
        isPublic,
      },
      {
        onSuccess: () => {
          setSlug(cleanSlug)
          toast(t('profile.savedToast'))
        },
        onError: (e) => {
          if (isProfileSchemaMissing(e)) {
            setError(t('profile.comingSoonHint'))
          } else if (
            (e as { code?: string }).code === '23505' ||
            (e instanceof Error && e.message.includes('duplicate'))
          ) {
            setError(t('profile.errSlugTaken'))
          } else {
            setError(t('profile.errSaveGeneric'))
          }
        },
      },
    )
  }

  return (
    <Card>
      <Field label={t('profile.slugLabel')}>
        <TextInput
          dir="ltr"
          value={slug}
          onChange={(e) => setSlug(normalizeProfileSlug(e.target.value))}
          placeholder="mr-ahmed-math"
        />
      </Field>
      <p className="text-muted text-[12.5px] mt-1 mb-4">
        {t('profile.slugHint', { url: publicUrl || '…' })}
      </p>

      <Field label={t('profile.headlineLabel')}>
        <TextInput
          value={headline}
          maxLength={120}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder={t('profile.headlinePlaceholder')}
        />
      </Field>

      <Field label={t('profile.bioLabel')}>
        <TextArea
          value={bio}
          rows={5}
          maxLength={4000}
          onChange={(e) => setBio(e.target.value)}
          placeholder={t('profile.bioPlaceholder')}
        />
      </Field>

      <Field label={t('profile.coverLabel')}>
        <TextInput
          dir="ltr"
          value={cover}
          onChange={(e) => setCover(e.target.value)}
          placeholder="https://…"
        />
      </Field>
      <p className="text-muted text-[12.5px] mt-1 mb-4">{t('profile.coverHint')}</p>

      <label className="flex items-center justify-between gap-3 mt-2 mb-4 cursor-pointer">
        <span>
          <span className="text-[14px] font-semibold block">
            {t('profile.isPublicLabel')}
          </span>
          <span className="text-muted text-[12.5px]">{t('profile.isPublicHint')}</span>
        </span>
        <input
          type="checkbox"
          className="h-6 w-6 shrink-0 accent-primary"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
        />
      </label>

      {error ? <FormError message={error} /> : null}

      <div className="flex flex-wrap gap-2 mt-3">
        <Button onClick={() => void onSave()} disabled={upsert.isPending}>
          <Check size={18} />
          {t('profile.saveAction')}
        </Button>
        {profileQ.data ? (
          <>
            <Link to={`/t/${encodeURIComponent(profileQ.data.slug)}`} target="_blank">
              <Button variant="ghost">
                <ExternalLink size={17} />
                {t('profile.viewPage')}
              </Button>
            </Link>
            <Button
              variant="soft"
              onClick={() => {
                void copyText(
                  buildPublicProfileUrl(window.location.origin, profileQ.data!.slug),
                ).then((ok) => {
                  if (ok) toast(t('profile.linkCopied'))
                })
              }}
            >
              <Copy size={17} />
              {t('profile.copyLink')}
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  )
}

export function ProfileManagePage() {
  return (
    <ProfileManageShell>
      {({ teacherId }) => <ProfileForm teacherId={teacherId} />}
    </ProfileManageShell>
  )
}
