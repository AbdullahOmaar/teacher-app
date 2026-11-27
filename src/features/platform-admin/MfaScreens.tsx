import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Copy, KeyRound, Loader2, LogOut, ShieldCheck } from 'lucide-react'
import { t } from '../../i18n'
import { copyText } from '../../lib/clipboard'
import { useAuth } from '../../lib/useAuth'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field, TextInput } from '../../components/ui/form'
import { ErrorState, LoadingState } from '../../components/ui/states'
import { PLATFORM_ADMIN, useMfaStatus } from './hooks'
import {
  enrollTotp,
  isMfaUnavailableError,
  isTotpCode,
  logMfaAudit,
  unenrollTotp,
  verifyTotpCode,
  type TotpEnrollment,
} from './mfa'

/**
 * شاشات التحقق بخطوتين لأدمن المنصة (0067 — مهمة 23): تسجيل TOTP
 * وتحديه وحالة عدم توفره، وبطاقة الحالة داخل اللوحة مع إلغاء التسجيل.
 * كلها حالات مصممة — لا خطأ خام أبداً (قاعدة مالك 2026-11-26).
 * التخطيط 375px بالبناء: نفس بطاقات/أزرار/حقول التطبيق (max-w-md
 * بلا عروض ثابتة)؛ إعادة اللقطة بعد تطبيق 0067 موثقة في الوثيقة.
 */

function invalidateMfa(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: [PLATFORM_ADMIN, 'mfa'] })
}

/** إطار الشاشات الكاملة وسط الصفحة — نفس نمط شاشة الرفض */
function MfaShell({
  icon,
  title,
  intro,
  children,
}: {
  icon: ReactNode
  title: string
  intro: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center py-8">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
          {icon}
        </div>
        <h1 className="type-section mb-2">{title}</h1>
        <p className="text-muted type-secondary mb-5">{intro}</p>
        {children}
      </Card>
    </div>
  )
}

/** زر تسجيل الخروج النصي أسفل شاشات البوابة */
export function SignOutButton() {
  const { signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void signOut()
      }}
      className="bg-transparent border-0 cursor-pointer text-primary font-bold text-[13.5px] disabled:opacity-50"
    >
      <LogOut size={15} className="inline-block align-[-2px] ml-1" />
      {t('platformAdmin.mfaSignOut')}
    </button>
  )
}

/** حقل الكود الستة أرقام — نفس نمط CodeEntry: أرقام فقط، ltr */
function CodeField({
  code,
  onChange,
  disabled,
}: {
  code: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  return (
    <Field label={t('platformAdmin.mfaCodeLabel')}>
      <TextInput
        type="text"
        dir="ltr"
        autoComplete="one-time-code"
        inputMode="numeric"
        placeholder={t('platformAdmin.mfaCodePlaceholder')}
        value={code}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, '').slice(0, 6))
        }
        disabled={disabled}
        required
      />
    </Field>
  )
}

/** رسالة خطأ مصممة داخل البطاقة — لا نص خادم خام أبداً */
function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      className="bg-bad-soft text-bad-text text-[13.5px] font-semibold rounded-xl px-3 py-2 mb-3 mt-0"
      role="alert"
    >
      {message}
    </p>
  )
}

/**
 * شاشة تسجيل TOTP (تمهيد أول أدمن + إعادة تسجيل): توليد عامل،
 * عرض QR + السر، ثم تحقق بالكود. عامل غير موثّق سابق يُستأنف
 * بكوده المحفوظ أو يُعاد إنشاؤه — السر لا يُسترجع بعد توليده.
 */
