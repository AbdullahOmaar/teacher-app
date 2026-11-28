import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  BookOpenCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  GraduationCap,
  Link2,
  NotebookPen,
  ReceiptText,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { SkeletonCards } from '../../components/ui/states'
import type { IconComponent } from '../../components/ui/EmptyState'
import { daysLabel, formatMoney, formatTime12, safeExternalUrl } from '../../lib/format'
import { PublicPageShell } from '../../components/PublicPageShell'
import { fmtScore, pctOf, ASSESSMENT_TYPE_LABELS } from '../grades/api'
import { PAYMENT_METHOD_LABELS } from '../invoices/api'
import { formatDateLabel, formatDayMonth, periodLabel } from '../schedule/api'
import {
  STUDENT_PORTAL_ATT_META,
  fetchStudentPushStatus,
  studentPortalErrorInfo,
  subscribeStudentPush,
  unsubscribeStudentPush,
  type StudentPortalBrand,
} from './api'
import { PortalPushToggle, type PortalPushAdapter } from '../../components/PortalPushToggle'
import { Mascot } from '../../components/mascot/Mascot'
import {
  clearPortalSessionToken,
  loadPortalSessionToken,
  portalClaimStudent,
  portalSessionStudents,
  resolveClaimOutcome,
  savePortalSessionToken,
} from '../portal/accounts'
import { ClaimPasswordCard, PortalLoginForm, SessionAccountCard } from '../portal/accessUi'
import { STUDENT_PORTAL, useStudentPortalOverview } from './hooks'
import { t } from '../../i18n'

/**
 * بوابة الطالب العامة — Phase 3 خطوة 5 (migration ‏0011).
 *
 * صفحة عامة بلا جلسة مدرس وبلا AppShell: الرابط الموقّع هو الاعتماد
 * الوحيد — /student-portal?t=<rawToken>، والطالب يُعرَف من التوكن نفسه
 * فلا معرّف طالب في الرابط. التحقق والعرض كله عبر RPC واحدة قراءة فقط
 * ومقيدة الحقول (student_portal_overview_by_token) بالـ anon key؛ لا
 * قراءة مباشرة لأي جدول ولا أي عملية كتابة من هذه الصفحة إطلاقاً.
 *
 * الأقسام الأربعة كما في الخطة: حصص الطالب القادمة (ومواعيد مجموعاته)،
 * واجباته وحالتها، درجاته ونتائج امتحاناته الإلكترونية (بمصدرها)،
 * ومدفوعاته ورصيده — بيانات هذا الطالب فقط، بلا زملاء ولا بيانات ولي
 * أمر ولا مالية مدرس.
 */

