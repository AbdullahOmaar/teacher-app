import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  ImagePlus,
  Link2,
  Link2Off,
  NotebookPen,
  NotebookText,
  Send,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/toast'
import { Button } from '../../components/ui/Button'
import { Chip, ChipRow, Field, FormError, TextInput } from '../../components/ui/form'
import { SkeletonCards } from '../../components/ui/states'
import type { IconComponent } from '../../components/ui/EmptyState'
import { daysLabel, formatClock12, formatMoney, formatTime12, safeExternalUrl } from '../../lib/format'
import type { PaymentMethod } from '../../types/database'
import { fmtScore, pctOf } from '../grades/api'
import { PAYMENT_METHOD_LABELS } from '../invoices/api'
import {
  PORTAL_ATT_META,
  PROOF_METHODS,
  fetchGuardianPushStatus,
  portalErrorInfo,
  portalNotifMeta,
  portalProofStatusMeta,
  subscribeGuardianPush,
  unsubscribeGuardianPush,
  type PortalBrand,
} from './api'
import { PortalPushToggle, type PortalPushAdapter } from '../../components/PortalPushToggle'
import { Mascot } from '../../components/mascot/Mascot'
import { PublicPageShell } from '../../components/PublicPageShell'
import { t } from '../../i18n'
import {
  clearPortalSessionToken,
  loadPortalSessionToken,
  portalClaimGuardian,
  portalSessionStudents,
  resolveClaimOutcome,
  savePortalSessionToken,
  type PortalSessionInfo,
} from './accounts'
import { ClaimPasswordCard, PortalLoginForm, SessionAccountCard } from './accessUi'
import {
  PORTAL,
  useMarkPortalNotificationsRead,
  usePortalNotifications,
  usePortalOverview,
  usePortalProofs,
  useSubmitPortalProof,
} from './hooks'

/**
 * بوابة ولي الأمر العامة — الخطوة 9 (المواصفات §3.17).
 *
 * صفحة عامة بلا جلسة مدرس وبلا AppShell: الرابط الموقّع هو الاعتماد
 * الوحيد — /portal?student=<uuid>&t=<rawToken> (ويُقبل أيضاً
 * /portal/<uuid>?t=). التحقق والعرض كله عبر RPC واحدة مقيدة الحقول
 * (portal_overview_by_token) بالـ anon key؛ لا قراءة مباشرة لأي جدول.
 *
 * العرض محدود كما في §3.17 وكما يعيده الـ RPC حرفياً: اسم الطالب
 * وكوده وصفه، نسبة الحضور، الموقف المالي (مستحق/مسدد)، مواعيد
 * مجموعاته وروابط ملازمها، آخر الدرجات، ملاحظات المدرس، وآخر
 * 10 حصص حضور — لا شيء beyond ذلك.
 */

function PortalShell({
  children,
  brand,
}: {
  children: React.ReactNode
  /** الهوية البيضاء (0008) — تُمرَّر بعد تحميل العرض فقط؛ غيابها = الشكل الافتراضي */
  brand?: PortalBrand | null
}) {
  // (COD-5: الصدفة نفسها مشتركة في PublicPageShell — الفروق المحفوظة
  // هنا: عنوان السقوط وsubtitle البوابة ودُفّي ضيفاً في الرأس.)
  return (
    <PublicPageShell
      brand={brand}
      logoAlt={t('portal.pageLogoAlt')}
      fallbackTitle={t('portal.pageShellFallbackTitle')}
      subtitle={brand?.name ? t('portal.pageShellSubtitle') : null}
      headerExtra={
        brand ? (
          <Mascot
            state="welcome"
            size={30}
            visibleOverride={brand.show_mascot}
            className="ms-auto shrink-0"
          />
        ) : undefined
      }
    >
      {children}
    </PublicPageShell>
  )
}

/**
 * بطاقة فراغ داخل البوابة (خطة الهوية P-10): دُفّي بوضع empty صغيراً
 * بجانب النص الوظيفي القائم كما هو — بلا أي سطر ناطق جديد (صوت دُفّي
 * من §٨ حصراً ولا سطر بوابات فيها). عند إيقاف مدرس السنتر يختفي
 * دُفّي وحده وتبقى البطاقة بنصها الأصلي حرفياً.
 */