export function MfaEnrollScreen({
  unverifiedFactorId,
}: {
  unverifiedFactorId: string | null
}) {
  const queryClient = useQueryClient()
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [factorId, setFactorId] = useState<string | null>(unverifiedFactorId)
  const [starting, setStarting] = useState(unverifiedFactorId === null)
  const [startAttempt, setStartAttempt] = useState(0)
  const [unavailable, setUnavailable] = useState(false)
  const [startError, setStartError] = useState(false)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    if (unverifiedFactorId !== null) return
    let alive = true
    enrollTotp()
      .then((next) => {
        if (!alive) return
        setEnrollment(next)
        setFactorId(next.factorId)
        setStarting(false)
      })
      .catch((e: unknown) => {
        if (!alive) return
        if (isMfaUnavailableError(e)) setUnavailable(true)
        else setStartError(true)
        setStarting(false)
      })
    return () => {
      alive = false
    }
  }, [unverifiedFactorId, startAttempt])

  async function handleRestart() {
    if (!unverifiedFactorId) return
    setRestarting(true)
    setError(null)
    try {
      await unenrollTotp(unverifiedFactorId)
      const next = await enrollTotp()
      setEnrollment(next)
      setFactorId(next.factorId)
      setCode('')
    } catch {
      setStartError(true)
    } finally {
      setRestarting(false)
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    if (!factorId || !isTotpCode(code) || verifying) return
    setVerifying(true)
    setError(null)
    try {
      await verifyTotpCode(factorId, code)
      await logMfaAudit('mfa_enrolled', { factor_id: factorId })
      invalidateMfa(queryClient)
    } catch {
      await logMfaAudit('mfa_challenge_failed', {
        context: 'enroll',
        factor_id: factorId,
      })
      setError(t('platformAdmin.mfaEnrollError'))
    } finally {
      setVerifying(false)
    }
  }

  if (unavailable) return <MfaUnavailableScreen />
  if (starting) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center p-4">
        <LoadingState />
      </div>
    )
  }
  if (startError) {
    return (
      <MfaShell
        icon={<ShieldCheck size={28} />}
        title={t('platformAdmin.mfaEnrollTitle')}
        intro={t('platformAdmin.mfaStatusError')}
      >
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="soft"
            onClick={() => {
              setStartError(false)
              setUnavailable(false)
              setStarting(true)
              setStartAttempt((a) => a + 1)
            }}
          >
            {t('platformAdmin.mfaRetry')}
          </Button>
          <SignOutButton />
        </div>
      </MfaShell>
    )
  }

  return (
    <MfaShell
      icon={<ShieldCheck size={28} />}
      title={t('platformAdmin.mfaEnrollTitle')}
      intro={t('platformAdmin.mfaEnrollIntro')}
    >
      {unverifiedFactorId !== null && (
        <p className="bg-soft text-primary text-[13.5px] rounded-xl px-3 py-2 mb-3 mt-0">
          {t('platformAdmin.mfaResumeHint')}
        </p>
      )}
      {enrollment && (
        <>
          <img
            src={enrollment.qrCode}
            alt={t('platformAdmin.mfaEnrollQrAlt')}
            className="mx-auto w-48 h-48 mb-3"
          />
          <Field label={t('platformAdmin.mfaSecretLabel')}>
            <div className="flex items-center gap-2">
              <TextInput
                type="text"
                dir="ltr"
                readOnly
                value={enrollment.secret}
                aria-label={t('platformAdmin.mfaSecretLabel')}
              />
              <Button
                variant="soft"
                type="button"
                onClick={() => {
                  void copyText(enrollment.secret).then((ok) => {
                    if (ok) setCopied(true)
                  })
                }}
              >
                {copied ? (
                  <Check size={18} />
                ) : (
                  <Copy size={18} />
                )}
                {copied
                  ? t('platformAdmin.mfaSecretCopied')
                  : t('platformAdmin.mfaCopySecret')}
              </Button>
            </div>
          </Field>
        </>
      )}
      <form onSubmit={handleVerify}>
        <FormError message={error} />
        <CodeField code={code} onChange={setCode} disabled={verifying} />
        <Button
          full
          type="submit"
          disabled={verifying || !isTotpCode(code)}
          aria-busy={verifying}
        >
          {verifying ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <ShieldCheck size={18} />
          )}
          {verifying
            ? t('platformAdmin.mfaVerifying')
            : t('platformAdmin.mfaVerifyEnroll')}
        </Button>
      </form>
      <div className="flex items-center justify-center gap-4 mt-3">
        {unverifiedFactorId !== null && (
          <button
            type="button"
            onClick={handleRestart}
            disabled={restarting || verifying}
            className="bg-transparent border-0 cursor-pointer text-primary font-bold text-[13.5px] disabled:opacity-50"
          >
            {t('platformAdmin.mfaRestartEnroll')}
          </button>
        )}
        <SignOutButton />
      </div>
    </MfaShell>
  )
}

