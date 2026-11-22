import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/form'
import { useAuth } from '../../lib/AuthProvider'
import { Logo } from '../../components/brand/Logo'
import { useMascotVisible } from '../../components/mascot/useMascotVisible'
import doffyIcon from '../../assets/mascot/icon.webp'
import { Check } from 'lucide-react'
import { updatePassword } from './api'
import { t } from '../../i18n'

/**
 * صفحة تعيين كلمة مرور جديدة من رابط الاستعادة (SEC-5 جزئي):
 * رابط البريد يهبط هنا بجلسة استعادة مؤقتة ينشئها عميل Supabase من
 * مقطع الرابط تلقائياً؛ بوجود الجلسة نعرض نموذج كلمة جديدة، وبعد
 * الحفظ نوجّه للرئيسية. بلا جلسة (رابط منتهٍ/مستخدم) نعرض إرشاداً
 * لطلب رابط جديد من صفحة الدخول.
 */
export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [busy, setBusy] = useState(false)
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
    setBusy(true)
    try {
      await updatePassword(password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.resetFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative overflow-hidden min-h-screen bg-bg text-text flex items-start justify-center">
      <div className="relative w-full max-w-[640px] px-4 pt-14 pb-10">
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
            <>
              <p className="bg-bad-soft text-bad-text text-[13.5px] font-semibold rounded-xl px-3 py-2 mb-4 mt-0" role="alert">
                {t('auth.resetLinkInvalid')}
              </p>
              <Link to="/login" className="block text-center text-primary font-bold text-[14px]">
                {t('auth.backToSignIn')}
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
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
              <Button full type="submit" disabled={busy}>
                <Check size={18} />
                {busy ? t('auth.saving') : t('auth.savePassword')}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