function PortalEmptyNote({ text, showMascot }: { text: string; showMascot: boolean }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <Mascot state="empty" size={40} visibleOverride={showMascot} className="shrink-0" />
        <p className="text-muted text-[13.5px] mb-0">{text}</p>
      </div>
    </Card>
  )
}

function PortalMessage({
  icon: Icon,
  title,
  hint,
  extra,
}: {
  icon: IconComponent
  title: string
  hint: string
  /** محتوى إضافي تحت بطاقة الرسالة (نموذج الدخول عند موت الرابط) */
  extra?: React.ReactNode
}) {
  return (
    <PortalShell>
      <Card className="text-center py-8">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
          <Icon size={28} />
        </div>
        <div className="type-section mb-1">{title}</div>
        <p className="text-muted type-secondary mb-0">{hint}</p>
      </Card>
      {extra}
    </PortalShell>
  )
}

function SectionTitle({ icon: Icon, children }: { icon: IconComponent; children: React.ReactNode }) {
  return (
    <h3 className="type-section mt-5 mb-2 first:mt-0 flex items-center gap-2">
      <Icon size={22} className="text-primary" />
      {children}
    </h3>
  )
}

/**
 * قسم «إثبات دفع» (Phase 2 خطوة 7): ولي الأمر يرفع لقطة التحويل من نفس
 * جلسة توكن البوابة — الصفحة مرتبطة بطالب واحد (طالب الرابط) فالإثبات
 * له حصراً. الإرسال عبر submitPaymentProof (RPC إنشاء بالتوكن ← رفع
 * لStorage خاص ← RPC تأكيد)، وتحت النموذج تظهر إثباتاته السابقة
 * بحالاتها: قيد مراجعة المدرس / معتمد / مرفوض مع السبب.
 */
