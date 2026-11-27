import { invalidatePrefixes } from '../../lib/invalidate'
import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Send } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/form'
import { normalizeEgyptianPhone } from '../../lib/phone'
import { claimTeacherInvites, requestPhoneOtp, verifyPhoneOtp } from './api'
import { t } from '../../i18n'

type Step = 'phone' | 'code'

/** مهلة إعادة الإرسال — تطابق sms_max_frequency المضبوطة في Auth (60 ث) */
const RESEND_SECONDS = 60

/**
 * الدخول برقم الهاتف + كود واتساب (P5-3 / 3A-300) — لا يُعرَض إلا خلف
 * علم العميل VITE_WHATSAPP_OTP_ENABLED (lib/phone.ts).
 *
 * النموذج الاختياري per-teacher (0026): هذا دخول فقط، لا تسجيل —
 * الرقم يجب أن يكون مربوطاً مسبقاً بحساب قائم من إعدادات «واتساب»
 * (والقناة مفعّلة بأصول ذلك المدرس)، وrequestPhoneOtp يطلب بـ
 * shouldCreateUser=false فلا تُنشأ حسابات من هنا إطلاقاً. الكود يصله
 * من رقم واتسابه التجاري هو عبر Send SMS Hook. بعد التحقق: ادعاء
 * دعوات معلّقة بنفس عقد ما بعد دخول البريد (JWT حساب مربوط يحمل
 * البريد أيضاً)، وإبطال هوية الكاش، وتغيّر الجلسة يعيد التوجيه.
 */
export function PhoneAuth() {
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>('phone')
  const [phoneRaw, setPhoneRaw] = useState('')
  const [phoneE164, setPhoneE164] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)

  // عدّاد إعادة الإرسال (3A-361): الاعتماديات هي resendIn نفسه — التعبير
  // [resendIn > 0] كان يخفي التبعية ويثير تحذيرين؛ التوقيت مطابق عمليًا
  // (بانحراف ملي ثوانٍ لكل نبضة من إعادة إنشاء المؤقت كل ثانية):
  // المؤقت يُعاد إنشاؤه كل ثانية لأن ردّ النداء تحديث دالّي بلا إغلاق
  // على resendIn، والعدّ يبقى نبضة كل ثانية ويتوقف عند الصفر كما كان
  useEffect(() => {
    if (resendIn <= 0) return
    const id = window.setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [resendIn])

  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    const normalized = normalizeEgyptianPhone(phoneRaw)
    if (!normalized) {
      setError(t('auth.errInvalidPhone'))
      return
    }
    setBusy(true)
    try {
      await requestPhoneOtp(normalized)
      setPhoneE164(normalized)
      setStep('code')
      setCode('')
      setResendIn(RESEND_SECONDS)
      setNotice(t('auth.codeSentNotice'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errOtpSendFailed'))
    } finally {
      setBusy(false)
    }
  }

  const handleResend = async () => {
    setError(null)
    setBusy(true)
    try {
      await requestPhoneOtp(phoneE164)
      setResendIn(RESEND_SECONDS)
      setNotice(t('auth.codeSentNotice'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errOtpSendFailed'))
    } finally {
      setBusy(false)
    }
  }

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t('auth.errCodeLength'))
      return
    }
    setBusy(true)
    try {
      const { userId } = await verifyPhoneOtp(phoneE164, code)
      if (userId) {
        // نفس عقد ما بعد دخول البريد في LoginPage — الفشل هنا لا يمنع
        // الدخول (الحساب قائم أصلاً بحكم الربط المسبق).
        try {
          await claimTeacherInvites()
        } catch {
          // تجاهل: لا دعوات أو ستُدّعى في دخول قادم
        }
        await invalidatePrefixes(qc, ['current-teacher'])
      }
      // تغيّر الجلسة في AuthProvider يعيد التوجيه من LoginPage تلقائياً
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errOtpInvalid'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {notice && (
        <p className="bg-soft text-primary text-[13.5px] rounded-xl px-3 py-2 mb-3 mt-0">{notice}</p>
      )}
      {error && (
        <p className="bg-bad-soft text-bad-text text-[13.5px] font-semibold rounded-xl px-3 py-2 mb-3 mt-0" role="alert">
          {error}
        </p>
      )}

      {step === 'phone' ? (
        <form noValidate onSubmit={handleSend}>
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
          <Button full type="submit" disabled={busy}>
            <Send size={18} />
            {busy ? t('auth.sendingCode') : t('auth.sendCode')}
          </Button>
          <p className="text-muted text-[12px] mt-3 mb-0 text-center">{t('auth.phoneSignupNote')}</p>
          <p className="text-muted text-[12px] mt-1.5 mb-0 text-center">
            {t('auth.phoneEmailFallbackHint')}
          </p>
        </form>
      ) : (
        <form noValidate onSubmit={handleVerify}>
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
            {busy ? t('auth.verifying') : t('auth.verifyCode')}
          </Button>
          <div className="flex items-center justify-between mt-3">
            <button
              type="button"
              onClick={() => {
                setStep('phone')
                setError(null)
                setNotice(null)
              }}
              className="bg-transparent border-0 cursor-pointer text-primary font-bold text-[13.5px]"
            >
              {t('auth.changeNumber')}
            </button>
            {resendIn > 0 ? (
              <span className="text-muted text-[13.5px]">{t('auth.resendIn', { seconds: resendIn })}</span>
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
