import { isUnpaid } from '../invoices/api'
import { useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { t } from '../../i18n'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  ListChecks,
  Minus,
  Plus,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired, Skeleton } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { Logo } from '../../components/brand/Logo'
import { formatMoney, formatTime12 } from '../../lib/format'
import {
  kpiDelta,
  monthStartStr,
  relLabel,
  sessionEnd,
  todayStr,
  type KpiDelta,
  type SessionWithGroup,
} from './api'
import {
  HOME,
  useActiveCountsByGroup,
  useActiveStudentsCount,
  useAnyAttendanceCount,
  useAttendanceForSessions,
  useHomeDeltas,
  useInvoiceBalances,
  useMonthPayments,
  useMonthlyAttendance,
  useUpcomingSessions,
} from './hooks'
import { Mascot } from '../../components/mascot/Mascot'
import { useMascotVisible } from '../../components/mascot/useMascotVisible'
import { AtRiskCard } from '../atrisk/AtRiskCard'
import { ATRISK } from '../atrisk/hooks'
import { PendingProofsCard } from '../payment-proofs/PendingProofsCard'
import { useGroups } from '../groups/hooks'
import { useAuth } from '../../lib/AuthProvider'
import { DEMO_EMAIL } from '../auth/api'

/** فاصل ميتا: نقطة مستقلة أخف بصرياً داخل صف flex متباعد (طلب المالك:
    الفواصل النصية «·» ضيقة وتجعل الميتا مزدحمة على الشاشات الضيقة) */
function MetaSep() {
  return (
    <span aria-hidden="true" className="opacity-45 select-none">
      •
    </span>
  )
}

function KpiCard({
  to,
  value,
  label,
  sub,
  delta,
  valueClass = '',
}: {
  to: string
  value: string
  label: string
  sub?: string
  /** سطر الدلتا/التعريف تحت المؤشر (W5 — R-13/R-15) */
  delta?: ReactNode
  valueClass?: string
}) {
  return (
    <Link to={to} className="block no-underline text-text">
      <Card className="mb-0 text-center h-full">
        <b className={`block whitespace-nowrap overflow-hidden text-ellipsis text-[clamp(17px,5.6vw,21px)] font-extrabold leading-tight ${valueClass}`}>{value}</b>
        <span className="block text-muted text-[12px] font-semibold">{label}</span>
        {sub && <span className="block text-muted text-[12px] mt-0.5">{sub}</span>}
        {delta}
      </Card>
    </Link>
  )
}

/**
 * سطر دلتا المؤشر (W5 — R-13): فرق مطلق (+ نسبة عند وجود قاعدة) وسهم،
 * ملوّناً باتجاه المعنى لا الاتجاه الحسابي (goodWhen)، وبجانبه مرجع
 * المقارنة نصاً. delta = null بعد اكتمال التحميل = «لا مقارنة بعد».
 */
function DeltaLine({
  delta,
  formatAbs,
  goodWhen,
}: {
  delta: KpiDelta | null
  formatAbs: (n: number) => string
  goodWhen: 'up' | 'down'
}) {
  if (!delta) {
    return <span className="block text-muted text-[11.5px] mt-0.5">{t('home.kpi.noComparison')}</span>
  }
  const good = delta.direction !== 'flat' && delta.direction === goodWhen
  const cls =
    delta.direction === 'flat' ? 'text-muted' : good ? 'text-ok-text' : 'text-bad-text'
  const Icon =
    delta.direction === 'up' ? TrendingUp : delta.direction === 'down' ? TrendingDown : Minus
  return (
    <span className={`flex items-center justify-center gap-1 text-[11.5px] font-semibold mt-0.5 ${cls}`}>
      <Icon size={13} className="shrink-0" />
      <span>
        {formatAbs(Math.abs(delta.abs))}
        {delta.pct != null && delta.direction !== 'flat' ? ` (${Math.abs(delta.pct)}%)` : ''}
      </span>
      <span className="text-muted font-normal">{t('home.kpi.deltaVs')}</span>
    </span>
  )
}

/**
 * الرئيسية (المواصفات §3.1): إجراءات سريعة + Hero الحصة القادمة + KPIs حقيقية
 * + هدف تحصيل الشهر + حصص اليوم. (التنبيهات في الشريط العلوي فقط.)
 * كل رقم من استعلام فعلي على جداول المخطط (students/attendance/payments/
 * invoice_balances/sessions) — غياب البيانات = حالة فارغة صادقة.
 * البطاقات المالية وهدف التحصيل مخفية في وضع المساعد (RLS تحجبها أصلاً).
 */
