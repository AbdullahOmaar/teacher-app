import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useLocation } from 'react-router-dom'
import { FlaskConical } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/form'
import { useAuth } from '../../lib/AuthProvider'
import { Logo } from '../../components/brand/Logo'
import {
  claimTeacherInvites,
  ensureTeacherProfile,
  signInDemo,
  requestPasswordReset,
  resendConfirmation,
  signInWithEmail,
  signUpWithEmail,
} from './api'

type Mode = 'signin' | 'signup' | 'forgot'

/**
 * الدخول والتسجيل الحقيقي بـ Supabase Auth (بريد + كلمة مرور).
 * عند أول تسجيل بجلسة فورية يُنشأ صف teachers + إعدادات افتراضية؛
 * وإن تطلب تأكيد البريد تظهر رسالة، ويُستكمل الإنشاء من شاشة الإعداد
 * (Onboarding) بعد أول دخول. مع جلسة قائمة يُعاد التوجيه للرئيسية.
 */
export function LoginPage() {
  const { session, loading, configured } = useAuth()
  const qc = useQueryClient()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [mode, setMode] = useState<Mode>('signin')
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendBusy, setResendBusy] = useState(false)
  // إظهار زر إعادة إرسال التأكيد: بعد تسجيل بلا جلسة أو خطأ «بريد غير مؤكد»
  const [canResend, setCanResend] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!loading && session) {
    return <Navigate to={from} replace />
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
    setCanResend(false)
  }

  const handleResend = async () => {
    if (!email.trim()) {
      setError('اكتب بريدك الإلكتروني الأول علشان نبعت رسالة التأكيد.')
      return
    }
    setResendBusy(true)
    setError(null)
    try {
      await resendConfirmation(email)
      setNotice('أعدنا إرسال رسالة التأكيد — راجع بريدك (ومجلد الرسائل غير المرغوبة)، وافتح الرابط وبعدين سجّل دخولك.')
      setCanResend(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّرت إعادة الإرسال.')
    } finally {
      setResendBusy(false)
    }
  }

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      await requestPasswordReset(email)
      // رد محايد دائماً: لا نؤكد ولا ننفي تسجيل البريد
      setNotice('لو البريد ده مسجل عندنا، هتوصلك رسالة فيها رابط لتعيين كلمة مرور جديدة خلال دقائق.')
      setMode('signin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إرسال رسالة الاستعادة.')
    } finally {
      setBusy(false)
    }
  }

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      await signInWithEmail(email, password)
      // تغيّر الجلسة في AuthProvider يعيد التوجيه تلقائياً بالأعلى
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذّر تسجيل الدخول.'
      setError(msg)
      if (msg.includes('لسه مش متأكد')) setCanResend(true)
    } finally {
      setBusy(false)
    }
  }

  const handleDemo = async () => {
    setError(null)
    setNotice(null)
    setDemoBusy(true)
    try {
      await signInDemo()
      // تغيّر الجلسة في AuthProvider يعيد التوجيه تلقائياً بالأعلى
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الدخول التجريبي.')
    } finally {
      setDemoBusy(false)
    }
  }

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (!displayName.trim()) {
      setError('اكتب اسمك (هيظهر كاسم المدرس في التطبيق).')
      return
    }
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
      const result = await signUpWithEmail({
        email,
        password,
        displayName,
        phone: phone || undefined,
      })
      if (result.hasSession && result.userId) {
        // دعوة بريد معلّقة؟ (migration ‏0006): إن ادّعى الحساب الجديد
        // دعوة مساعد، فهو منضم لفريق مدرس آخر — لا ننشئ له ملف مدرس
        // خاصاً هنا حتى يهبط داخل حساب المدرس مباشرة (وإن أُزيل من
        // الفريق لاحقاً ستعرض له شاشة الإعداد إنشاء ملفه). فشل الادعاء
        // لا يمنع المسار العادي.
        let claimed = 0
        try {
          claimed = (await claimTeacherInvites()).claimed
        } catch {
          claimed = 0
        }
        if (claimed === 0) {
          // أول تسجيل: إنشاء ملف المدرس + إعداداته (آمن التكرار،
          // وإن فشل هنا تستكمله شاشة الإعداد بعد الدخول)
          try {
            await ensureTeacherProfile(result.userId, displayName, phone || null)
          } catch {
            // تجاهل: Onboarding سيعيد المحاولة
          }
        }
        // إصلاح جذري (تدقيق أول استخدام — M1): تغيّر الجلسة يعيد توجيه
        // المستخدم فوراً، فتُحلّ الهوية في AppShell غالباً قبل انتهاء
        // إنشاء الملف هنا، وتُخزَّن نتيجة «لا مدرس» في الكاش — وبلا هذا
        // الإبطال يعلق المسجّل الجديد على شاشة «كمّل إعداد حسابك» رغم
        // أن التسجيل جمع بياناته والملف صار موجوداً. الإبطال يجبر حلّ
        // الهوية على إعادة القراءة بعد اكتمال الإنشاء/الادعاء.
        await qc.invalidateQueries({ queryKey: ['current-teacher'] })
      } else {
        setMode('signin')
        setPassword('')
        setPasswordConfirm('')
        setNotice(
          'تم إنشاء حسابك — افتح رسالة التأكيد في بريدك الإلكتروني، وبعدين سجّل دخولك من هنا.',
        )
        setCanResend(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إنشاء الحساب.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative overflow-hidden min-h-screen bg-bg text-text flex items-start justify-center">
      {/* بصمة الهوية: علامة الشعار مائية كبيرة خفيفة جداً خلف المحتوى */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <Logo decorative size={430} className="opacity-[0.06]" />
      </div>
      <div className="relative w-full max-w-[640px] px-4 pt-14 pb-10">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <Logo size={76} />
          </div>
          <h1 className="type-screen m-0">تطبيق المدرس</h1>
          <p className="text-muted text-[13.5px] mt-1">
            {mode === 'signin'
              ? 'سجّل دخولك علشان تكمل'
              : mode === 'signup'
                ? 'أنشئ حساب مدرس جديد'
                : 'استعادة كلمة المرور'}
          </p>
        </div>

        <div className="flex bg-soft rounded-xl p-1 mb-4" role="tablist" aria-label="الدخول أو التسجيل">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            onClick={() => switchMode('signin')}
            className={`flex-1 min-h-[48px] rounded-xl border-0 cursor-pointer font-bold text-[15px] ${
              mode === 'signin' ? 'bg-card text-primary shadow-card' : 'bg-transparent text-muted'
            }`}
          >
            تسجيل الدخول
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            onClick={() => switchMode('signup')}
            className={`flex-1 min-h-[48px] rounded-xl border-0 cursor-pointer font-bold text-[15px] ${
              mode === 'signup' ? 'bg-card text-primary shadow-card' : 'bg-transparent text-muted'
            }`}
          >
            حساب جديد
          </button>
        </div>

        <Card>
          {notice && (
            <p className="bg-soft text-primary text-[13.5px] rounded-xl px-3 py-2 mb-3 mt-0">{notice}</p>
          )}
          {error && (
            <p className="bg-bad-soft text-bad-text text-[13.5px] font-semibold rounded-xl px-3 py-2 mb-3 mt-0" role="alert">
              {error}
            </p>
          )}

          {mode === 'signin' ? (
            <form onSubmit={handleSignIn}>
              <Field label="البريد الإلكتروني">
                <TextInput
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field label="كلمة المرور">
                <TextInput
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              <Button full type="submit" disabled={busy || !configured}>
                {busy ? 'جارٍ تسجيل الدخول…' : 'دخول'}
              </Button>
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="block mx-auto mt-3 bg-transparent border-0 cursor-pointer text-primary font-bold text-[13.5px]"
              >
                نسيت كلمة المرور؟
              </button>
              {canResend && (
                <Button
                  full
                  variant="soft"
                  type="button"
                  onClick={handleResend}
                  disabled={resendBusy}
                  className="mt-2"
                >
                  {resendBusy ? 'جارٍ الإرسال…' : 'إعادة إرسال رسالة التأكيد'}
                </Button>
              )}
            </form>
          ) : mode === 'forgot' ? (
            <form onSubmit={handleForgot}>
              <Field label="البريد الإلكتروني">
                <TextInput
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Button full type="submit" disabled={busy || !configured}>
                {busy ? 'جارٍ الإرسال…' : 'إرسال رابط الاستعادة'}
              </Button>
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="block mx-auto mt-3 bg-transparent border-0 cursor-pointer text-primary font-bold text-[13.5px]"
              >
                رجوع لتسجيل الدخول
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp}>
              <Field label="اسم المدرس">
                <TextInput
                  autoComplete="name"
                  placeholder="مثال: مستر أحمد سامي"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </Field>
              <Field label="رقم الموبايل (اختياري)">
                <TextInput
                  type="tel"
                  dir="ltr"
                  autoComplete="tel"
                  placeholder="01xxxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field label="البريد الإلكتروني">
                <TextInput
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field label="كلمة المرور">
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
              <Button full type="submit" disabled={busy || !configured}>
                {busy ? 'جارٍ إنشاء الحساب…' : 'إنشاء الحساب'}
              </Button>
              <p className="text-muted text-[12px] mt-3 mb-0 text-center">
                بإنشاء الحساب هيتعمل ملف مدرس خاص بيك وإعدادات افتراضية تلقائياً.
              </p>
            </form>
          )}

          <div className="flex items-center gap-3 mt-5 mb-3" aria-hidden="true">
            <span className="flex-1 h-px bg-border" />
            <span className="text-muted text-[12px]">أو جرّب على طول</span>
            <span className="flex-1 h-px bg-border" />
          </div>
          <Button full variant="soft" type="button" onClick={handleDemo} disabled={demoBusy || busy || !configured}>
            {demoBusy ? (
              'جارٍ الدخول التجريبي…'
            ) : (
              <>
                <FlaskConical size={20} />
                دخول تجريبي — جرّب التطبيق فوراً
              </>
            )}
          </Button>
          <p className="text-muted text-[12px] mt-2 mb-0 text-center">
            الحساب التجريبي مشترك ومفتوح للكل — ما تدخّلش فيه بيانات حقيقية.
          </p>

          {!configured && (
            <p className="text-warn-text text-[13.5px] mt-3 mb-0 text-center">
              وضع تجريبي: لسه Supabase مش مربوط — عبّي قيم .env علشان الدخول يشتغل.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
