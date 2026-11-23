import { useState } from 'react'
import { Check, KeyRound, LogIn, LogOut, MessageCircle, UserX, UserCheck } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Chip, ChipRow, Field, FormError, TextInput } from '../../components/ui/form'
import { useToast } from '../../components/ui/toast'
import { formatDateTimeAr } from '../../lib/format'
import { t } from '../../i18n'
import { TTL_PRESET_DAYS, clampTtlDays } from './tokenLifecycle'
import {
  clearPortalSessionToken,
  portalChangePassword,
  portalCredentialsWaUrl,
  portalLogin,
  portalLogout,
  portalPasswordProblem,
  savePortalSessionToken,
  type PortalAccountRole,
  type PortalLoginResult,
} from './accounts'
import {
  usePortalAccounts,
  useRevokePortalAccountSessions,
  useSetPortalAccountActive,
  useUpsertPortalAccount,
} from './hooks'

// ===========================================================================
// مكوّنات دخول البوابات المشتركة (3A-385): اختيار مدة الرابط (جهة
// المدرس)، إدارة حساب الدخول (جهة المدرس)، ونموذج الدخول وبطاقات
// الحساب (جهة البوابة العامة). النصوص من قاموس portal — البوابتان
// تتشاركان هذه المكوّنات كما تتشاركان tokenLifecycle.
// ===========================================================================

// ---------------------------------------------------------------------------
// جهة المدرس: اختيار مدة صلاحية الرابط — مقترحات جاهزة + مدة مخصصة.
// القيمة تُضبط دائماً عبر clampTtlDays (1..365) قبل أي استخدام/حفظ.
// ---------------------------------------------------------------------------

