import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Loader2, Send } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/form'
import { normalizeEgyptianPhone } from '../../lib/phone'
import { requestWhatsappRecoveryCode, verifyWhatsappRecoveryCode } from './api'
import { t } from '../../i18n'

type Step = 'phone' | 'set' | 'done'

/** مهلة إعادة الإرسال — تطابق حد الخادم بين طلبي كود (60 ث) */
const RESEND_SECONDS = 60

/**
 * استرداد كلمة السر برمز واتساب — قناة المنصة (3A-927): لا يُعرَض
 * إلا خلف علم العميل VITE_WHATSAPP_RECOVERY_ENABLED من صفحة
 * الاسترداد. الخطوات: رقم مربوط ← كود يصله واتساب من رقم المنصة
 * عبر دالة send-whatsapp-recovery ← الكود + كلمة سر جديدة في طلب
 * تحقق واحد تعيّن به الدالة السر عبر Admin API (لا جلسة وسيطة —
 * لا مسار استرداد هاتفياً أصلياً في Supabase Auth).
 *
 * رد طلب الكود محايد خادمياً (لا يكشف تسجيل الرقم)، فالإشعار بعد
 * الطلب مشروط الصياغة دائماً وننتقل لإدخال الكود في كل الأحوال —
 * نفس عقد حياد مسار الإيميل في صفحة الاسترداد.
 */
export function WhatsappRecovery() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('phone')
  const [phoneRaw, setPhoneRaw] = useState('')
  const [phoneE164, setPhoneE164] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)

  // حارس إرسال مكرر (3A-914) — نفس نمط شاشات المصادقة: الـref يُقفل
  // متزامناً داخل المعالج، والإفراج دائماً من finally
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

  // عدّاد إعادة الإرسال — نفس نمط PhoneAuth (3A-361)
  useEffect(() => {
    if (resendIn <= 0) return
    const id = window.setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [resendIn])

  const handleRequest = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const normalized = normalizeEgyptianPhone(phoneRaw)
    if (!normalized) {
      setError(t('auth.errInvalidPhone'))
      return
    }
    if (!beginBusy()) return
    try {
      await requestWhatsappRecoveryCode(normalized)
      setPhoneE164(normalized)
      setStep('set')
      setCode('')
      setResendIn(RESEND_SECONDS)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errWaRecoverySendFailed'))
    } finally {
      endBusy()
    }
  }

  const handleResend = async () => {
    setError(null)
    if (!beginBusy()) return
    try {
      await requestWhatsappRecoveryCode(phoneE164)
      setCode('')
      setResendIn(RESEND_SECONDS)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errWaRecoverySendFailed'))
    } finally {
      endBusy()
    }
  }

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t('auth.errCodeLength'))
      return
    }
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
      await verifyWhatsappRecoveryCode(phoneE164, code, password)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errWaRecoveryFailed'))
    } finally {
      endBusy()
    }
  }

  if (step === 'done') {
    return (
      <div>
        <p className="bg-soft text-primary text-[14px] rounded-xl px-3 py-2 mb-4 mt-0">
          {t('auth.waRecoverySuccess')}
        </p>
        <Button full type="button" onClick={() => navigate('/login', { replace: true })}>
          <Check size={18} />
          {t('auth.waRecoveryGoSignIn')}
        </Button>
      </div>
    )
  }

  return (
    <div>
      {error && (
        <p
          className="bg-bad-soft text-bad-text text-[13.5px] font-semibold rounded-xl px-3 py-2 mb-3 mt-0"
          role="alert"
        >
          {error}
        </p>
      )}

      {step === 'phone' ? (
        <form noValidate onSubmit={handleRequest}>
          <p className="text-muted text-[13.5px] mb-4 mt-0">{t('auth.waRecoveryIntro')}</p>
          <Field label={t('auth.phoneNumberLabel')}>
            <TextInput
              type="tel"
              dir="ltr"
              autoComplete="tel"
              inputMode="tel"
              placeholder={t('auth.phoneNumberPlaceholder')}
              value={phoneRaw}
              onChange={(e) => setPhoneRaw(e.target.value)}
              required
            />
          </Field>
          <Button full type="submit" disabled={busy} aria-busy={busy}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            {busy ? t('auth.sendingCode') : t('auth.waRecoverySendCode')}
          </Button>
        </form>
      ) : (
        <form noValidate onSubmit={handleVerify}>
          <p className="bg-soft text-primary text-[13.5px] rounded-xl px-3 py-2 mb-2 mt-0">
            {t('auth.waRecoveryCodeNotice')}
          </p>
          <p className="text-muted text-[13px] text-center mb-3 mt-0" dir="ltr">
            {phoneE164}
          </p>
          <Field label={t('auth.codeLabel')}>
            <TextInput
              type="text"
              dir="ltr"
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
            />
          </Field>
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
            {busy ? t('auth.verifying') : t('auth.waRecoveryVerify')}
          </Button>
          <div className="flex items-center justify-between mt-3">
            <button
              type="button"
              onClick={() => {
                setStep('phone')
                setError(null)
              }}
              className="bg-transparent border-0 cursor-pointer text-primary font-bold text-[13.5px]"
            >
              {t('auth.changeNumber')}
            </button>
            {resendIn > 0 ? (
              <span className="text-muted text-[13.5px]">
                {t('auth.resendIn', { seconds: resendIn })}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={busy}
                className="bg-transparent border-0 cursor-pointer text-primary font-bold text-[13.5px]"
              >
                {t('auth.resendCode')}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