export function HomePage() {
  const qc = useQueryClient()
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const isAssistant = teacher.status === 'ready' && teacher.role === 'assistant'
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'

  const today = todayStr()
  const monthStart = monthStartStr(today)

  const activeStudentsQ = useActiveStudentsCount(teacherId)
  const monthAttendanceQ = useMonthlyAttendance(teacherId)

  // بطاقة «ابدأ هنا» (M3): خطوات إعداد المدرس الجديد — تُشتق من بياناته
  // الفعلية (مجموعة ← طلاب ← أول حضور)، وتختفي عند اكتمالها أو بإخفاء
  // دائم. للمالك فقط، ولا تظهر للحساب التجريبي أبداً.
  const { user } = useAuth()
  const groupsQ = useGroups(teacherId)
  const anyAttendanceQ = useAnyAttendanceCount(teacherId)
  const dismissKey = teacherId ? `start-here-dismissed:${teacherId}` : null
  // إخفاء دائم محفوظ محلياً لكل مدرس — يُقرأ اشتقاقياً مع كل تغيّر
  // للمفتاح أو نقرة إخفاء (لا حالة مرآة في إفكت)
  const [dismissTick, setDismissTick] = useState(0)
  const startDismissed = useMemo(() => {
    void dismissTick
    if (!dismissKey) return false
    try {
      return window.localStorage.getItem(dismissKey) === '1'
    } catch {
      return false
    }
  }, [dismissKey, dismissTick])
  const dismissStartHere = () => {
    if (dismissKey) {
      try {
        window.localStorage.setItem(dismissKey, '1')
      } catch {
        // تجاهل: الإخفاء للجلسة الحالية على الأقل
      }
    }
    setDismissTick((t) => t + 1)
  }

  // ترحيب دُفّي اليومي (MASCOT-PLAN §٦): شريط ترحيب صغير يظهر في أول
  // دخول كل يوم فقط (مفتاح محلي بقيمة تاريخ اليوم لكل مدرس)، وزر
  // الإخفاء يطويه لبقية اليوم. حاكم الظهور الأعلى هو إعداد «إظهار
  // دُفّي» نفسه (useMascotVisible) — عند إيقافه لا شريط ولا صورة.
  // ملحوظة §٧: الترحيب تحية فقط — لا أي محتوى تنبيهات هنا أبداً.
  const mascotVisible = useMascotVisible()
  const welcomeKey = teacherId ? `doffy-welcome:${teacherId}` : null
  const [welcomeTick, setWelcomeTick] = useState(0)
  const welcomeShownToday = useMemo(() => {
    void welcomeTick
    if (!welcomeKey) return true
    try {
      return window.localStorage.getItem(welcomeKey) === today
    } catch {
      return false
    }
  }, [welcomeKey, welcomeTick, today])
  const dismissWelcome = () => {
    if (welcomeKey) {
      try {
        window.localStorage.setItem(welcomeKey, today)
      } catch {
        // تجاهل: الإخفاء للجلسة الحالية على الأقل
      }
    }
    setWelcomeTick((t) => t + 1)
  }
  const showWelcome = mascotVisible && teacher.status === 'ready' && !welcomeShownToday
  const welcomeName =
    teacher.status === 'ready'
      ? teacher.teacher?.display_name?.trim() || t('home.welcome.teacherFallback')
      : ''
  const startSteps = [
    {
      done: (groupsQ.data?.length ?? 0) > 0,
      label: t('home.startHere.step1'),
      to: '/groups',
    },
    {
      done: (activeStudentsQ.data ?? 0) > 0,
      label: t('home.startHere.step2'),
      to: '/students',
    },
    {
      done: (anyAttendanceQ.data ?? 0) > 0,
      label: t('home.startHere.step3'),
      to: '/attendance',
    },
  ]
  const stepsKnown =
    groupsQ.data !== undefined &&
    activeStudentsQ.data !== undefined &&
    anyAttendanceQ.data !== undefined
  const showStartHere =
    isOwner &&
    user?.email !== DEMO_EMAIL &&
    stepsKnown &&
    !startDismissed &&
    startSteps.some((s) => !s.done)
  const paymentsQ = useMonthPayments(teacherId, isOwner)
  const balancesQ = useInvoiceBalances(teacherId, isOwner)
  const sessionsQ = useUpcomingSessions(teacherId)
  const deltasQ = useHomeDeltas(teacherId, isOwner)

  const sessions = useMemo(() => sessionsQ.data ?? [], [sessionsQ.data])
  const groupIds = useMemo(() => [...new Set(sessions.map((s) => s.group_id))], [sessions])
  const countsQ = useActiveCountsByGroup(teacherId, groupIds)

  const todaySessions = useMemo(
    () => sessions.filter((s) => s.session_date === today),
    [sessions, today],
  )
  const todayIds = useMemo(() => todaySessions.map((s) => s.id), [todaySessions])
  const marksQ = useAttendanceForSessions(teacherId, todayIds)

  const markedBySession = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of marksQ.data ?? []) {
      if (m.status != null) map.set(m.session_id, (map.get(m.session_id) ?? 0) + 1)
    }
    return map
  }, [marksQ.data])

  // الحصة القادمة: أول حصة مجدولة (غير ملغاة) لم تنتهِ بعد — اليوم ثم غداً
  const hero = useMemo(() => {
    const now = new Date()
    return (
      sessions.find((s) => s.status === 'scheduled' && sessionEnd(s) > now) ?? null
    )
  }, [sessions])

  // مشتقات الفواتير من view ‏invoice_balances
  const invoiceStats = useMemo(() => {
    const rows = balancesQ.data ?? []
    const unpaid = rows.filter(isUnpaid)
    return {
      unpaidCount: unpaid.length,
      arrearsTotal: unpaid.reduce((sum, r) => sum + r.balance, 0),
      monthIssuedTotal: rows
        .filter((r) => r.period_month === monthStart)
        .reduce((sum, r) => sum + r.total, 0),
    }
  }, [balancesQ.data, monthStart])

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  const quickActions: { to: string; icon: LucideIcon; label: string }[] = isAssistant
    ? [
        { to: '/students', icon: Plus, label: t('home.quick.newStudent') },
        { to: '/groups', icon: Users, label: t('home.quick.groups') },
        { to: '/attendance', icon: ClipboardCheck, label: t('home.quick.attendance') },
        { to: '/schedule', icon: CalendarDays, label: t('home.quick.schedule') },
      ]
    : [
        { to: '/students', icon: Plus, label: t('home.quick.newStudent') },
        { to: '/groups', icon: Users, label: t('home.quick.groups') },
        { to: '/attendance', icon: ClipboardCheck, label: t('home.quick.attendance') },
        { to: '/invoices', icon: ReceiptText, label: t('home.quick.invoices') },
      ]

  const primaryPending =
    activeStudentsQ.isPending ||
    monthAttendanceQ.isPending ||
    sessionsQ.isPending ||
    (isOwner && (paymentsQ.isPending || balancesQ.isPending))
  const primaryError =
    activeStudentsQ.error ??
    monthAttendanceQ.error ??
    sessionsQ.error ??
    (isOwner ? (paymentsQ.error ?? balancesQ.error) : null)

  const now = new Date()
  // تحية الترحيب بحسب الساعة (صباحاً/مساءً) — من نفس «الآن» المحسوبة
  // أصلاً لاشتقاقات الصفحة حتى لا تتضارب ساعتان في تصيير واحد
  const welcomeGreeting =
    now.getHours() < 12
      ? t('home.welcome.morning', { name: welcomeName })
      : t('home.welcome.evening', { name: welcomeName })
  const attRate = monthAttendanceQ.data?.rate ?? null
  const collectedMonth = paymentsQ.data?.collectedMonth ?? 0
  const goalPct =
    invoiceStats.monthIssuedTotal > 0
      ? Math.min(100, Math.round((collectedMonth / invoiceStats.monthIssuedTotal) * 100))
      : null

  return (
    <div>
      {/* ترحيب دُفّي اليومي — أول دخول كل يوم فقط (MASCOT-PLAN §٦) */}
      {showWelcome && (
        <Card>
          <div className="flex items-center gap-3">
            <Mascot state="welcome" size={58} />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[15.5px]">{welcomeGreeting}</div>
              <div className="text-muted text-[13px] mt-0.5">{t('home.welcome.subtitle')}</div>
            </div>
            <button
              type="button"
              onClick={dismissWelcome}
              aria-label={t('home.welcome.hide')}
              className="w-9 h-9 shrink-0 flex items-center justify-center bg-transparent border-0 text-muted cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </Card>
      )}

      {/* شبكة الإجراءات السريعة — وجهات حقيقية موجودة فقط (المرجع §3.1) */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {quickActions.map((a) => {
          const ActionIcon = a.icon
          return (
            <Link
              key={a.label}
              to={a.to}
              className="bg-card border border-border rounded-2xl py-2.5 px-0.5 flex flex-col items-center gap-1 no-underline text-text"
            >
              <ActionIcon size={22} className="text-primary" />
              {/* تسميات قصيرة من سطر واحد دائماً (طلب المالك: «الكلام مش
                  مظبوط» لما التسميات الطويلة كانت تلتف على شاشات 360px) */}
              <span className="text-[12px] font-semibold leading-[1.4] whitespace-nowrap text-center">
                {a.label}
              </span>
            </Link>
          )
        })}
      </div>

      {primaryPending ? (
        <>
          <Skeleton className="h-[118px] mb-3" />
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Skeleton className="h-[78px]" />
            <Skeleton className="h-[78px]" />
            {isOwner && <Skeleton className="h-[78px]" />}
            {isOwner && <Skeleton className="h-[78px]" />}
          </div>
          <Skeleton className="h-[120px]" />
        </>
      ) : primaryError ? (
        <ErrorState
          message={primaryError instanceof Error ? primaryError.message : t('common.unknownError')}
          onRetry={() => {
            // إبطال بالمبادئ يعيد جلب كل استعلامات الصفحة النشطة دفعة
            // واحدة (كانت قائمة يدوية بخمسة استعلامات تنقصها البطاقات
            // الأحدث — PAT-1)؛ التنبيهات تحت HOME والمعرّضون تحت ATRISK
            void qc.invalidateQueries({ queryKey: [HOME] })
            void qc.invalidateQueries({ queryKey: [ATRISK] })
          }}
        />
      ) : (
        <>
          {/* بطاقة «ابدأ هنا» — للمدرس الجديد فقط (M3): خطوات مرتبة
              تُعلَّم من بياناته الفعلية وتختفي عند اكتمالها */}
          {showStartHere && (
            <Card>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold text-[15px] flex items-center gap-2">
                  <ListChecks size={20} className="text-primary" />
                  {t('home.startHere.title')}
                </span>
                <button
                  type="button"
                  onClick={dismissStartHere}
                  aria-label={t('home.startHere.hide')}
                  className="w-9 h-9 shrink-0 flex items-center justify-center bg-transparent border-0 text-muted cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              {startSteps.map((s, i) => (
                <Link
                  key={s.to}
                  to={s.to}
                  className="flex items-center gap-2 py-2 no-underline text-text border-b border-border/60 last:border-0"
                >
                  {s.done ? (
                    <CheckCircle2 size={20} className="text-ok-text shrink-0" />
                  ) : (
                    <Circle size={20} className="text-muted shrink-0" />
                  )}
                  <span className={s.done ? 'text-muted line-through' : 'font-semibold'}>
                    {i + 1}. {s.label}
                  </span>
                </Link>
              ))}
              <p className="text-muted text-[12px] mt-2 mb-0">
                {t('home.startHere.note')}
              </p>
            </Card>
          )}

          {/* Hero: الحصة القادمة بتدرّج نيلي — وبصمة الهوية: علامة
              الكتاب/الصح مائية بيضاء خفيفة جداً على التدرّج نفسه */}
          <div className="relative overflow-hidden rounded-2xl p-4 mb-3 text-white bg-[linear-gradient(135deg,var(--primary),var(--primary-d))] shadow-raised">
            <div className="absolute -bottom-10 -end-10 pointer-events-none" aria-hidden="true">
              <Logo mono decorative size={190} className="text-white opacity-[0.09]" />
            </div>
            <div className="relative">
            {hero ? (
              <>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px] opacity-85 mb-1">
                  <span>{t('home.hero.nextSession')}</span>
                  <MetaSep />
                  <span>{hero.session_date === today ? t('home.hero.today') : t('home.hero.tomorrow')}</span>
                </div>
                <div className="font-extrabold text-[19px] leading-[1.6]">{hero.group_name}</div>
                {/* ميتا الحصة القادمة: عناصر منفصلة في صف flex يلتف بنضافة
                    على 360px، بفواصل متباعدة مقروءة بدل «·» النصية الضيقة */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px] opacity-90 mt-1 leading-[1.7]">
                  {hero.session_date === today && (
                    <>
                      <span>{relLabel(hero, now)}</span>
                      <MetaSep />
                    </>
                  )}
                  <span>{t('home.hero.atTime', { time: formatTime12(hero.start_time) })}</span>
                  <MetaSep />
                  <span>{t('home.hero.minutes', { minutes: hero.duration_minutes })}</span>
                  {hero.group_room && (
                    <>
                      <MetaSep />
                      <span>{hero.group_room}</span>
                    </>
                  )}
                  {countsQ.data && (
                    <>
                      <MetaSep />
                      <span>{t('home.hero.students', { count: countsQ.data.get(hero.group_id) ?? 0 })}</span>
                    </>
                  )}
                </div>
                <Link
                  to={`/attendance?session=${hero.id}`}
                  className="inline-flex items-center mt-3 bg-white text-primary font-bold text-[13.5px] rounded-full px-4 min-h-[48px] no-underline"
                >
                  {t('home.hero.recordAttendance')}
                </Link>
              </>
            ) : (
              <>
                <div className="text-[13.5px] opacity-85 mb-1">{t('home.hero.nextSession')}</div>
                <div className="font-extrabold text-[16px]">
                  {todaySessions.length > 0 ? t('home.hero.thanksToday') : t('home.hero.enjoyDay')}
                </div>
                <div className="text-[13.5px] opacity-85 mt-1">
                  {sessions.length === 0
                    ? t('home.hero.noSessionsYet')
                    : t('home.hero.doneForToday')}
                </div>
              </>
            )}
            </div>
          </div>

          {/* بطاقات الإجراء المطلوب (W5 — R-12): المعرّضون للفقد ثم
              إثباتات الدفع المعلّقة — قبل المؤشرات، وكلتاهما بهيكل
              تحميل محجوز الارتفاع فلا قفزة عند ظهورها */}
          <AtRiskCard />
          <PendingProofsCard />

          {/* KPIs — صف واحد من أربعة على الشاشات الواسعة (R-16)، وكل
              مؤشر بدلتا نفس أيام الشهر الماضي (R-13) عدا «غير المسددة»
              فرقمها مخزون حالي لا يُعاد بناؤه تاريخياً — يحمل تعريفه
              بدلاً منها (R-15) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
            <KpiCard
              to="/students"
              value={String(activeStudentsQ.data ?? 0)}
              label={t('home.kpi.activeStudents')}
              delta={
                deltasQ.data ? (
                  <DeltaLine
                    delta={kpiDelta(deltasQ.data.joinsCur, deltasQ.data.joinsPrev)}
                    formatAbs={(n) => t('home.kpi.newStudents', { count: n })}
                    goodWhen="up"
                  />
                ) : undefined
              }
            />
            <KpiCard
              to="/students"
              value={attRate == null ? '—' : `${attRate}%`}
              label={t('home.kpi.attendanceRate')}
              sub={
                attRate == null
                  ? t('home.kpi.noAttendance')
                  : t('home.kpi.attendedOf', { attended: monthAttendanceQ.data?.attended ?? 0, marked: monthAttendanceQ.data?.marked ?? 0 })
              }
              valueClass={attRate == null ? '' : attRate >= 80 ? 'text-ok-text' : 'text-warn-text'}
              delta={
                deltasQ.data ? (
                  <DeltaLine
                    delta={
                      attRate != null && deltasQ.data.attPrev.rate != null
                        ? { ...kpiDelta(attRate, deltasQ.data.attPrev.rate), pct: null }
                        : null
                    }
                    formatAbs={(n) => t('home.kpi.points', { count: n })}
                    goodWhen="up"
                  />
                ) : undefined
              }
            />
            {isOwner && (
              <KpiCard
                to="/money"
                value={formatMoney(collectedMonth)}
                label={t('home.kpi.collectedMonth')}
                sub={t('home.kpi.todayLine', { amount: formatMoney(paymentsQ.data?.collectedToday ?? 0) })}
                valueClass="text-ok-text"
                delta={
                  deltasQ.data ? (
                    <DeltaLine
                      delta={
                        deltasQ.data.collectedPrev != null
                          ? kpiDelta(collectedMonth, deltasQ.data.collectedPrev)
                          : null
                      }
                      formatAbs={(n) => formatMoney(n)}
                      goodWhen="up"
                    />
                  ) : undefined
                }
              />
            )}
            {isOwner && (
              <KpiCard
                to="/invoices?filter=due"
                value={String(invoiceStats.unpaidCount)}
                label={t('home.kpi.unpaidInvoices')}
                sub={
                  invoiceStats.unpaidCount > 0
                    ? t('home.kpi.unpaidTotal', { amount: formatMoney(invoiceStats.arrearsTotal) })
                    : t('home.kpi.noArrears')
                }
                valueClass={invoiceStats.unpaidCount > 0 ? 'text-warn-text' : ''}
                delta={
                  <span className="block text-muted text-[11.5px] mt-0.5">
                    {t('home.kpi.unpaidDefinition')}
                  </span>
                }
              />
            )}
          </div>

          {/* هدف تحصيل الشهر — يظهر فقط عند وجود فواتير صادرة للشهر (المرجع §3.1) */}
          {isOwner && goalPct != null && (
            <Card>
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-[15px]">{t('home.goal.title')}</span>
                <span className="font-extrabold text-ok-text">{goalPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-soft overflow-hidden">
                <div className="h-full rounded-full bg-ok" style={{ width: `${goalPct}%` }} />
              </div>
              <div className="text-muted text-[13.5px] mt-2">
                {t('home.goal.line', { collected: formatMoney(collectedMonth), total: formatMoney(invoiceStats.monthIssuedTotal) })}
              </div>
            </Card>
          )}

          {/* التنبيهات ليست هنا عمداً (طلب المالك): مكانها الوحيد زر الجرس
              في الشريط العلوي بعدّاده، وشاشة الإشعارات خلفه */}

          {/* حصص اليوم */}
          <h2 className="type-section mb-2 mt-1">{t('home.today.title')}</h2>
          {todaySessions.length === 0 ? (
            <Card>
              <EmptyState
                icon={CalendarDays}
                title={t('home.today.emptyTitle')}
                hint={t('home.today.emptyHint')}
              />
            </Card>
          ) : (
            todaySessions.map((s) => (
              <TodaySessionCard
                key={s.id}
                session={s}
                total={countsQ.data?.get(s.group_id)}
                done={markedBySession.get(s.id) ?? 0}
                progressReady={Boolean(countsQ.data) && !marksQ.isPending}
              />
            ))
          )}
        </>
      )}
    </div>
  )
}