export function LinkDurationField({
  value,
  onChange,
}: {
  value: number
  onChange: (days: number) => void
}) {
  const isPreset = (TTL_PRESET_DAYS as readonly number[]).includes(value)
  return (
    <div className="block mb-3">
      <span className="block text-[13.5px] leading-[1.7] text-muted font-semibold mb-1">
        {t('portal.durationLabel')}
      </span>
      <ChipRow>
        {TTL_PRESET_DAYS.map((d) => (
          <Chip key={d} active={value === d} onClick={() => onChange(d)}>
            {t('portal.durationDays', { days: d })}
          </Chip>
        ))}
        <Chip active={!isPreset} onClick={() => onChange(value)}>
          {t('portal.durationCustomChip')}
        </Chip>
      </ChipRow>
      {!isPreset && (
        <div className="mt-2">
          <TextInput
            type="number"
            min={1}
            max={365}
            inputMode="numeric"
            value={value}
            onChange={(e) => onChange(clampTtlDays(e.target.value))}
            aria-label={t('portal.durationLabel')}
          />
        </div>
      )}
      <p className="text-muted text-[12px] mt-1.5 mb-0">{t('portal.durationSaveNote')}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// جهة المدرس: إدارة حساب دخول (ولي أمر طالب أو الطالب نفسه) من الشيت —
// تعيين/إعادة ضبط كلمة السر (اسم الدخول مشتق خادمياً)، حالة الحساب،
// إيقاف/تفعيل، وإبطال كل الجلسات. كلمة السر المكتوبة تعيش في حالة
// المكوّن فقط وتُستخدم مرة واحدة لإرسالها واتساب بعد الحفظ مباشرة.
// ---------------------------------------------------------------------------

export function PortalAccountBlock({
  teacherId,
  role,
  targetId,
  usernameHint,
  phone,
  portalPath,
}: {
  teacherId: string
  role: PortalAccountRole
  /** guardian_id أو student_id بحسب الدور — null = الهدف غير معروف بعد */
  targetId: string | null
  /** اسم الدخول المتوقع للعرض (هاتف ولي الأمر/كود الطالب) */
  usernameHint: string | null
  /** رقم واتساب إرسال بيانات الدخول */
  phone: string | null
  portalPath: '/portal' | '/student-portal'
}) {
  const accountsQ = usePortalAccounts(teacherId)
  const upsert = useUpsertPortalAccount(teacherId)
  const setActive = useSetPortalAccountActive(teacherId)
  const revokeSessions = useRevokePortalAccountSessions(teacherId)
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [justSet, setJustSet] = useState<{ username: string; password: string } | null>(null)

  const account = (accountsQ.data ?? []).find((a) =>
    role === 'guardian' ? a.guardian_id === targetId && targetId !== null : a.student_id === targetId,
  )
  const problem = password ? portalPasswordProblem(password) : null
  const waUrl = justSet
    ? portalCredentialsWaUrl(phone, {
        username: justSet.username,
        password: justSet.password,
        role,
        portalUrl: `${window.location.origin}${portalPath}`,
      })
    : null

  return (
    <div className="mt-5">
      <h4 className="type-section mb-1 flex items-center gap-2">
        <KeyRound size={20} className="text-primary" /> {t('portal.accountTitle')}
      </h4>
      <p className="text-muted text-[13.5px] mt-0">{t('portal.accountIntro')}</p>

      {targetId === null ? (
        <p className="text-muted text-[13.5px]">{t('portal.accountNoGuardianYet')}</p>
      ) : (
        <>
          {account && (
            <div className="rounded-xl border border-border bg-bg p-3 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[12px] font-bold border rounded-full px-2.5 py-1 ${
                    account.is_active
                      ? 'bg-ok/10 text-ok-text border-ok/30'
                      : 'bg-bad/10 text-bad-text border-bad/30'
                  }`}
                >
                  {account.is_active ? t('portal.accountActive') : t('portal.accountDisabled')}
                </span>
                <span className="text-[13.5px]">
                  {t('portal.accountUsernameLabel')}: <span dir="ltr" className="font-semibold">{account.username}</span>
                </span>
              </div>
              <div className="text-muted text-[12px] mt-1.5">
                {account.last_login_at
                  ? t('portal.accountLastLogin', { value: formatDateTimeAr(account.last_login_at) })
                  : t('portal.accountNeverLoggedIn')}
              </div>
              <div className="flex gap-2 mt-2.5 flex-wrap">
                <Button
                  variant="soft"
                  size="sm"
                  disabled={setActive.isPending}
                  onClick={() =>
                    setActive.mutate(
                      { accountId: account.id, active: !account.is_active },
                      { onError: () => toast(t('portal.accountErrorGeneric'), 'error') },
                    )
                  }
                >
                  {account.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                  {account.is_active ? t('portal.accountDisable') : t('portal.accountEnable')}
                </Button>
                <Button
                  variant="soft"
                  size="sm"
                  disabled={revokeSessions.isPending}
                  onClick={() =>
                    revokeSessions.mutate(account.id, {
                      onSuccess: () => toast(t('portal.accountSessionsRevokedToast')),
                      onError: () => toast(t('portal.accountErrorGeneric'), 'error'),
                    })
                  }
                >
                  <LogOut size={16} />
                  {t('portal.accountRevokeSessions')}
                </Button>
              </div>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (problem || !password) return
              upsert.mutate(
                { role, targetId, password },
                {
                  onSuccess: (res) => {
                    setJustSet({ username: res.username, password })
                    setPassword('')
                  },
                  onError: () => toast(t('portal.accountErrorGeneric'), 'error'),
                },
              )
            }}
          >
            <Field label={t('portal.accountPasswordLabel')}>
              <TextInput
                type="text"
                autoComplete="off"
                dir="ltr"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setJustSet(null)
                }}
                placeholder={usernameHint ? t('portal.accountPasswordForHint', { username: usernameHint }) : undefined}
              />
            </Field>
            {problem && <FormError message={t('portal.accountPasswordProblem')} />}
            <Button full type="submit" disabled={upsert.isPending || !password || Boolean(problem)}>
              <KeyRound size={18} />
              {upsert.isPending
                ? t('portal.accountSaving')
                : account
                  ? t('portal.accountResetPassword')
                  : t('portal.accountSetPassword')}
            </Button>
          </form>

          {justSet && (
            <div className="rounded-xl border border-ok/40 bg-ok/5 p-3 mt-3">
              <div className="font-bold text-[13.5px] mb-1.5 flex items-center gap-1.5">
                <Check size={18} className="text-ok-text" /> {t('portal.accountSavedTitle')}
              </div>
              <p className="text-[13.5px] mt-0">
                {t('portal.accountUsernameLabel')}: <span dir="ltr" className="font-semibold">{justSet.username}</span>
              </p>
              <p className="text-muted text-[12px] mt-1 mb-0">{t('portal.accountSavedNote')}</p>
              {waUrl && (
                <a href={waUrl} target="_blank" rel="noreferrer" className="no-underline inline-block mt-2.5">
                  <Button>
                    <MessageCircle size={20} />
                    {t('portal.accountSendWhatsapp')}
                  </Button>
                </a>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// جهة البوابة العامة: نموذج الدخول الحقيقي (اسم دخول + كلمة سر).
// النجاح يحفظ توكن الجلسة على هذا المتصفح ويُعلم الصفحة بالنتيجة.
// ---------------------------------------------------------------------------

export function PortalLoginForm({
  role,
  usernameLabel,
  usernamePlaceholder,
  onLoggedIn,
}: {
  role: PortalAccountRole
  usernameLabel: string
  usernamePlaceholder: string
  onLoggedIn: (result: PortalLoginResult) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (pending) return
        setPending(true)
        setError(null)
        portalLogin(username.trim(), password)
          .then((res) => {
            savePortalSessionToken(role, res.session_token)
            onLoggedIn(res)
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err ?? '')
            if (msg.includes('invalid credentials')) setError(t('portal.loginInvalidError'))
            else if (msg.includes('multiple accounts match')) setError(t('portal.loginMultipleError'))
            else setError(t('portal.loginGenericError'))
          })
          .finally(() => setPending(false))
      }}
    >
      <Field label={usernameLabel}>
        <TextInput
          dir="ltr"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={usernamePlaceholder}
          required
        />
      </Field>
      <Field label={t('portal.loginPassword')}>
        <TextInput
          type="password"
          autoComplete="current-password"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      {error && <FormError message={error} />}
      <Button full type="submit" disabled={pending || !username.trim() || !password}>
        <LogIn size={18} />
        {pending ? t('portal.loginLoggingIn') : t('portal.loginSubmit')}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// جهة البوابة العامة: بطاقة «عيّن كلمة سر» لمن وصل برابط صالح — بعدها
// يدخل باسم الدخول وكلمة السر بدل الرابط. دالة الإنشاء تُمرَّر من
// الصفحة (تختلف الـ RPC بين البوابتين) وتعيد اسم الدخول المشتق.
// ---------------------------------------------------------------------------

export function ClaimPasswordCard({
  claim,
}: {
  claim: (password: string) => Promise<{ username: string }>
}) {
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const [doneUsername, setDoneUsername] = useState<string | null>(null)
  const problem = password ? portalPasswordProblem(password) : null

  if (doneUsername) {
    return (
      <div className="rounded-xl border border-ok/40 bg-ok/5 p-3">
        <div className="font-bold text-[13.5px] flex items-center gap-1.5">
          <Check size={18} className="text-ok-text" /> {t('portal.claimDoneTitle')}
        </div>
        <p className="text-[13.5px] mt-1 mb-0">
          {t('portal.claimDone', { username: doneUsername })}
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (pending || problem || !password) return
        setPending(true)
        setError(false)
        claim(password)
          .then((res) => setDoneUsername(res.username))
          .catch(() => setError(true))
          .finally(() => setPending(false))
      }}
    >
      <div className="font-bold text-[15px] mb-1 flex items-center gap-2">
        <KeyRound size={20} className="text-primary" /> {t('portal.claimTitle')}
      </div>
      <p className="text-muted text-[13.5px] mt-0">{t('portal.claimIntro')}</p>
      <Field label={t('portal.claimPasswordLabel')}>
        <TextInput
          type="text"
          autoComplete="off"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {problem && <FormError message={t('portal.accountPasswordProblem')} />}
      {error && <FormError message={t('portal.claimError')} />}
      <Button full type="submit" disabled={pending || !password || Boolean(problem)}>
        {pending ? t('portal.claimSaving') : t('portal.claimSubmit')}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// جهة البوابة العامة: بطاقة الجلسة — تغيير كلمة السر وخروج (يبطل
// الجلسة خادمياً ويمسح التوكن من هذا المتصفح).
// ---------------------------------------------------------------------------

export function SessionAccountCard({
  role,
  sessionToken,
  onLoggedOut,
}: {
  role: PortalAccountRole
  sessionToken: string
  onLoggedOut: () => void
}) {
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pending, setPending] = useState(false)
  const [changed, setChanged] = useState(false)
  const [error, setError] = useState(false)
  const problem = newPw ? portalPasswordProblem(newPw) : null

  return (
    <div>
      <div className="font-bold text-[15px] mb-1 flex items-center gap-2">
        <KeyRound size={20} className="text-primary" /> {t('portal.sessionTitle')}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (pending || problem || !oldPw || !newPw) return
          setPending(true)
          setError(false)
          setChanged(false)
          portalChangePassword(sessionToken, oldPw, newPw)
            .then(() => {
              setChanged(true)
              setOldPw('')
              setNewPw('')
            })
            .catch(() => setError(true))
            .finally(() => setPending(false))
        }}
      >
        <Field label={t('portal.sessionOldPw')}>
          <TextInput
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
          />
        </Field>
        <Field label={t('portal.sessionNewPw')}>
          <TextInput
            type="text"
            autoComplete="off"
            dir="ltr"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
        </Field>
        {problem && <FormError message={t('portal.accountPasswordProblem')} />}
        {error && <FormError message={t('portal.sessionChangeError')} />}
        {changed && (
          <p className="flex items-start gap-2 bg-ok-soft text-ok-text text-[13.5px] font-semibold rounded-xl px-3 py-2.5 mb-3 mt-0" role="status">
            <Check size={18} className="shrink-0 mt-0.5" />
            <span>{t('portal.sessionChanged')}</span>
          </p>
        )}
        <Button full type="submit" disabled={pending || !oldPw || !newPw || Boolean(problem)}>
          {pending ? t('portal.sessionChanging') : t('portal.sessionChangeSubmit')}
        </Button>
      </form>
      <Button
        full
        variant="soft"
        className="mt-2"
        onClick={() => {
          void portalLogout(sessionToken)
          clearPortalSessionToken(role)
          onLoggedOut()
        }}
      >
        <LogOut size={18} />
        {t('portal.sessionLogout')}
      </Button>
    </div>
  )
}