function StudentPortalShell({
  children,
  brand,
}: {
  children: React.ReactNode
  brand?: StudentPortalBrand | null
}) {
  // (COD-5: الصدفة نفسها مشتركة في PublicPageShell — الفروق المحفوظة
  // هنا: عنوان السقوط، والعنوان الفرعي هو عنوان البوابة نفسه عند وجود
  // اسم سنتر، ودُفّي ضيفاً في الرأس.)
  return (
    <PublicPageShell
      brand={brand}
      logoAlt={t('studentPortal.pageCentreLogoAlt')}
      fallbackTitle={t('studentPortal.pageTitle')}
      subtitle={brand?.name ? t('studentPortal.pageTitle') : null}
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
function StudentPortalEmptyNote({ text, showMascot }: { text: string; showMascot: boolean }) {
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
    <StudentPortalShell>
      <Card className="text-center py-8">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
          <Icon size={28} />
        </div>
        <div className="type-section mb-1">{title}</div>
        <p className="text-muted type-secondary mb-0">{hint}</p>
      </Card>
      {extra}
    </StudentPortalShell>
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

export function StudentPortalPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlToken = searchParams.get('t') ?? searchParams.get('token')

  // اعتماد الوصول (3A-385): رابط موقّع من الـ URL كما كان دائماً، أو
  // جلسة حساب محفوظة على هذا المتصفح بعد دخول حقيقي بكود الطالب
  // وكلمة السر — الخادم يقبل الاثنين بنفس الفحوص (هجرة 0042).
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  // claim تم للتو في هذه الزيارة — لعرض تأكيد ما بعد الـ claim، مع
  // ما إذا أُبطل الرابط (0056) أم ما زال صالحاً (إجابة 0044 القديمة)
  const [justClaimed, setJustClaimed] = useState<{
    username: string
    linkClosed: boolean
  } | null>(null)
  // توكن الجلسة المحفوظ يُقرأ مرة واحدة عند التحميل (مبادرة كسولة)،
  // والتحقق منه خادمياً غير متزامن فقط — لا setState متزامناً داخل effect
  const [savedToken] = useState(() => (urlToken ? null : loadPortalSessionToken('student')))
  const [sessionChecked, setSessionChecked] = useState(Boolean(urlToken) || savedToken === null)

  useEffect(() => {
    if (!savedToken) return
    let alive = true
    portalSessionStudents(savedToken)
      .then((info) => {
        if (!alive) return
        if (info.role === 'student') setSessionToken(savedToken)
        else clearPortalSessionToken('student')
      })
      .catch(() => {
        if (alive) clearPortalSessionToken('student')
      })
      .finally(() => {
        if (alive) setSessionChecked(true)
      })
    return () => {
      alive = false
    }
  }, [savedToken])

  const rawToken = urlToken ?? sessionToken

  // مفتاح كاش العرض بلا الاعتماد فيه — عند تبديل الاعتماد نمسحه حتى
  // لا يرى طالبٌ عرضَ طالب آخر من نفس المتصفح داخل نافذة الكاش.
  const qc = useQueryClient()
  const clearCredentialCache = () => {
    void qc.removeQueries({ queryKey: [STUDENT_PORTAL, 'overview'] })
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

  const overviewQ = useStudentPortalOverview(rawToken)

  // بطاقة الدخول باسم الدخول وكلمة السر — تظهر عند فتح البوابة من غير
  // رابط، وتحت رسالة «الرابط غير صالح» أيضاً حتى لا يكون الرابط الميت
  // طريقاً مسدوداً لمن عنده حساب.
  const loginCard = (
    <Card>
      <div className="type-section mb-1">{t('portal.loginTitle')}</div>
      <p className="text-muted text-[13.5px] mt-0">{t('portal.loginIntro')}</p>
      <PortalLoginForm
        role="student"
        usernameLabel={t('studentPortal.loginUsernameCode')}
        usernamePlaceholder={t('studentPortal.loginUsernamePlaceholder')}
        onLoggedIn={(res) => {
          clearCredentialCache()
          setSessionToken(res.session_token)
        }}
      />
    </Card>
  )

  if (!urlToken && !sessionChecked) {
    return (
      <StudentPortalShell>
        <SkeletonCards cards={3} />
      </StudentPortalShell>
    )
  }

  if (!rawToken) {
    return <StudentPortalShell>{loginCard}</StudentPortalShell>
  }

  if (overviewQ.isPending) {
    return (
      <StudentPortalShell>
        <SkeletonCards cards={3} />
      </StudentPortalShell>
    )
  }

  if (overviewQ.isError || !overviewQ.data) {
    const info = studentPortalErrorInfo(overviewQ.error)
    // نموذج الدخول يظهر تحت الرسالة عند موت الاعتماد فقط (رابط/جلسة
    // غير صالحة) — أخطاء الشبكة العابرة تبقى رسالة بلا نموذج. رسالة
    // الخطأ تُقرأ من خاصية message مباشرة: أخطاء PostgREST كائنات
    // عادية لا مثيلات Error فـ instanceof لا يكفي.
    const errMsg =
      (overviewQ.error as { message?: string } | null)?.message ?? String(overviewQ.error ?? '')
    const credentialDead = errMsg.includes('invalid or expired')
    return (
      <PortalMessage
        icon={Clock}
        title={info.title}
        hint={info.hint}
        extra={credentialDead ? loginCard : undefined}
      />
    )
  }

  const o = overviewQ.data
  const rate = o.attendance_rate
  const hw = o.homework_summary

  // محوّل Push لبوابة الطالب (Phase 4 خطوة 2): الحفظ/الإيقاف/الحالة عبر
  // RPC بتوكن الطالب تربط الاشتراك بالطالب وبصف توكنه.
  const pushAdapter: PortalPushAdapter = {
    status: (endpoint) => fetchStudentPushStatus(rawToken, endpoint),
    subscribe: (keys) => subscribeStudentPush(rawToken, keys),
    unsubscribe: (endpoint) => unsubscribeStudentPush(rawToken, endpoint),
  }

  return (
    <StudentPortalShell brand={o.brand}>
      {/* البانر: الاسم + نسبة الحضور + الموقف المالي */}
      <Card className="rise-in">
        <div className="text-[19px] font-extrabold leading-[1.7] flex items-center gap-2">
          <GraduationCap size={24} className="text-primary shrink-0" />
          {o.student.name}
        </div>
        <div className="text-muted text-[13.5px] mt-0.5">
          {t('studentPortal.pageCodeLabel')} <span dir="ltr">{o.student.code}</span>
          {o.student.grade ? ` · ${o.student.grade}` : ''}
        </div>
        {(o.sections.homework || o.sections.money) && (
          <div
            className={`grid gap-2 mt-3 ${o.sections.homework && o.sections.money ? 'grid-cols-2' : 'grid-cols-1'}`}
          >
            {o.sections.homework && (
              <div className="rounded-xl border border-border bg-bg p-3 text-center">
                <div className="text-muted text-[12px] font-semibold mb-0.5">{t('studentPortal.pageAttendanceRateLabel')}</div>
            {rate == null ? (
              <div className="text-[15px] font-bold text-muted">{t('studentPortal.pageNoSessionsYet')}</div>
            ) : (
              <div
                className={`text-[20px] font-extrabold ${rate >= 80 ? 'text-ok-text' : 'text-warn-text'}`}
              >
                {rate}%
              </div>
            )}
              </div>
            )}
            {o.sections.money && (
              <div className="rounded-xl border border-border bg-bg p-3 text-center">
                <div className="text-muted text-[12px] font-semibold mb-0.5">{t('studentPortal.pageBalanceDueLabel')}</div>
            {o.balance > 0 ? (
              <div className="text-[20px] font-extrabold text-bad-text">{formatMoney(o.balance)}</div>
            ) : (
              <div className="text-[20px] font-extrabold text-ok-text flex items-center justify-center gap-1.5">
                {t('studentPortal.pagePaidLabel')} <Check size={22} />
              </div>
            )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* إشعارات Push الفورية — اشتراك اختياري من البوابة (Phase 4 خطوة 2)؛
          محورها الواجبات/الحضور فتختفي مع إخفاء المدرس لقسمها (3A-385) */}
      {o.sections.homework && (
        <div className="rise-in" style={{ animationDelay: '50ms' }}>
          <PortalPushToggle adapter={pushAdapter} />
        </div>
      )}

      {/* ١) حصصي القادمة — قسم الجدول (3A-385) */}
      {o.sections.schedule && (
        <>
          <div className="rise-in mt-5" style={{ animationDelay: '90ms' }}>
            <SectionTitle icon={CalendarDays}>{t('studentPortal.pageUpcomingTitle')}</SectionTitle>
            {o.upcoming_sessions.length === 0 ? (
        <StudentPortalEmptyNote text={t('studentPortal.pageUpcomingEmpty')} showMascot={o.brand.show_mascot} />
      ) : (
        <Card className="p-0 overflow-hidden">
          {o.upcoming_sessions.map((s, i) => (
            <div
              key={`${s.date}-${s.start_time}-${s.group_name}-${i}`}
              className={`flex items-center gap-3 px-[14px] py-2.5 ${i < o.upcoming_sessions.length - 1 ? 'border-b border-border' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] break-words">{s.group_name}</div>
                <div className="text-muted text-[12px]">
                  {t('studentPortal.pageSessionLine', { date: formatDateLabel(s.date), time: formatTime12(s.start_time), duration: s.duration_minutes })}
                  {s.room ? ` · ${s.room}` : ''}
                  {s.kind === 'extra' ? t('studentPortal.pageSessionExtraSuffix') : s.kind === 'moved' ? t('studentPortal.pageSessionMovedSuffix') : ''}
                </div>
              </div>
              <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2.5 py-1 whitespace-nowrap">
                {formatDayMonth(s.date)}
              </span>
            </div>
          ))}
        </Card>
      )}
      </div>

      {/* مواعيد مجموعاتي الثابتة وروابط الملازم */}
      {o.groups.length > 0 && (
        <>
          <SectionTitle icon={Users}>{t('studentPortal.pageGroupsTitle')}</SectionTitle>
          {o.groups.map((g) => (
            <Card key={g.name}>
              <div className="font-bold text-[15px]">{g.name}</div>
              <div className="text-muted text-[13.5px] mt-0.5">
                {daysLabel(g.days)} · {t('studentPortal.pageAtTime', { time: formatTime12(g.start_time) })}
                {g.room ? ` · ${g.room}` : ''}
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
          ))}
        </>
      )}

        </>
      )}

      {/* ٢) واجباتي — قسم الواجبات (3A-385) */}
      {o.sections.homework && (
        <>
          <SectionTitle icon={BookOpenCheck}>{t('studentPortal.pageHomeworkTitle')}</SectionTitle>
      {hw.marked > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-semibold">{t('studentPortal.pageHomeworkSubmittedLabel')}</span>
            <span
              className={`text-[15px] font-extrabold ${hw.submitted >= hw.marked / 2 ? 'text-ok-text' : 'text-warn-text'}`}
            >
              {t('studentPortal.pageHomeworkCount', { submitted: hw.submitted, marked: hw.marked })}
            </span>
          </div>
          <div className="h-2 rounded-full bg-soft overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${hw.marked > 0 ? Math.round((hw.submitted / hw.marked) * 100) : 0}%` }}
            />
          </div>
        </Card>
      )}
      {o.homework.length === 0 ? (
        <StudentPortalEmptyNote text={t('studentPortal.pageHomeworkEmpty')} showMascot={o.brand.show_mascot} />
      ) : (
        <Card className="p-0 overflow-hidden">
          {o.homework.map((h, i) => {
            const meta = STUDENT_PORTAL_ATT_META[h.status] ?? {
              label: h.status,
              badge: 'bg-soft text-muted border-border',
            }
            return (
              <div
                key={`${h.date}-${h.group_name}-${i}`}
                className={`flex items-center gap-3 px-[14px] py-2.5 ${i < o.homework.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] break-words">{h.group_name}</div>
                  <div className="text-muted text-[12px]">{h.date}</div>
                </div>
                <span className={`text-[12px] font-bold border rounded-full px-2.5 py-1 ${meta.badge}`}>
                  {meta.label}
                </span>
                {h.status === 'a' ? (
                  <span className="text-[12px] font-bold border rounded-full px-2.5 py-1 bg-soft text-muted border-border">
                    {t('studentPortal.pageHomeworkAbsent')}
                  </span>
                ) : h.homework_done ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-bold border rounded-full px-2.5 py-1 bg-ok/10 text-ok-text border-ok/30">
                    <Check size={14} /> {t('studentPortal.pageHomeworkDone')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[12px] font-bold border rounded-full px-2.5 py-1 bg-bad/10 text-bad-text border-bad/30">
                    <X size={14} /> {t('studentPortal.pageHomeworkMissing')}
                  </span>
                )}
              </div>
            )
          })}
        </Card>
      )}

        </>
      )}

      {/* ٣) درجاتي ونتائج امتحاناتي الإلكترونية — قسم الدرجات (3A-385) */}
      {o.sections.grades && (
        <>
          <SectionTitle icon={NotebookPen}>{t('studentPortal.pageGradesTitle')}</SectionTitle>
      {o.grades.length === 0 ? (
        <StudentPortalEmptyNote text={t('studentPortal.pageGradesEmpty')} showMascot={o.brand.show_mascot} />
      ) : (
        <Card className="p-0 overflow-hidden">
          {o.grades.map((s, i) => {
            const pct = pctOf(s.score, s.max_score)
            return (
              <div
                key={`${s.title}-${s.date}-${i}`}
                className={`flex items-center gap-3 px-[14px] py-2.5 ${i < o.grades.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] break-words">{s.title}</div>
                  <div className="text-muted text-[12px]">
                    {s.date} · {ASSESSMENT_TYPE_LABELS[s.type] ?? s.type}
                    {s.source === 'online_exam' ? t('studentPortal.pageGradeOnlineSuffix') : ''}
                  </div>
                </div>
                <div className="text-[13.5px] font-semibold whitespace-nowrap">
                  {t('studentPortal.pageScoreOf', { score: fmtScore(s.score), max: fmtScore(s.max_score) })}
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

      {o.exam_results.length > 0 && (
        <>
          <SectionTitle icon={Trophy}>{t('studentPortal.pageExamResultsTitle')}</SectionTitle>
          <Card className="p-0 overflow-hidden">
            {o.exam_results.map((r, i) => (
              <div
                key={`${r.title}-${r.submitted_at}-${i}`}
                className={`flex items-center gap-3 px-[14px] py-2.5 ${i < o.exam_results.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] break-words">{r.title}</div>
                  <div className="text-muted text-[12px]">
                    {t('studentPortal.pageExamAttemptLine', { attempt: r.attempt_no, date: r.submitted_at.slice(0, 10) })}
                    {r.score_posted ? t('studentPortal.pageExamPostedSuffix') : ''}
                  </div>
                </div>
                <div className="text-[13.5px] font-semibold whitespace-nowrap">
                  {t('studentPortal.pageScoreOf', { score: fmtScore(r.score), max: fmtScore(r.max_score) })}
                </div>
                <span
                  className={`min-w-[48px] text-center text-[12px] font-extrabold rounded-full px-2 py-1 text-white ${r.pct >= 50 ? 'bg-ok-text' : 'bg-bad-text'}`}
                >
                  {Math.round(r.pct)}%
                </span>
              </div>
            ))}
          </Card>
        </>
      )}

        </>
      )}

      {/* ٤) مدفوعاتي — قسم المال (3A-385) */}
      {o.sections.money && (
        <>
          <SectionTitle icon={Wallet}>{t('studentPortal.pagePaymentsTitle')}</SectionTitle>
      {o.invoices.length === 0 ? (
        <StudentPortalEmptyNote text={t('studentPortal.pageInvoicesEmpty')} showMascot={o.brand.show_mascot} />
      ) : (
        <Card className="p-0 overflow-hidden">
          {o.invoices.map((inv, i) => (
            <div
              key={`${inv.period_month}-${inv.group_name}-${i}`}
              className={`px-[14px] py-2.5 ${i < o.invoices.length - 1 ? 'border-b border-border' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] break-words">
                    {periodLabel(inv.period_month)} — {inv.group_name}
                  </div>
                  <div className="text-muted text-[12px]">
                    {t('studentPortal.pageInvoiceLine', { total: formatMoney(inv.total), paid: formatMoney(inv.paid) })}
                  </div>
                </div>
                {inv.is_paid ? (
                  <span className="text-[12px] font-bold border rounded-full px-2.5 py-1 bg-ok/10 text-ok-text border-ok/30">
                    {t('studentPortal.pageInvoicePaid')}
                  </span>
                ) : (
                  <span className="text-[12px] font-bold border rounded-full px-2.5 py-1 bg-bad/10 text-bad-text border-bad/30">
                    {t('common.remaining', { amount: formatMoney(inv.balance) })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}

      {o.recent_payments.length > 0 && (
        <>
          <SectionTitle icon={ReceiptText}>{t('studentPortal.pageRecentPaymentsTitle')}</SectionTitle>
          <Card className="p-0 overflow-hidden">
            {o.recent_payments.map((p, i) => (
              <div
                key={`${p.receipt_no}-${i}`}
                className={`flex items-center gap-3 px-[14px] py-2.5 ${i < o.recent_payments.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px]">
                    {formatMoney(p.amount)} · {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                  </div>
                  <div className="text-muted text-[12px]">
                    {t('studentPortal.pagePaymentReceiptLine', { date: p.paid_on })} <span dir="ltr">{p.receipt_no}</span>
                  </div>
                </div>
                {p.amount < 0 && (
                  <span className="text-[12px] font-bold border rounded-full px-2.5 py-1 bg-warn/15 text-warn-text border-warn/40">
                    {t('studentPortal.pageReversalBadge')}
                  </span>
                )}
              </div>
            ))}
          </Card>
        </>
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
                {`${window.location.origin}/student-portal`}
              </span>
            </span>
          </p>
        )}
        <Card>
          {sessionToken ? (
            <SessionAccountCard
              role="student"
              sessionToken={sessionToken}
              onLoggedOut={() => {
                clearCredentialCache()
                setSessionToken(null)
              }}
            />
          ) : (
            <ClaimPasswordCard
              loginPath="/student-portal"
              loginNameHint={t('studentPortal.claimLoginNameHint')}
              claim={(pw) =>
                portalClaimStudent(rawToken, pw).then((res) => {
                  const outcome = resolveClaimOutcome(res)
                  if (outcome.kind === 'legacy') {
                    // إجابة 0044 القديمة بلا جلسة (0056 غير مطبقة بعد):
                    // كلمة السر اتعيّنت، لكن الرابط يبقى صالحاً — لا
                    // نحفظ توكن ناقصاً ولا نحذف التوكن من الرابط ولا
                    // نبدّل الاعتماد.
                    setJustClaimed({ username: outcome.username, linkClosed: false })
                    return { username: outcome.username }
                  }
                  savePortalSessionToken('student', outcome.sessionToken)
                  clearCredentialCache()
                  setSessionToken(outcome.sessionToken)
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
        {t('studentPortal.pageFooter')}
      </p>
    </StudentPortalShell>
  )
}