function TodaySessionCard({
  session: s,
  total,
  done,
  progressReady,
}: {
  session: SessionWithGroup
  total: number | undefined
  done: number
  progressReady: boolean
}) {
  const cancelled = s.status === 'cancelled'
  return (
    <Card className={cancelled ? 'opacity-70' : ''}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[15px]">{s.group_name}</span>
            {s.kind === 'extra' && (
              <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
                {t('home.today.extra')}
              </span>
            )}
            {s.kind === 'moved' && (
              <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
                {t('home.today.moved')}
              </span>
            )}
            {cancelled && (
              <span className="text-[12px] font-bold bg-muted/15 text-muted border border-border rounded-full px-2 py-0.5">
                {t('home.today.cancelled')}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted text-[13.5px] mt-0.5">
            <span>{formatTime12(s.start_time)}</span>
            <MetaSep />
            <span>{t('home.hero.minutes', { minutes: s.duration_minutes })}</span>
            {s.group_room && (
              <>
                <MetaSep />
                <span>{s.group_room}</span>
              </>
            )}
          </div>
        </div>
        {!cancelled &&
          (progressReady && total != null ? (
            total === 0 ? (
              <span className="shrink-0 text-muted text-[12px]">{t('home.today.noStudents')}</span>
            ) : done >= total ? (
              <Link
                to={`/attendance?session=${s.id}`}
                className="shrink-0 inline-flex items-center text-[13.5px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-3 min-h-[48px] no-underline"
              >
                {t('home.today.done', { count: done })}
              </Link>
            ) : (
              <Link
                to={`/attendance?session=${s.id}`}
                className="shrink-0 inline-flex items-center text-[13.5px] font-bold bg-soft text-primary border border-primary/30 rounded-full px-3 min-h-[48px] no-underline"
              >
                {t('home.today.mark', { done, total })}
              </Link>
            )
          ) : (
            <span className="shrink-0 text-muted text-[12px]">{t('home.today.loadingProgress')}</span>
          ))}
      </div>
    </Card>
  )
}