/** شاشة تحدي TOTP عند الدخول (جلسة aal1 بعامل موثّق) */
export function MfaChallengeScreen({ factorId }: { factorId: string }) {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    if (!isTotpCode(code) || verifying) return
    setVerifying(true)
    setError(null)
    try {
      await verifyTotpCode(factorId, code)
      invalidateMfa(queryClient)
    } catch {
      await logMfaAudit('mfa_challenge_failed', {
        context: 'challenge',
        factor_id: factorId,
      })
      setError(t('platformAdmin.mfaChallengeError'))
    } finally {
      setVerifying(false)
    }
  }

  return (
    <MfaShell
      icon={<KeyRound size={28} />}
      title={t('platformAdmin.mfaChallengeTitle')}
      intro={t('platformAdmin.mfaChallengeIntro')}
    >
      <form onSubmit={handleVerify}>
        <FormError message={error} />
        <CodeField code={code} onChange={setCode} disabled={verifying} />
        <Button
          full
          type="submit"
          disabled={verifying || !isTotpCode(code)}
          aria-busy={verifying}
        >
          {verifying ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <KeyRound size={18} />
          )}
          {verifying
            ? t('platformAdmin.mfaVerifying')
            : t('platformAdmin.mfaChallengeVerify')}
        </Button>
      </form>
      <div className="flex items-center justify-center mt-3">
        <SignOutButton />
      </div>
    </MfaShell>
  )
}

/** MFA غير مفعّل في إعدادات المشروع — حالة مصممة مع طريق الحل */
export function MfaUnavailableScreen() {
  return (
    <MfaShell
      icon={<ShieldCheck size={28} />}
      title={t('platformAdmin.mfaUnavailableTitle')}
      intro={t('platformAdmin.mfaUnavailableHint')}
    >
      <div className="flex items-center justify-center gap-3">
        <Link to="/">
          <Button variant="soft">{t('platformAdmin.backHome')}</Button>
        </Link>
        <SignOutButton />
      </div>
    </MfaShell>
  )
}

/**
 * بطاقة حالة التحقق بخطوتين داخل اللوحة (تظهر بعد الدخول بـ aal2):
 * مفعّل + زر إلغاء بخطوتي تأكيد. الإلغاء يعيد البوابة لشاشة
 * التسجيل فوراً (استعلام الحالة يُبطل فيُعاد فحصه).
 */
export function MfaSection() {
  const queryClient = useQueryClient()
  const mfaQ = useMfaStatus(true)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUnenroll() {
    const factorId = mfaQ.data?.factorId
    if (!factorId || busy) return
    setBusy(true)
    setError(null)
    try {
      await unenrollTotp(factorId)
      await logMfaAudit('mfa_unenrolled', { factor_id: factorId })
      setDone(true)
      setConfirming(false)
      invalidateMfa(queryClient)
    } catch {
      setError(t('platformAdmin.mfaUnenrollError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="type-section">{t('platformAdmin.mfaStatusTitle')}</h2>
      {mfaQ.isPending ? (
        <LoadingState />
      ) : mfaQ.isError ? (
        <ErrorState
          message={t('platformAdmin.mfaStatusError')}
          onRetry={() => void mfaQ.refetch()}
        />
      ) : (
        <Card>
          <p className="text-muted type-secondary mb-3">
            {mfaQ.data?.enrolled
              ? t('platformAdmin.mfaStatusOn')
              : t('platformAdmin.mfaStatusOff')}
          </p>
          {done && (
            <p className="bg-soft text-primary text-[13.5px] rounded-xl px-3 py-2 mb-3 mt-0">
              {t('platformAdmin.mfaUnenrollDone')}
            </p>
          )}
          <FormError message={error} />
          {mfaQ.data?.enrolled && !done && (
            <div className="flex items-center gap-2">
              {confirming ? (
                <>
                  <span className="text-muted type-secondary flex-1">
                    {t('platformAdmin.mfaUnenrollConfirm')}
                  </span>
                  <Button
                    variant="soft"
                    onClick={handleUnenroll}
                    disabled={busy}
                    aria-busy={busy}
                  >
                    {t('platformAdmin.confirm')}
                  </Button>
                  <Button
                    variant="soft"
                    onClick={() => setConfirming(false)}
                    disabled={busy}
                  >
                    {t('platformAdmin.cancel')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="soft"
                  onClick={() => setConfirming(true)}
                >
                  {t('platformAdmin.mfaUnenroll')}
                </Button>
              )}
            </div>
          )}
        </Card>
      )}
    </section>
  )
}
