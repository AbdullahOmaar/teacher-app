import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/form'
import { useAuth } from '../../lib/useAuth'
import { Logo } from '../../components/brand/Logo'
import { useMascotVisible } from '../../components/mascot/useMascotVisible'
import doffyIcon from '../../assets/mascot/icon.webp'
import { Check, Loader2, Send } from 'lucide-react'
import { confirmRecoveryWithCode, requestPasswordReset, updatePassword, validateEmailField } from './api'
import { CodeEntry } from './CodeEntry'
import { t } from '../../i18n'

/**
 * صفحة تعيين كلمة مرور جديدة داخل جلسة استعادة (SEC-5 جزئي):
 * الجلسة تصل بإحدى طريقتين — كود استعادة يُدخَل هنا فيتحقق منه
 * ‏verifyOtp (3A-904، المسار الأساسي بعد قلب قالب البريد لكود فقط)،
 * أو مقطع رابط إيميل أقدم من القلب ينشئ العميل منه الجلسة تلقائياً.
 * بوجود الجلسة نعرض نموذج كلمة جديدة، وبعد الحفظ نوجّه للرئيسية.
 * بلا جلسة نعرض طلب الكود نفسه (بريد + إرسال) ثم إدخاله — فالصفحة
 * مكتفية ذاتياً ولا ترمي المستخدم لصفحة الدخول.
 */
export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // البريد المحمول من «نسيت كلمة المرور» في صفحة الدخول (3A-904):
  // الكود طُلب هناك أصلاً، فتُفتح شاشة إدخاله مباشرة على هذا البريد
  const carriedEmail = (location.state as { email?: string } | null)?.email ?? ''
  const [emailInput, setEmailInput] = useState(carriedEmail)
  const [codeRequested, setCodeRequested] = useState(Boolean(carriedEmail))
  // هبوط من رابط قديم منتهٍ/مستخدم: مقطع الرابط يحمل خطأً صريحاً
  const [linkError] = useState(
    () => typeof window !== 'undefined' && window.location.hash.includes('error'),
  )
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  // حارس إرسال مكرر (3A-914) — نفس نمط صفحة الدخول: الـref يُقفل
  // متزامناً داخل المعالج نفسه (تعطيل الزر وحده قد يسبقه إرسال ثانٍ)،
  // والإفراج دائماً من finally فلا حالة تحميل عالقة بعد أي مصير.
  const busyRef = useRef(false)
  const beginBusy = () => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    return true
  }
  const endBusy = () => {
    busyRef.current = false
    setBusy(false)
  }
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // نفس لوك أب الدخول (خطة الهوية P-1، توحيد 3A-310): وش دُفّي حين
  // يظهر الماسكوت ولوجو الكتاب عند إيقافه — صفحة الاسترداد سطح مصادقة
  // كالدخول تماماً فتأخذ نفس الوجه بدل اللوجو المنفرد
  const mascotVisible = useMascotVisible()
  // مهلة قصيرة لالتقاط جلسة الاستعادة من مقطع الرابط قبل إعلان فشلها
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setWaited(true), 2500)
    return () => clearTimeout(id)
  }, [])

  const handleRequestCode = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    // النموذج noValidate (3A-911): فحص البريد هنا بالعربية بدل فقاعة
    // المتصفح الإنجليزية التي كانت تسبق المعالج
    const emailError = validateEmailField(emailInput)
    if (emailError) {
      setError(emailError)
      return
    }
    if (!beginBusy()) return
    try {
      await requestPasswordReset(emailInput)
      // رد الخادم محايد: ننتقل لإدخال الكود في الحالتين
      setCodeRequested(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.passwordResetFailed'))
    } finally {
      endBusy()
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError(t('auth.passwordTooShort'))
      return
    }
    if (password !== passwordConfirm) {
      setError(t('auth.passwordMismatch'))
      return
    }
    if (!beginBusy()) return
    try {
      await updatePassword(password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.resetFailed'))
    } finally {
      endBusy()
    }
  }

  return (
    <div className="relative overflow-hidden min-h-screen bg-bg text-text flex items-start justify-center">
      <div className="relative w-full max-w-[640px] lg:max-w-[420px] px-4 pt-14 pb-10">
        <div className="text-center mb-6 rise-in">
          <div className="flex justify-center mb-3">
            {mascotVisible ? (
              <img
                src={doffyIcon}
                alt=""
                aria-hidden="true"
                width={84}
                height={84}
                draggable={false}
                className="rounded-[22px] shadow-card select-none"
              />
            ) : (
              <Logo size={76} />
            )}
          </div>
          <h1 className="type-screen m-0">{t('auth.resetTitle')}</h1>
        </div>
        <Card className="rise-in" style={{ animationDelay: '50ms' }}>
          {loading || !waited ? (
            <p className="text-muted text-[14px] text-center my-4">{t('auth.preparingPage')}</p>
          ) : done ? (
            <>
              <p className="bg-soft text-primary text-[14px] rounded-xl px-3 py-2 mb-4 mt-0">
                {t('auth.resetSuccess')}
              </p>
              <Button full type="button" onClick={() => navigate('/', { replace: true })}>
                <Check size={18} />
                {t('auth.continueToApp')}
              </Button>
            </>
          ) : !session ? (
            codeRequested ? (
              <CodeEntry
                email={emailInput}
                hint={t('auth.recoveryCodeSentNotice')}
                verifyLabel={t('auth.verifyRecoveryCode')}
                onVerify={(token) => confirmRecoveryWithCode(emailInput, token)}
                onResend={() => requestPasswordReset(emailInput)}
                onBack={() => setCodeRequested(false)}
                backLabel={t('auth.changeEmail')}
              />
            ) : (
              <form noValidate onSubmit={handleRequestCode}>
                {linkError && (
                  <p className="bg-bad-soft text-bad-text text-[13.5px] font-semibold rounded-xl px-3 py-2 mb-3 mt-0" role="alert">
                    {t('auth.resetLinkInvalid')}
                  </p>
                )}
                {error && (
                  <p className="bg-bad-soft text-bad-text text-[13.5px] font-semibold rounded-xl px-3 py-2 mb-3 mt-0" role="alert">
                    {error}
                  </p>
                )}
                <p className="text-muted text-[13.5px] mb-4 mt-0">{t('auth.resetCodeIntro')}</p>
                <Field label={t('auth.emailLabel')}>
                  <TextInput
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    required
                  />
                </Field>
                <Button full type="submit" disabled={busy} aria-busy={busy}>
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  {busy ? t('auth.sending') : t('auth.sendResetCode')}
                </Button>
                <Link to="/login" className="block text-center text-primary font-bold text-[14px] mt-3">
                  {t('auth.backToSignIn')}
                </Link>
              </form>
            )
          ) : (
            <form noValidate onSubmit={handleSubmit}>
              {error && (
                <p className="bg-bad-soft text-bad-text text-[13.5px] font-semibold rounded-xl px-3 py-2 mb-3 mt-0" role="alert">
                  {error}
                </p>
              )}
              <Field label={t('auth.newPasswordLabel')}>
                <TextInput
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  placeholder={t('auth.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              <Field label={t('auth.passwordConfirmLabel')}>
                <TextInput
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                />
              </Field>
              <Button full type="submit" disabled={busy} aria-busy={busy}>
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                {busy ? t('auth.saving') : t('auth.savePassword')}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
