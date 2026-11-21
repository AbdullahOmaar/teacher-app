import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/form'
import { useAuth } from '../../lib/AuthProvider'
import { Logo } from '../../components/brand/Logo'
import { updatePassword } from './api'

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
      setError('كلمة المرور قصيرة — لازم 8 أحرف على الأقل.')
      return
    }
    if (password !== passwordConfirm) {
      setError('كلمة المرور وتأكيدها مش متطابقين.')
      return
    }
    setBusy(true)
    try {
      await updatePassword(password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تعيين كلمة المرور.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative overflow-hidden min-h-screen bg-bg text-text flex items-start justify-center">
      <div className="relative w-full max-w-[640px] px-4 pt-14 pb-10">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <Logo size={76} />
          </div>
          <h1 className="type-screen m-0">تعيين كلمة مرور جديدة</h1>
        </div>
        <Card>
          {loading || !waited ? (
            <p className="text-muted text-[14px] text-center my-4">بنجهّز الصفحة…</p>
          ) : done ? (
            <>
              <p className="bg-soft text-primary text-[14px] rounded-xl px-3 py-2 mb-4 mt-0">
                تم تعيين كلمة المرور الجديدة بنجاح.
              </p>
              <Button full type="button" onClick={() => navigate('/', { replace: true })}>
                متابعة للتطبيق
              </Button>
            </>
          ) : !session ? (
            <>
              <p className="bg-bad-soft text-bad-text text-[13.5px] font-semibold rounded-xl px-3 py-2 mb-4 mt-0" role="alert">
                الرابط ده غير صالح أو انتهت صلاحيته — اطلب رابط استعادة جديد من صفحة تسجيل الدخول.
              </p>
              <Link to="/login" className="block text-center text-primary font-bold text-[14px]">
                رجوع لتسجيل الدخول
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <p className="bg-bad-soft text-bad-text text-[13.5px] font-semibold rounded-xl px-3 py-2 mb-3 mt-0" role="alert">
                  {error}
                </p>
              )}
              <Field label="كلمة المرور الجديدة">
                <TextInput
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  placeholder="8 أحرف على الأقل"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              <Field label="تأكيد كلمة المرور">
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
                {busy ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
