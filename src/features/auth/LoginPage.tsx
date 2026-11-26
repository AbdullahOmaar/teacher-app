import { invalidatePrefixes } from '../../lib/invalidate'
import { useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { FlaskConical, Loader2, LogIn, Moon, Send, Sun, UserPlus } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/form'
import { useAuth } from '../../lib/useAuth'
import { versionStampLine } from '../../lib/buildInfo'
import { useTheme } from '../../hooks/useTheme'
import { Logo } from '../../components/brand/Logo'
import { useMascotVisible } from '../../components/mascot/useMascotVisible'
import doffyIcon from '../../assets/mascot/icon.webp'
import {
  checkSelfRegistrationAllowed,
  claimTeacherInvites,
  confirmSignUpWithCode,
  ensureTeacherProfile,
  signInDemo,
  requestPasswordReset,
  resendConfirmation,
  signInWithEmail,
  signUpNextStep,
  signUpWithEmail,
} from './api'
import { CodeEntry } from './CodeEntry'
import { t } from '../../i18n'
import { WHATSAPP_OTP_ENABLED } from '../../lib/phone'
import { PhoneAuth } from './PhoneAuth'

type Mode = 'signin' | 'signup' | 'forgot'
type Method = 'email' | 'phone'

/**
 * الدخول والتسجيل الحقيقي بـ Supabase Auth (بريد + كلمة مرور).
 * عند أول تسجيل يُنشأ صف teachers + إعدادات افتراضية بعد قيام
 * الجلسة (فورية أو بدخول فوري بنفس البيانات)؛ وإن كان نظام التأكيد
 * مفعّلاً من إدارة المنصة تظهر شاشة إدخال كود التأكيد الإلزامية
 * (3A-904) قبل الدخول، ويُستكمل الإنشاء من شاشة الإعداد
 * (Onboarding) بعد أول دخول.
 * مع جلسة قائمة يُعاد التوجيه للرئيسية.
 */
export function LoginPage() {
  const { session, loading, configured } = useAuth()
  const qc = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [mode, setMode] = useState<Mode>('signin')
  // طريقة الدخول: البريد افتراضياً دائماً؛ الهاتف لا يظهر إلا بعلم
  // WHATSAPP_OTP_ENABLED (P5-3) — عند قفله لا أثر لهذا الحقل مرئياً
  const [method, setMethod] = useState<Method>('email')
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  // حارس إرسال مكرر (3A-914): تعطيل الزر وحده لا يكفي — إرسال ثانٍ
  // متزامن (Enter مزدوج أو إرسال برمجي) قد يسبق إعادة التصيير فيمرّ
  // قبل ما تنعكس حالة التعطيل. الـref يُقفل فوراً وبشكل متزامن داخل
  // المعالج نفسه، والحالة المرئية تتبعه؛ والإفراج دائماً من finally
  // فلا تبقى حالة «جارٍ…» عالقة بعد نجاح أو خطأ.
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
  // بريد ينتظر تأكيد الكود (3A-904): بعد تسجيل بلا جلسة أو من مسار
  // «بريد غير مؤكد» عند الدخول — عندها تعرض البطاقة شاشة إدخال الكود
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null)
  // إظهار زر «إدخال كود التأكيد» بعد خطأ «بريد غير مؤكد» عند الدخول
  const [showCodeCta, setShowCodeCta] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // لوك أب الدخول (خطة الهوية P-1): وش دُفّي هو وجه التطبيق — وقبل
  // الجلسة يحسم القرار مرآة الجهاز المحلية/الافتراضي (نفس نمط سبلاش
  // الإقلاع)، وعند إيقاف الماسكوت يرجع لوجو الكتاب كما كان
  const mascotVisible = useMascotVisible()
  // زر تبديل المظهر في صفحة الدخول نفسها (3A-384 ملاحظة ٧): كان الثيم
  // يطبق من التخزين عند التحميل لكن بلا أي وسيلة تبديل قبل الدخول.
  // الأيقونة تُشتق من وضع المخزن المشترك (لا قراءة DOM أثناء التصيير —
  // ملاحظة مراجعة 3A-384): الداكن فعليًا = وضع داكن صريح أو تلقائي
  // مع نظام داكن.
  const { mode: themeMode, toggle: toggleTheme } = useTheme()
  const loginIsDark =
    themeMode === 'dark' ||
    (themeMode === 'auto' &&
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)

  if (!loading && session) {
    return <Navigate to={from} replace />
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
    setShowCodeCta(false)
    setPendingConfirmEmail(null)
  }

  const switchMethod = (next: Method) => {
    setMethod(next)
    setError(null)
    setNotice(null)
    setShowCodeCta(false)
    setPendingConfirmEmail(null)
  }

  /**
   * عقد ما بعد قيام الجلسة من تسجيل جديد (جلسة فورية أو تأكيد بالكود
   * 3A-904 — المساران متطابقان هنا): دعوة بريد معلّقة؟ (migration
   * ‏0006) إن ادّعى الحساب الجديد دعوة مساعد فهو منضم لفريق مدرس آخر
   * — لا ننشئ له ملف مدرس خاصاً حتى يهبط داخل حساب المدرس مباشرة
   * (وإن أُزيل من الفريق لاحقاً ستعرض له شاشة الإعداد إنشاء ملفه).
   * فشل الادعاء لا يمنع المسار العادي، وفشل إنشاء الملف تستكمله
   * شاشة الإعداد بعد الدخول. بلا اسم معروض (مسار «بريد غير مؤكد» من
   * شاشة الدخول) يُترك إنشاء الملف للإعداد — يقرأ الاسم من بيانات
   * الحساب المحفوظة عند التسجيل.
   */
  const finishSignUpSession = async (userId: string) => {
    let claimed = 0
    try {
      claimed = (await claimTeacherInvites()).claimed
    } catch {
      claimed = 0
    }
    if (claimed === 0 && displayName.trim()) {
      try {
        await ensureTeacherProfile(userId, displayName, phone || null)
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
    await invalidatePrefixes(qc, ['current-teacher'])
  }

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault()
    if (!beginBusy()) return
    setError(null)
    setNotice(null)
    try {
      await requestPasswordReset(email)
      // الرد محايد دائماً: لا نؤكد ولا ننفي تسجيل البريد — والانتقال
      // لشاشة الاستعادة بالبريد مكتوباً يحدث في الحالتين (3A-904:
      // الكود يُدخَل هناك، فتنشئ جلسة الاستعادة ويظهر نموذج كلمة
      // المرور في نفس الصفحة)
      navigate('/reset-password', { state: { email: email.trim() } })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.passwordResetFailed'))
    } finally {
      endBusy()
    }
  }

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault()
    if (!beginBusy()) return
    setError(null)
    setNotice(null)
    try {
      await signInWithEmail(email, password)
      // تغيّر الجلسة في AuthProvider يعيد التوجيه تلقائياً بالأعلى
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('auth.signInFailed')
      setError(msg)
      // بريد غير مؤكد ليس طريقاً مسدوداً (3A-904): زر يفتح شاشة
      // إدخال كود التأكيد لنفس البريد (وفيها إعادة الإرسال بعدّاد)
      if (msg === t('auth.errEmailNotConfirmed')) setShowCodeCta(true)
    } finally {
      endBusy()
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
      setError(err instanceof Error ? err.message : t('auth.demoFailed'))
    } finally {
      setDemoBusy(false)
    }
  }

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (!displayName.trim()) {
      setError(t('auth.nameRequired'))
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
      // بوابة قفل التسجيل (0057 — قائمة السماح): تُفحص قبل signUp
      // حتى لا ينشأ حساب Auth أصلاً لمرفوض؛ غياب الدالة قبل تطبيق
      // المهاجرة = التسجيل المفتوح الحالي (ترجع true). رفض البوابة
      // هنا لا يمنع مسار الدخول ولا الديمو — التسجيل وحده المقفول.
      const allowed = await checkSelfRegistrationAllowed(email, phone || null)
      if (!allowed) {
        setError(t('auth.registrationInviteOnly'))
        return
      }
      const result = await signUpWithEmail({
        email,
        password,
        displayName,
        phone: phone || undefined,
      })
      // دخول فوري بنفس البيانات عند غياب الجلسة الفورية (3A-904 —
      // نموذج التأكيد بتصحيح المالك 2026-11-26 ~17:19): نظام التأكيد
      // مطفأ افتراضياً (حال الإنتاج اليوم) فينجح الدخول رغم غياب
      // التأكيد ويدخل المسجّل فوراً بلا أي كود؛ ومتى فعّلته إدارة
      // المنصة يرفض الخادم دخول غير المؤكَّدين — فشل المحاولة مصيره
      // الصريح هو السقوط لشاشة الكود الإلزامية تحت، لا طريق مسدود.
      let instantSignInOk = false
      if (!result.hasSession) {
        try {
          await signInWithEmail(email, password)
          instantSignInOk = true
        } catch {
          instantSignInOk = false
        }
      }
      if (signUpNextStep(result.hasSession, instantSignInOk) === 'enter') {
        if (result.userId) await finishSignUpSession(result.userId)
        // الجلسة قائمة (فورية أو من الدخول الفوري): تغيّرها يعيد
        // التوجيه للرئيسية تلقائياً من أعلى المكوّن
      } else {
        // نظام التأكيد مفعّل: شاشة إدخال الكود لنفس البريد (3A-904)
        // — إلزامية بلا أي تخطٍّ؛ التحقق الناجح يصدر الجلسة ويكمل
        // نفس عقد ما بعد التسجيل في finishSignUpSession
        setPassword('')
        setPasswordConfirm('')
        setPendingConfirmEmail(email.trim())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.signUpFailed'))
    } finally {
      endBusy()
    }
  }

  return (
    <div className="relative overflow-hidden min-h-screen bg-bg text-text flex items-start justify-center">
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-3 end-3 z-10 w-12 h-12 flex items-center justify-center cursor-pointer bg-transparent border-0 text-text"
        aria-label={t('shell.toggleTheme')}
      >
        {loginIsDark ? <Sun size={24} /> : <Moon size={24} />}
      </button>
      {/* بصمة الهوية: علامة الشعار مائية كبيرة خفيفة جداً خلف المحتوى */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <Logo decorative size={430} className="opacity-[0.06]" />
      </div>
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
          <h1 className="type-screen m-0">{t('auth.appTitle')}</h1>
          <p className="text-muted text-[13.5px] mt-1">
            {method === 'phone'
              ? t('auth.phoneSubtitle')
              : mode === 'signin'
                ? t('auth.signInSubtitle')
                : mode === 'signup'
                  ? t('auth.signUpSubtitle')
                  : t('auth.forgotSubtitle')}
          </p>
        </div>

        {WHATSAPP_OTP_ENABLED && !pendingConfirmEmail && (
          <div className="flex bg-soft rounded-xl p-1 mb-4 rise-in" style={{ animationDelay: '50ms' }} role="tablist" aria-label={t('auth.methodLabel')}>
            <button
              type="button"
              role="tab"
              aria-selected={method === 'email'}
              onClick={() => switchMethod('email')}
              className={`flex-1 min-h-[48px] rounded-xl border-0 cursor-pointer font-bold text-[15px] ${
                method === 'email' ? 'bg-card text-primary shadow-card' : 'bg-transparent text-muted'
              }`}
            >
              {t('auth.methodEmail')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={method === 'phone'}
              onClick={() => switchMethod('phone')}
              className={`flex-1 min-h-[48px] rounded-xl border-0 cursor-pointer font-bold text-[15px] ${
                method === 'phone' ? 'bg-card text-primary shadow-card' : 'bg-transparent text-muted'
              }`}
            >
              {t('auth.methodPhone')}
            </button>
          </div>
        )}

        {method === 'email' && !pendingConfirmEmail && (
        <div className="flex bg-soft rounded-xl p-1 mb-4 rise-in" style={{ animationDelay: '50ms' }} role="tablist" aria-label={t('auth.authTabsLabel')}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            onClick={() => switchMode('signin')}
            className={`flex-1 min-h-[48px] rounded-xl border-0 cursor-pointer font-bold text-[15px] ${
              mode === 'signin' ? 'bg-card text-primary shadow-card' : 'bg-transparent text-muted'
            }`}
          >
            {t('auth.signInTab')}
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
            {t('auth.signUpTab')}
          </button>
        </div>
        )}

        <Card className="rise-in" style={{ animationDelay: '90ms' }}>
          {notice && (
            <p className="bg-soft text-primary text-[13.5px] rounded-xl px-3 py-2 mb-3 mt-0">{notice}</p>
          )}
          {error && (
            <p className="bg-bad-soft text-bad-text text-[13.5px] font-semibold rounded-xl px-3 py-2 mb-3 mt-0" role="alert">
              {error}
            </p>
          )}

          {pendingConfirmEmail ? (
            <CodeEntry
              email={pendingConfirmEmail}
              hint={t('auth.emailCodeSentNotice')}
              verifyLabel={t('auth.verifyCode')}
              onVerify={async (token) => {
                const { userId } = await confirmSignUpWithCode(pendingConfirmEmail, token)
                if (userId) await finishSignUpSession(userId)
              }}
              onResend={() => resendConfirmation(pendingConfirmEmail)}
              onBack={() => setPendingConfirmEmail(null)}
              backLabel={t('auth.changeEmail')}
            />
          ) : method === 'phone' ? (
            <PhoneAuth />
          ) : mode === 'signin' ? (
            <form onSubmit={handleSignIn}>
              <Field label={t('auth.emailLabel')}>
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
              <Field label={t('auth.passwordLabel')}>
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
              <Button full type="submit" disabled={busy || !configured} aria-busy={busy}>
                {busy ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                {busy ? t('auth.signingIn') : t('auth.signInSubmit')}
              </Button>
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="flex items-center mx-auto mt-3 min-h-[36px] px-3 bg-transparent border-0 cursor-pointer text-primary font-bold text-[13.5px]"
              >
                {t('auth.forgotPasswordLink')}
              </button>
              {showCodeCta && (
                <Button
                  full
                  variant="soft"
                  type="button"
                  className="mt-2"
                  onClick={() => {
                    setError(null)
                    setShowCodeCta(false)
                    setPendingConfirmEmail(email.trim())
                  }}
                >
                  {t('auth.enterConfirmationCode')}
                </Button>
              )}
            </form>
          ) : mode === 'forgot' ? (
            <form onSubmit={handleForgot}>
              <Field label={t('auth.emailLabel')}>
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
              <Button full type="submit" disabled={busy || !configured} aria-busy={busy}>
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                {busy ? t('auth.sending') : t('auth.sendResetCode')}
              </Button>
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="block mx-auto mt-3 bg-transparent border-0 cursor-pointer text-primary font-bold text-[13.5px]"
              >
                {t('auth.backToSignIn')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp}>
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
              <Field label={t('auth.emailLabel')}>
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
              <Field label={t('auth.passwordLabel')}>
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
              <Button full type="submit" disabled={busy || !configured} aria-busy={busy}>
                {busy ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                {busy ? t('auth.creatingAccount') : t('auth.createAccount')}
              </Button>
              <p className="text-muted text-[12px] mt-3 mb-0 text-center">
                {t('auth.signUpNote')}
              </p>
            </form>
          )}

          {!pendingConfirmEmail && (
            <>
              <div className="flex items-center gap-3 mt-5 mb-3" aria-hidden="true">
                <span className="flex-1 h-px bg-border" />
                <span className="text-muted text-[12px]">{t('auth.tryDivider')}</span>
                <span className="flex-1 h-px bg-border" />
              </div>
              <Button full variant="soft" type="button" onClick={handleDemo} disabled={demoBusy || busy || !configured}>
                {demoBusy ? (
                  t('auth.demoLoading')
                ) : (
                  <>
                    <FlaskConical size={20} />
                    {t('auth.demoCta')}
                  </>
                )}
              </Button>
              <p className="text-muted text-[12px] mt-2 mb-0 text-center">
                {t('auth.demoWarning')}
              </p>
            </>
          )}

          {!configured && (
            <p className="text-warn-text text-[13.5px] mt-3 mb-0 text-center">
              {t('auth.notConfiguredNote')}
            </p>
          )}
        </Card>

        {/* فوتر ختم الإصدار ووقت النشر (قاعدة المالك 2026-11-25،
            امتداد 3A-312): نفس السطر الموحّد في كل المواضع، مبني من
            بيانات البناء عبر lib/buildInfo — يسهّل الدعم قبل الدخول */}
        <p className="text-muted text-[13px] mt-4 mb-0 text-center">
          {versionStampLine()}
        </p>
      </div>
    </div>
  )
}