function PaymentProofSection({
  studentId,
  rawToken,
  balance,
}: {
  studentId: string
  rawToken: string
  balance: number
}) {
  const proofsQ = usePortalProofs(studentId, rawToken)
  const submit = useSubmitPortalProof(studentId, rawToken)

  const [amount, setAmount] = useState(() => (balance > 0 ? String(balance) : ''))
  const [method, setMethod] = useState<PaymentMethod>('vodafone_cash')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const amt = parseFloat(amount) || 0
  const proofs = proofsQ.data ?? []

  return (
    <>
      <SectionTitle icon={Send}>{t('portal.pageProofTitle')}</SectionTitle>
      <Card>
        <p className="text-muted text-[13.5px] mt-0">
          {t('portal.pageProofIntro')}
        </p>

        {sent && (
          <p className="flex items-start gap-2 bg-ok-soft text-ok-text text-[13.5px] font-semibold rounded-xl px-3 py-2.5 mb-3 mt-0" role="status">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            <span>{t('portal.pageProofSent')}</span>
          </p>
        )}

        <form noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (!file) return
            submit.mutate(
              { amount: amt, method, file },
              {
                onSuccess: () => {
                  setSent(true)
                  setFile(null)
                  setPreviewUrl(null)
                },
              },
            )
          }}
        >
          <Field label={t('portal.pageProofAmountLabel')}>
            <TextInput
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t('portal.pageProofAmountPlaceholder')}
            />
          </Field>

          <div className="block mb-3">
            <span className="block text-[13.5px] leading-[1.7] text-muted font-semibold mb-1">
              {t('portal.pageProofMethodLabel')}
            </span>
            <ChipRow>
              {PROOF_METHODS.map((m) => (
                <Chip key={m.code} active={method === m.code} onClick={() => setMethod(m.code)}>
                  {m.label}
                </Chip>
              ))}
            </ChipRow>
          </div>

          <div className="block mb-3">
            <span className="block text-[13.5px] leading-[1.7] text-muted font-semibold mb-1">
              {t('portal.pageProofFileLabel')}
            </span>
            <label className="flex items-center justify-center gap-2 min-h-[52px] rounded-xl border border-dashed border-border bg-bg px-3 cursor-pointer text-[15px] font-semibold text-primary">
              <ImagePlus size={20} />
              {file ? file.name : t('portal.pageProofChooseFile')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setFile(f)
                  setSent(false)
                  setPreviewUrl(f ? URL.createObjectURL(f) : null)
                }}
              />
            </label>
            {previewUrl && (
              <img
                src={previewUrl}
                alt={t('portal.pageProofPreviewAlt')}
                className="w-full max-h-[260px] object-contain rounded-xl border border-border bg-bg mt-2"
              />
            )}
          </div>

          {submit.isError && (
            <FormError message={submit.error instanceof Error ? submit.error.message : t('portal.pageUnexpectedError')} />
          )}

          <Button full type="submit" disabled={submit.isPending || !file || !(amt > 0)}>
            <Send size={18} />
            {submit.isPending ? t('portal.pageProofSending') : t('portal.pageProofSubmit')}
          </Button>
        </form>
      </Card>

      {proofs.length > 0 && (
        <Card className="p-0 overflow-hidden mt-3">
          {proofs.map((p, i) => {
            const meta = portalProofStatusMeta(p.status)
            return (
              <div
                key={p.id}
                className={`px-[14px] py-2.5 ${i < proofs.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[15px]">
                      {formatMoney(p.amount)} · {PAYMENT_METHOD_LABELS[p.method]}
                    </div>
                    <div className="text-muted text-[12px]">{p.created_at.slice(0, 10)}</div>
                  </div>
                  <span className={`text-[12px] font-bold border rounded-full px-2.5 py-1 ${meta.badge}`}>
                    {meta.label}
                  </span>
                </div>
                {p.status === 'rejected' && p.rejection_reason && (
                  <p className="text-bad-text text-[13.5px] mt-1 mb-0">{t('portal.pageProofRejectionReason', { reason: p.rejection_reason })}</p>
                )}
              </div>
            )
          })}
        </Card>
      )}
    </>
  )
}

/** وقت حدث التنبيه (ISO) بصيغة ساعة مقروءة — التاريخ يأتي من الحصة نفسها */
function fmtEventTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return formatClock12(d)
}

/**
 * قسم «تنبيهات ولي الأمر» (Phase 3 خطوة 6 + 0050): صندوق ولي الأمر
 * داخل البوابة نفسها — تنبيه «وصل» يتولد عند أول تسجيل حضور للطالب في
 * الحصة و«غادر» عند تسجيل انصرافه، ويُقرأ عبر RPC بالتوكن مقيداً بهذا
 * الطالب فقط، مع عدّاد غير مقروء وزر تعليم الكل كمقروء (RPC كتابة
 * مقيدة بالتوكن تضبط read_at فقط). ومن Phase 4 خطوة 2 يصل نفس الحدث
 * أيضاً كـ Push فوري لاشتراكات البوابة النشطة (مشغّل خادمي على توليد
 * التنبيه نفسه في 0014) — الصندوق هنا يبقى سجل القراءة الدائم.
 */
function NotificationsSection({
  studentId,
  rawToken,
}: {
  studentId: string
  rawToken: string
}) {
  const notifQ = usePortalNotifications(studentId, rawToken)
  const markRead = useMarkPortalNotificationsRead(studentId, rawToken)
  const toast = useToast()
  const notifications = notifQ.data?.notifications ?? []
  const unread = notifQ.data?.unread_count ?? 0

  return (
    <>
      <SectionTitle icon={Bell}>
        {t('portal.pageNotifTitle')}
        {unread > 0 && (
          <span className="text-[12px] font-extrabold bg-bad text-white rounded-full px-2 py-0.5">
            {t('portal.pageNotifNewBadge', { count: unread })}
          </span>
        )}
      </SectionTitle>
      {notifQ.isPending ? (
        <Card>
          <p className="text-muted text-[13.5px] mb-0">{t('portal.pageNotifLoading')}</p>
        </Card>
      ) : notifQ.isError ? (
        <Card>
          <p className="text-muted text-[13.5px] mb-0">
            {t('portal.pageNotifError')}
          </p>
        </Card>
      ) : notifications.length === 0 ? (
        <Card>
          <p className="text-muted text-[13.5px] mb-0">
            {t('portal.pageNotifEmpty')}
          </p>
        </Card>
      ) : (
        <>
          <Card className="p-0 overflow-hidden">
            {notifications.map((n, i) => {
              const meta = portalNotifMeta(n.kind)
              const isUnread = !n.read_at
              return (
                <div
                  key={n.id}
                  className={`flex items-center gap-3 px-[14px] py-2.5 ${
                    i < notifications.length - 1 ? 'border-b border-border' : ''
                  } ${isUnread ? 'bg-soft/60' : ''}`}
                >
                  <span
                    className={`text-[12px] font-bold border rounded-full px-2.5 py-1 shrink-0 ${meta.badge}`}
                  >
                    {meta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[15px] break-words">{n.group_name ?? ''}</div>
                    <div className="text-muted text-[12px]">
                      {n.kind === 'invoice_issued'
                        ? t('portal.pageNotifInvoiceLine', {
                            period: n.invoice_period ?? '',
                            total: formatMoney(n.invoice_total),
                            balance: formatMoney(n.invoice_balance),
                          })
                        : t('portal.pageNotifSessionLine', {
                            date: n.session_date ?? '',
                            time: fmtEventTime(n.event_at),
                          })}
                    </div>
                  </div>
                  {isUnread && (
                    <span className="w-2.5 h-2.5 rounded-full bg-bad shrink-0" aria-label={t('portal.pageNotifUnreadAria')} />
                  )}
                </div>
              )
            })}
          </Card>
          {unread > 0 && (
            <Button
              variant="soft"
              className="mt-2 min-h-[48px] text-[13.5px] px-3"
              disabled={markRead.isPending}
              onClick={() =>
                markRead.mutate(undefined, {
                  onError: () => toast(t('portal.pageNotifMarkReadErrorToast'), 'error'),
                })
              }
            >
              <Check size={18} />
              {markRead.isPending ? t('portal.pageNotifMarking') : t('portal.pageNotifMarkAllRead')}
            </Button>
          )}
        </>
      )}
    </>
  )
}

export function PortalPage() {
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlStudentId = params.studentId ?? searchParams.get('student')
  const urlToken = searchParams.get('t') ?? searchParams.get('token')

  // اعتماد الوصول (3A-385): رابط موقّع من الـ URL كما كان دائماً، أو
  // جلسة حساب محفوظة على هذا المتصفح بعد دخول حقيقي — الخادم يقبل
  // الاثنين بنفس فحوص الارتباط والصلاحية (هجرة 0042)، فكل الاستعلامات
  // أسفله تعمل بأيٍّ منهما دون تمييز.
  const [session, setSession] = useState<{ token: string; info: PortalSessionInfo } | null>(null)
  const [pickedStudentId, setPickedStudentId] = useState<string | null>(null)
  // claim تم للتو في هذه الزيارة — لعرض تأكيد ما بعد الـ claim، مع
  // ما إذا أُبطل الرابط (0056) أم ما زال صالحاً (إجابة 0044 القديمة)
  const [justClaimed, setJustClaimed] = useState<{
    username: string
    linkClosed: boolean
  } | null>(null)
  // توكن الجلسة المحفوظ يُقرأ مرة واحدة عند التحميل (مبادرة كسولة)،
  // والتحقق منه خادمياً غير متزامن فقط — لا setState متزامناً داخل effect
  const [savedToken] = useState(() => (urlToken ? null : loadPortalSessionToken('guardian')))
  const [sessionChecked, setSessionChecked] = useState(Boolean(urlToken) || savedToken === null)

  useEffect(() => {
    if (!savedToken) return
    let alive = true
    portalSessionStudents(savedToken)
      .then((info) => {
        if (!alive) return
        if (info.role === 'guardian') setSession({ token: savedToken, info })
        else clearPortalSessionToken('guardian')
      })
      .catch(() => {
        if (alive) clearPortalSessionToken('guardian')
      })
      .finally(() => {
        if (alive) setSessionChecked(true)
      })
    return () => {
      alive = false
    }
  }, [savedToken])

  const sessionStudents = session?.info.students ?? []
  const studentId =
    urlStudentId ??
    pickedStudentId ??
    (sessionStudents.length === 1 ? sessionStudents[0].id : null)
  const rawToken = urlToken ?? session?.token ?? null

  // مفاتيح كاش البوابة بلا الاعتماد فيها (قاعدة قديمة: الرمز لا يدخل
  // المفتاح) — عند تبديل الاعتماد (دخول/خروج) نمسحها حتى لا يرى
  // حسابٌ بياناتِ حساب آخر من نفس المتصفح داخل نافذة الكاش.
  const qc = useQueryClient()
  const clearCredentialCaches = () => {
    void qc.removeQueries({ queryKey: [PORTAL, 'overview'] })
    void qc.removeQueries({ queryKey: [PORTAL, 'proofs'] })
    void qc.removeQueries({ queryKey: [PORTAL, 'notifications'] })
  }

  // بعد claim ناجح (0056): الرابط المستعمل أُبطل خادمياً والجلسة هي
  // الاعتماد من الآن — حذف التوكن من الرابط يجعل rawToken يسقط على
  // الجلسة، ويمنع إعادة مشاركة رابط ميت.
  const stripUrlToken = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('t')
        next.delete('token')
        return next
      },
      { replace: true },
    )
  }

  const overviewQ = usePortalOverview(studentId, rawToken)

  // بطاقة الدخول باسم الدخول وكلمة السر — تظهر عند فتح البوابة من غير
  // رابط، وتحت رسالة «الرابط غير صالح» أيضاً (لمن لا جلسة له) حتى لا
  // يكون الرابط الميت طريقاً مسدوداً لمن عنده حساب.
  const loginCard = (
    <Card>
      <div className="type-section mb-1">{t('portal.loginTitle')}</div>
      <p className="text-muted text-[13.5px] mt-0">{t('portal.loginIntro')}</p>
      <PortalLoginForm
        role="guardian"
        usernameLabel={t('portal.loginUsernameGuardian')}
        usernamePlaceholder={t('portal.loginUsernameGuardianPlaceholder')}
        onLoggedIn={(res) => {
          clearCredentialCaches()
          setSession({ token: res.session_token, info: res })
        }}
      />
    </Card>
  )

  if (urlToken && !urlStudentId) {
    return (
      <PortalMessage
        icon={Link2Off}
        title={t('portal.pageIncompleteLinkTitle')}
        hint={t('portal.pageIncompleteLinkHint')}
      />
    )
  }

  if (!urlToken && !sessionChecked) {
    return (
      <PortalShell>
        <SkeletonCards cards={3} />
      </PortalShell>
    )
  }

  if (!urlToken && !session) {
    return <PortalShell>{loginCard}</PortalShell>
  }

  if (session && sessionStudents.length === 0) {
    return (
      <PortalMessage icon={Link2Off} title={t('portal.loginTitle')} hint={t('portal.sessionNoStudents')} />
    )
  }

  if (!studentId || !rawToken) {
    // جلسة ولي أمر له أكثر من ابن بلا اختيار بعد — منتقي الطالب
    return (
      <PortalShell>
        <Card>
          <div className="type-section mb-2">{t('portal.pickerTitle')}</div>
          {sessionStudents.map((s) => (
            <Button
              key={s.id}
              full
              variant="soft"
              className="mb-2"
              onClick={() => setPickedStudentId(s.id)}
            >
              {s.name}
            </Button>
          ))}
        </Card>
      </PortalShell>
    )
  }

  if (overviewQ.isPending) {
    return (
      <PortalShell>
        <SkeletonCards cards={3} />
      </PortalShell>
    )
  }

  if (overviewQ.isError || !overviewQ.data) {
    const info = portalErrorInfo(overviewQ.error)
    // نموذج الدخول يظهر تحت الرسالة عند موت الاعتماد فقط ولمن لا جلسة
    // له — أخطاء الشبكة العابرة تبقى رسالة بلا نموذج. رسالة الخطأ تُقرأ
    // من خاصية message مباشرة: أخطاء PostgREST كائنات عادية لا مثيلات
    // Error فـ instanceof لا يكفي.
    const errMsg =
      (overviewQ.error as { message?: string } | null)?.message ?? String(overviewQ.error ?? '')
    const credentialDead =
      errMsg.includes('invalid or expired') ||
      errMsg.includes('not authorized') ||
      errMsg.includes('token not valid')
    return (
      <PortalMessage
        icon={Clock}
        title={info.title}
        hint={info.hint}
        extra={!session && credentialDead ? loginCard : undefined}
      />
    )
  }

  const o = overviewQ.data
  const rate = o.attendance_rate

  // محوّل Push لبوابة ولي الأمر (Phase 4 خطوة 2): الحفظ/الإيقاف/الحالة
  // عبر RPC بالتوكن تربط الاشتراك بهذا الطالب وبوليّ أمره — يُبنى من
  // معالم الرابط مباشرة فلا يدخل أي كاش استعلامات.
  const pushAdapter: PortalPushAdapter = {
    status: (endpoint) => fetchGuardianPushStatus(rawToken, studentId, endpoint),
    subscribe: (keys) => subscribeGuardianPush(rawToken, studentId, keys),
    unsubscribe: (endpoint) => unsubscribeGuardianPush(rawToken, studentId, endpoint),
  }

  return (
    <PortalShell brand={o.brand}>
      {/* البانر: الاسم + KPI الحضور + KPI الموقف المالي (§3.17) */}
      <Card className="rise-in">
        <div className="text-[19px] font-extrabold leading-[1.7]">{o.student.name}</div>
        <div className="text-muted text-[13.5px] mt-0.5">
          {t('portal.pageCodeLabel')} <span dir="ltr">{o.student.code}</span>
          {o.student.grade ? t('portal.pageGradePart', { grade: o.student.grade }) : ''}
        </div>
        {(o.sections.attendance || o.sections.money) && (
          <div
            className={`grid gap-2 mt-3 ${o.sections.attendance && o.sections.money ? 'grid-cols-2' : 'grid-cols-1'}`}
          >
            {o.sections.attendance && (
              <div className="rounded-xl border border-border bg-bg p-3 text-center">
                <div className="text-muted text-[12px] font-semibold mb-0.5">{t('portal.pageAttendanceRateLabel')}</div>
                {rate == null ? (
                  <div className="text-[15px] font-bold text-muted">{t('portal.pageNoSessionsYet')}</div>
                ) : (
                  <div className={`text-[20px] font-extrabold ${rate >= 80 ? 'text-ok-text' : 'text-warn-text'}`}>
                    {rate}%
                  </div>
                )}
              </div>
            )}
            {o.sections.money && (
              <div className="rounded-xl border border-border bg-bg p-3 text-center">
                <div className="text-muted text-[12px] font-semibold mb-0.5">{t('portal.pageBalanceLabel')}</div>
                {o.balance > 0 ? (
                  <div className="text-[20px] font-extrabold text-bad-text">{formatMoney(o.balance)}</div>
                ) : (
                  <div className="text-[20px] font-extrabold text-ok-text flex items-center justify-center gap-1.5">{t('portal.pagePaid')} <Check size={22} /></div>
                )}
              </div>
            )}
          </div>
        )}
        {o.sections.money && o.balance > 0 && (
          <p className="text-muted text-[12px] mt-2 mb-0">
            {t('portal.pageBalanceNote')}
          </p>
        )}
      </Card>

      {/* تبديل بين الأبناء لولي أمر دخل بحسابه (3A-385) */}
      {session && sessionStudents.length > 1 && (
        <div className="mt-3">
          <ChipRow>
            {sessionStudents.map((s) => (
              <Chip key={s.id} active={s.id === studentId} onClick={() => setPickedStudentId(s.id)}>
                {s.name}
              </Chip>
            ))}
          </ChipRow>
        </div>
      )}

      {/* إشعارات Push الفورية — اشتراك اختياري من البوابة (Phase 4 خطوة 2)؛
          محورها الحضور فتختفي مع إخفاء المدرس لقسم الحضور (3A-385) */}
      {o.sections.attendance && (
        <div className="rise-in" style={{ animationDelay: '50ms' }}>
          <PortalPushToggle adapter={pushAdapter} />
        </div>
      )}

      {/* تنبيهات ولي الأمر — صندوق ولي الأمر (خطوة 6، Phase 3 + 0050) */}
      {o.sections.attendance && (
        <div className="rise-in mt-5" style={{ animationDelay: '90ms' }}>
          <NotificationsSection studentId={studentId} rawToken={rawToken} />
        </div>
      )}

      {/* إثبات دفع — رفع لقطة تحويل ومراجعة المدرس (خطوة 7) */}
      {o.sections.money && (
        <PaymentProofSection studentId={studentId} rawToken={rawToken} balance={o.balance} />
      )}

      {/* مواعيد الحصص — قسم المجموعات (3A-385) */}
      {o.sections.groups && (
        <>
          <SectionTitle icon={CalendarDays}>{t('portal.pageScheduleTitle')}</SectionTitle>
          {o.groups.length === 0 ? (
        <PortalEmptyNote text={t('portal.pageNotEnrolled')} showMascot={o.brand.show_mascot} />
      ) : (
        o.groups.map((g) => (
          <Card key={g.name}>
            <div className="font-bold text-[15px]">{g.name}</div>
            <div className="text-muted text-[13.5px] mt-0.5">
              {t('portal.pageGroupSchedule', { days: daysLabel(g.days), time: formatTime12(g.start_time) })}
              {g.room ? t('portal.pageGroupRoom', { room: g.room }) : ''}
            </div>
            {g.links.some((link) => safeExternalUrl(link) !== null) && (
              <div className="flex flex-wrap gap-2 mt-2">
                {g.links.map((link) => {
                  const href = safeExternalUrl(link)
                  if (href === null) return null
                  return (
                    <a
                      key={link}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 min-h-[48px] text-[13.5px] font-semibold bg-soft text-primary rounded-full px-3 no-underline max-w-full"
                      dir="ltr"
                    >
                      <Link2 size={16} className="shrink-0" />
                      {/* استثناء موثّق (3A-331 عائلة ب): سطر عرض الـURL نفسه يبقى قاصّاً —
                          الرابط قيمة تقنية لا عنوان، وقصّه لا يخفي معلومة مقروءة */}
                      <span className="truncate">{link}</span>
                    </a>
                  )
                })}
              </div>
            )}
          </Card>
        ))
      )}
        </>
      )}

      {/* آخر الدرجات — قسم الدرجات (3A-385) */}
      {o.sections.scores && (
        <>
          <SectionTitle icon={NotebookPen}>{t('portal.pageScoresTitle')}</SectionTitle>
          {o.latest_scores.length === 0 ? (
        <PortalEmptyNote text={t('portal.pageNoScores')} showMascot={o.brand.show_mascot} />
      ) : (
        <Card className="p-0 overflow-hidden">
          {o.latest_scores.map((s, i) => {
            const pct = pctOf(s.score, s.max_score)
            return (
              <div
                key={`${s.title}-${s.date}-${i}`}
                className={`flex items-center gap-3 px-[14px] py-2.5 ${i < o.latest_scores.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] break-words">{s.title}</div>
                  <div className="text-muted text-[12px]">{s.date}</div>
                </div>
                <div className="text-[13.5px] font-semibold whitespace-nowrap">
                  {t('portal.pageScoreOf', { score: fmtScore(s.score), max: fmtScore(s.max_score) })}
                </div>
                {pct != null && (
                  <span
                    className={`min-w-[48px] text-center text-[12px] font-extrabold rounded-full px-2 py-1 text-white ${pct >= 50 ? 'bg-ok-text' : 'bg-bad-text'}`}
                  >
                    {pct}%
                  </span>
                )}
              </div>
            )
          })}
        </Card>
          )}
        </>
      )}

      {/* ملاحظات المدرس — قسم الملاحظات (3A-385) */}
      {o.sections.notes && o.notes.length > 0 && (
        <>
          <SectionTitle icon={NotebookText}>{t('portal.pageNotesTitle')}</SectionTitle>
          <Card className="p-0 overflow-hidden">
            {o.notes.map((n, i) => (
              <div
                key={`${n.date}-${i}`}
                className={`px-[14px] py-2.5 ${i < o.notes.length - 1 ? 'border-b border-border' : ''}`}
              >
                <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
                  {n.date}
                </span>
                <p className="text-[15px] mt-1 mb-0">{n.text}</p>
              </div>
            ))}
          </Card>
        </>
      )}

      {/* سجل الحضور الأخير — قسم الحضور (3A-385) */}
      {o.sections.attendance && (
        <>
          <SectionTitle icon={CalendarCheck2}>{t('portal.pageAttendanceTitle')}</SectionTitle>
          {o.recent_attendance.length === 0 ? (
        <PortalEmptyNote text={t('portal.pageNoAttendance')} showMascot={o.brand.show_mascot} />
      ) : (
        <Card className="p-0 overflow-hidden">
          {o.recent_attendance.map((a, i) => {
            const meta = PORTAL_ATT_META[a.status] ?? { label: a.status, badge: 'bg-soft text-muted border-border' }
            return (
              <div
                key={`${a.date}-${a.group_name}-${i}`}
                className={`flex items-center gap-3 px-[14px] py-2.5 ${i < o.recent_attendance.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] break-words">{a.group_name}</div>
                  <div className="text-muted text-[12px]">{a.date}</div>
                </div>
                <span className={`text-[12px] font-bold border rounded-full px-2.5 py-1 ${meta.badge}`}>
                  {meta.label}
                </span>
              </div>
            )
          })}
        </Card>
          )}
        </>
      )}

      {/* بطاقة الحساب (3A-385 + 0056): الواصل برابط يعيّن كلمة سر
          للدخول الجاي — والـ claim يستهلك الرابط ويبدّل الاعتماد لجلسة
          الحساب فوراً — والداخل بجلسة يدير كلمة سره أو يخرج */}
      <div className="mt-5">
        {justClaimed && (
          <p
            className="flex items-start gap-2 bg-ok-soft text-ok-text text-[13.5px] font-semibold rounded-xl px-3 py-2.5 mb-3 mt-0"
            role="status"
          >
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            <span>
              {t('portal.claimDone', { username: justClaimed.username })}{' '}
              {justClaimed.linkClosed ? t('portal.claimLinkDone') : t('portal.claimLinkStillValid')}{' '}
              {t('portal.claimLoginAtLabel')}{' '}
              <span dir="ltr" className="font-semibold">
                {`${window.location.origin}/portal`}
              </span>
            </span>
          </p>
        )}
        <Card>
          {session ? (
            <SessionAccountCard
              role="guardian"
              sessionToken={session.token}
              onLoggedOut={() => {
                clearCredentialCaches()
                setSession(null)
                setPickedStudentId(null)
              }}
            />
          ) : (
            <ClaimPasswordCard
              loginPath="/portal"
              loginNameHint={t('portal.claimLoginNameHintGuardian')}
              claim={(pw) =>
                portalClaimGuardian(rawToken, studentId, pw).then((res) => {
                  const outcome = resolveClaimOutcome(res)
                  if (outcome.kind === 'legacy') {
                    // إجابة 0044 القديمة بلا جلسة (0056 غير مطبقة بعد):
                    // كلمة السر اتعيّنت، لكن الرابط يبقى صالحاً — لا
                    // نحفظ توكن ناقصاً ولا نحذف التوكن من الرابط ولا
                    // نبدّل الاعتماد.
                    setJustClaimed({ username: outcome.username, linkClosed: false })
                    return { username: outcome.username }
                  }
                  savePortalSessionToken('guardian', outcome.sessionToken)
                  clearCredentialCaches()
                  setSession({ token: outcome.sessionToken, info: res })
                  setJustClaimed({ username: outcome.username, linkClosed: true })
                  stripUrlToken()
                  return { username: outcome.username }
                })
              }
            />
          )}
        </Card>
      </div>

      <p className="text-center text-muted text-[12px] mt-5 mb-0">
        {t('portal.pageFooterNote')}
      </p>
    </PortalShell>
  )
}
