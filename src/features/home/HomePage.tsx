import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  ListChecks,
  Plus,
  ReceiptText,
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
  monthStartStr,
  relLabel,
  sessionEnd,
  todayStr,
  type SessionWithGroup,
} from './api'
import {
  useActiveCountsByGroup,
  useActiveStudentsCount,
  useAnyAttendanceCount,
  useAttendanceForSessions,
  useInvoiceBalances,
  useMonthPayments,
  useMonthlyAttendance,
  useUpcomingSessions,
} from './hooks'
import { AtRiskCard } from '../atrisk/AtRiskCard'
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
  valueClass = '',
}: {
  to: string
  value: string
  label: string
  sub?: string
  valueClass?: string
}) {
  return (
    <Link to={to} className="block no-underline text-text">
      <Card className="mb-0 text-center h-full">
        <b className={`block whitespace-nowrap overflow-hidden text-ellipsis text-[clamp(17px,5.6vw,21px)] font-extrabold leading-tight ${valueClass}`}>{value}</b>
        <span className="block text-muted text-[12px] font-semibold">{label}</span>
        {sub && <span className="block text-muted text-[12px] mt-0.5">{sub}</span>}
      </Card>
    </Link>
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
  const startSteps = [
    {
      done: (groupsQ.data?.length ?? 0) > 0,
      label: 'أنشئ أول مجموعة وحدّد جدولها ونظام دفعها',
      to: '/groups',
    },
    {
      done: (activeStudentsQ.data ?? 0) > 0,
      label: 'أضف طلابك وسجّلهم في المجموعة',
      to: '/students',
    },
    {
      done: (anyAttendanceQ.data ?? 0) > 0,
      label: 'سجّل أول حضور لحصة',
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
    const unpaid = rows.filter((r) => r.balance > 0)
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
        { to: '/students', icon: Plus, label: 'طالب جديد' },
        { to: '/groups', icon: Users, label: 'المجموعات' },
        { to: '/attendance', icon: ClipboardCheck, label: 'الحضور' },
        { to: '/schedule', icon: CalendarDays, label: 'الجدول' },
      ]
    : [
        { to: '/students', icon: Plus, label: 'طالب جديد' },
        { to: '/groups', icon: Users, label: 'المجموعات' },
        { to: '/attendance', icon: ClipboardCheck, label: 'الحضور' },
        { to: '/invoices', icon: ReceiptText, label: 'الفواتير' },
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
  const attRate = monthAttendanceQ.data?.rate ?? null
  const collectedMonth = paymentsQ.data?.collectedMonth ?? 0
  const goalPct =
    invoiceStats.monthIssuedTotal > 0
      ? Math.min(100, Math.round((collectedMonth / invoiceStats.monthIssuedTotal) * 100))
      : null

  return (
    <div>
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
          message={primaryError instanceof Error ? primaryError.message : 'خطأ غير معروف'}
          onRetry={() => {
            void activeStudentsQ.refetch()
            void monthAttendanceQ.refetch()
            void sessionsQ.refetch()
            if (isOwner) {
              void paymentsQ.refetch()
              void balancesQ.refetch()
            }
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
                  ابدأ هنا — 3 خطوات وتشتغل
                </span>
                <button
                  type="button"
                  onClick={dismissStartHere}
                  aria-label="إخفاء بطاقة البدء نهائياً"
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
                البطاقة دي بتختفي لوحدها أول ما تخلّص الخطوات التلاتة.
              </p>
            </Card>
          )}

          {/* Hero: الحصة القادمة بتدرّج نيلي — وبصمة الهوية: علامة
              الكتاب/الصح مائية بيضاء خفيفة جداً على التدرّج نفسه */}
          <div className="relative overflow-hidden rounded-2xl p-4 mb-3 text-white bg-[linear-gradient(135deg,#4F46E5,#4338CA)] shadow-[0_8px_20px_rgba(79,70,229,0.35)]">
            <div className="absolute -bottom-10 -end-10 pointer-events-none" aria-hidden="true">
              <Logo mono decorative size={190} className="text-white opacity-[0.09]" />
            </div>
            <div className="relative">
            {hero ? (
              <>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px] opacity-85 mb-1">
                  <span>الحصة القادمة</span>
                  <MetaSep />
                  <span>{hero.session_date === today ? 'اليوم' : 'غداً'}</span>
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
                  <span>الساعة {formatTime12(hero.start_time)}</span>
                  <MetaSep />
                  <span>{hero.duration_minutes} دقيقة</span>
                  {hero.group_room && (
                    <>
                      <MetaSep />
                      <span>{hero.group_room}</span>
                    </>
                  )}
                  {countsQ.data && (
                    <>
                      <MetaSep />
                      <span>{countsQ.data.get(hero.group_id) ?? 0} طالب</span>
                    </>
                  )}
                </div>
                <Link
                  to={`/attendance?session=${hero.id}`}
                  className="inline-flex items-center mt-3 bg-white text-primary font-bold text-[13.5px] rounded-full px-4 min-h-[48px] no-underline"
                >
                  سجّل الحضور
                </Link>
              </>
            ) : (
              <>
                <div className="text-[13.5px] opacity-85 mb-1">الحصة القادمة</div>
                <div className="font-extrabold text-[16px]">
                  {todaySessions.length > 0 ? 'شكراً على تعبك اليوم' : 'استمتع بيومك'}
                </div>
                <div className="text-[13.5px] opacity-85 mt-1">
                  {sessions.length === 0
                    ? 'مفيش حصص مجدولة النهاردة أو بكرة — الحصص هتظهر هنا بعد توليدها من جدول المجموعات.'
                    : 'خلصت الحصص المجدولة ومفيش حصة قادمة النهاردة أو بكرة.'}
                </div>
              </>
            )}
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <KpiCard
              to="/students"
              value={String(activeStudentsQ.data ?? 0)}
              label="طالب نشط"
            />
            <KpiCard
              to="/students"
              value={attRate == null ? '—' : `${attRate}%`}
              label="نسبة حضور الشهر"
              sub={
                attRate == null
                  ? 'لا حضور مسجل هذا الشهر'
                  : `حضر ${monthAttendanceQ.data?.attended ?? 0} من ${monthAttendanceQ.data?.marked ?? 0} مسجلة`
              }
              valueClass={attRate == null ? '' : attRate >= 80 ? 'text-ok-text' : 'text-warn-text'}
            />
            {isOwner && (
              <KpiCard
                to="/money"
                value={formatMoney(collectedMonth)}
                label="محصّل الشهر"
                sub={`اليوم: ${formatMoney(paymentsQ.data?.collectedToday ?? 0)}`}
                valueClass="text-ok-text"
              />
            )}
            {isOwner && (
              <KpiCard
                to="/invoices?filter=due"
                value={String(invoiceStats.unpaidCount)}
                label="فواتير غير مسددة"
                sub={
                  invoiceStats.unpaidCount > 0
                    ? `بإجمالي ${formatMoney(invoiceStats.arrearsTotal)}`
                    : 'لا توجد متأخرات'
                }
                valueClass={invoiceStats.unpaidCount > 0 ? 'text-warn-text' : ''}
              />
            )}
          </div>

          {/* هدف تحصيل الشهر — يظهر فقط عند وجود فواتير صادرة للشهر (المرجع §3.1) */}
          {isOwner && goalPct != null && (
            <Card>
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-[15px]">هدف تحصيل الشهر</span>
                <span className="font-extrabold text-ok-text">{goalPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-soft overflow-hidden">
                <div className="h-full rounded-full bg-ok" style={{ width: `${goalPct}%` }} />
              </div>
              <div className="text-muted text-[13.5px] mt-2">
                محصّل {formatMoney(collectedMonth)} من إجمالي فواتير الشهر{' '}
                {formatMoney(invoiceStats.monthIssuedTotal)}
              </div>
            </Card>
          )}

          {/* «معرّضون للفقد» (Phase 5 خطوة 1): بطاقة ملخص تظهر فقط عند
              وجود حالات — ليست تنبيهاً عاماً بل قائمة عمل بمتابعات */}
          <AtRiskCard />

          {/* التنبيهات ليست هنا عمداً (طلب المالك): مكانها الوحيد زر الجرس
              في الشريط العلوي بعدّاده، وشاشة الإشعارات خلفه */}

          {/* حصص اليوم */}
          <h2 className="type-section mb-2 mt-1">حصص اليوم</h2>
          {todaySessions.length === 0 ? (
            <Card>
              <EmptyState
                icon={CalendarDays}
                title="لا توجد حصص مجدولة اليوم"
                hint="هتظهر هنا حصص اليوم وحالة تحضيرها بعد توليدها من جدول المجموعات."
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
                إضافية
              </span>
            )}
            {s.kind === 'moved' && (
              <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
                منقولة
              </span>
            )}
            {cancelled && (
              <span className="text-[12px] font-bold bg-muted/15 text-muted border border-border rounded-full px-2 py-0.5">
                ملغاة
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted text-[13.5px] mt-0.5">
            <span>{formatTime12(s.start_time)}</span>
            <MetaSep />
            <span>{s.duration_minutes} دقيقة</span>
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
              <span className="shrink-0 text-muted text-[12px]">مفيش طلاب مسجلين</span>
            ) : done >= total ? (
              <Link
                to={`/attendance?session=${s.id}`}
                className="shrink-0 inline-flex items-center text-[13.5px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-3 min-h-[48px] no-underline"
              >
                تم ({done})
              </Link>
            ) : (
              <Link
                to={`/attendance?session=${s.id}`}
                className="shrink-0 inline-flex items-center text-[13.5px] font-bold bg-soft text-primary border border-primary/30 rounded-full px-3 min-h-[48px] no-underline"
              >
                تحضير ({done}/{total})
              </Link>
            )
          ) : (
            <span className="shrink-0 text-muted text-[12px]">بنحمّل حالة التحضير…</span>
          ))}
      </div>
    </Card>
  )
}
