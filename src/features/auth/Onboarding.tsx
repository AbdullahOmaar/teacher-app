import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, GraduationCap } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/form'
import { useAuth } from '../../lib/useAuth'
import { ensureTeacherProfile } from './api'
import { t } from '../../i18n'

/**
 * شاشة إكمال الإعداد (Onboarding): تظهر لمستخدم مسجل دخوله لكن لا يوجد
 * له صف teachers بعد — غالباً لأن تأكيد البريد أجّل إنشاء الملف، أو
 * الحساب أُنشئ قبل بناء خطوة Auth. تُنشئ صف المدرس + إعداداته
 * الافتراضية بمعرّف المستخدم الحالي فقط (متوافق مع RLS).
 */
export function Onboarding() {
  const { user, signOut } = useAuth()
  const qc = useQueryClient()
  const meta = (user?.user_metadata ?? {}) as { display_name?: string; phone?: string | null }

  const [displayName, setDisplayName] = useState(meta.display_name ?? '')
  // حسابات الهاتف (P5-3): الرقم هوية الحساب نفسه فيُعبَّأ منه مباشرة
  const [phone, setPhone] = useState(meta.phone ?? user?.phone ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!displayName.trim()) {
      setError(t('auth.nameRequired'))
      return
    }
    setError(null)
    setBusy(true)
    try {
      await ensureTeacherProfile(user.id, displayName, phone || null)
      await qc.invalidateQueries({ queryKey: ['current-teacher'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.profileCreateFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="text-center py-6">
      <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
        <GraduationCap size={28} />
      </div>
      <div className="type-section mb-1">{t('auth.onboardingTitle')}</div>
      <p className="text-muted text-[13.5px] mb-4">
        {/* البريد داخل جملة عربية: عزل اتجاه (bdi + dir=ltr) حتى لا
            ينكسر ترتيب أجزائه عبر الأسطر (تدقيق أول استخدام — M2) */}
        {t('auth.onboardingBodyBefore')}
        <bdi dir="ltr">{user?.email ?? user?.phone ?? ''}</bdi>
        {t('auth.onboardingBodyAfter')}
      </p>
      {error && (
        <p className="bg-bad-soft text-bad-text text-[13.5px] rounded-xl px-3 py-2 mb-3" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="text-start">
        <Field label={t('auth.teacherNameLabel')}>
          <TextInput
            autoComplete="name"
            placeholder={t('auth.teacherNamePlaceholder')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </Field>
        <Field label={t('auth.phoneLabel')}>
          <TextInput
            type="tel"
            dir="ltr"
            autoComplete="tel"
            placeholder="01xxxxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Button full type="submit" disabled={busy}>
          <Check size={18} />
          {busy ? t('auth.creatingProfile') : t('auth.createProfileSubmit')}
        </Button>
      </form>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-2 inline-flex items-center min-h-[48px] bg-transparent border-0 text-muted text-[13.5px] cursor-pointer underline"
      >
        {t('auth.signOut')}
      </button>
    </Card>
  )
}
