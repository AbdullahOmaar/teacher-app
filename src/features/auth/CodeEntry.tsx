import { useEffect, useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/form'
import { t } from '../../i18n'

/** مهلة إعادة الإرسال — تطابق حد خادم البريد بين كل إرسالين (60 ث) */
const RESEND_SECONDS = 60

interface CodeEntryProps {
  /** البريد الذي وصله الكود — يُعرَض كما هو تحت التلميح */
  email: string
  /** نص الإرشاد أعلى الحقل (بعتنا كوداً على بريدك…) */
  hint: string
  /** نص زر التأكيد (يختلف بين التسجيل والاستعادة) */
  verifyLabel: string
  /** التحقق من الكود — يرمي خطأً مترجماً عند الفشل */
  onVerify: (token: string) => Promise<void>
  /** إعادة إرسال كود جديد لنفس البريد */
  onResend: () => Promise<void>
  /** الرجوع لتعديل البريد/الخطوة السابقة */
  onBack: () => void
  backLabel: string
}

/**
 * إدخال كود تحقق بريدي من 6 أرقام (3A-904) — مكوّن مشترك بين تأكيد
 * التسجيل واستعادة كلمة المرور، على نمط PhoneAuth تفاعلياً (عدّاد
 * إعادة إرسال 60 ثانية + أخطاء عربية من مترجم api.ts). الكود يولّده
 * GoTrue ويرسله قالب البريد (كود فقط بلا رابط ولا تفاصيل تقنية)،
 * والتحقق عند المتصل عبر verifyOtp. يُركَّب فقط بعد إرسال كود فعلي
 * (تسجيل/طلب استعادة/وصول من صفحة الدخول)، فيبدأ العدّاد من 60
 * عند التركيب — وهو نفس حد الخادم بين الإرسالين فلا وعد كاذب.
 */
export function CodeEntry({
  email,
  hint,
  verifyLabel,
  onVerify,
  onResend,
  onBack,
  backLabel,
}: CodeEntryProps) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(RESEND_SECONDS)

  // نفس نمط عدّاد PhoneAuth (3A-361): الاعتماديات هي resendIn نفسه،
  // والمؤقت يُعاد إنشاؤه كل ثانية لأن ردّ النداء تحديث دالّي
  useEffect(() => {
    if (resendIn <= 0) return
    const id = window.setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [resendIn])

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t('auth.errCodeLength'))
      return
    }
    setBusy(true)
    try {
      await onVerify(code.trim())
      // النجاح يغيّر الجلسة/الشاشة عند المتصل — لا حالة محلية هنا
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errOtpInvalid'))
    } finally {
      setBusy(false)
    }
  }

  const handleResend = async () => {
    setError(null)
    setBusy(true)
    try {
      await onResend()
      setCode('')
      setResendIn(RESEND_SECONDS)
      setNotice(t('auth.emailCodeResentNotice'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.resendFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="bg-soft text-primary text-[13.5px] rounded-xl px-3 py-2 mb-2 mt-0">{hint}</p>
      <p className="text-muted text-[13px] text-center mb-3 mt-0" dir="ltr">
        {email}
      </p>
      {notice && (
        <p className="bg-soft text-primary text-[13.5px] rounded-xl px-3 py-2 mb-3 mt-0">{notice}</p>
      )}
      {error && (
        <p
          className="bg-bad-soft text-bad-text text-[13.5px] font-semibold rounded-xl px-3 py-2 mb-3 mt-0"
          role="alert"
        >
          {error}
        </p>
      )}
      <form onSubmit={handleVerify}>
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
        <Button full type="submit" disabled={busy}>
          <Check size={18} />
          {busy ? t('auth.verifying') : verifyLabel}
        </Button>
        <div className="flex items-center justify-between mt-3">
          <button
            type="button"
            onClick={onBack}
            className="bg-transparent border-0 cursor-pointer text-primary font-bold text-[13.5px]"
          >
            {backLabel}
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
    </div>
  )
}
