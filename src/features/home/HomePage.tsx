import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatMoney, shortTime } from '../../lib/format'
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
  useAttendanceForSessions,
  useHomeAlerts,
  useInvoiceBalances,
  useMonthPayments,
  useMonthlyAttendance,
  useUpcomingSessions,
} from './hooks'

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-soft rounded-2xl ${className}`} />
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
        <b className={`block text-[21px] font-extrabold leading-tight ${valueClass}`}>{value}</b>
        <span className="block text-muted text-[12px] font-semibold">{label}</span>
        {sub && <span className="block text-muted text-[11px] mt-0.5">{sub}</span>}
      </Card>
    </Link>
  )
}

/**
 * الرئيسية (المواصفات §3.1): إجراءات سريعة + Hero الحصة القادمة + KPIs حقيقية
 * + هدف تحصيل الشهر + بطاقة تنبيهات مختصرة + حصص اليوم.
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
  const paymentsQ = useMonthPayments(teacherId, isOwner)
  const balancesQ = useInvoiceBalances(teacherId, isOwner)
  const sessionsQ = useUpcomingSessions(teacherId)
  const alertsQ = useHomeAlerts(teacherId, isOwner)

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

  const quickActions = isAssistant
    ? [
        { to: '/students', icon: '➕', label: 'طالب جديد' },
        { to: '/groups', icon: '👨‍👩‍👧‍👦', label: 'مجموعة جديدة' },
        { to: '/attendance', icon: '✅', label: 'تسجيل حضور' },
        { to: '/schedule', icon: '🗓️', label: 'الجدول' },
      ]
    : [
        { to: '/students', icon: '➕', label: 'طالب جديد' },
        { to: '/groups', icon: '👨‍👩‍👧‍👦', label: 'مجموعة جديدة' },
        { to: '/attendance', icon: '✅', label: 'تسجيل حضور' },
        { to: '/invoices', icon: '🧾', label: 'الفواتير' },
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
        {quickActions.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="bg-card border border-border rounded-2xl py-3 flex flex-col items-center gap-1 no-underline text-text"
          >
            <span className="text-[20px]">{a.icon}</span>
            <span className="text-[11px] font-semibold">{a.label}</span>
          </Link>
        ))}
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
        />
      ) : (
        <>
          {/* Hero: الحصة القادمة بتدرّج نيلي */}
          <div className="rounded-2xl p-4 mb-3 text-white bg-[linear-gradient(135deg,#4F46E5,#4338CA)] shadow-[0_8px_20px_rgba(79,70,229,0.35)]">
            {hero ? (
              <>
                <div className="text-[13px] opacity-85 mb-1">
                  الحصة القادمة · {hero.session_date === today ? 'اليوم' : 'غداً'}
                </div>
                <div className="font-extrabold text-[19px]">{hero.group_name}</div>
                <div className="text-[13px] opacity-90 mt-1">
                  {hero.session_date === today ? `${relLabel(hero, now)} · ` : ''}
                  الساعة {shortTime(hero.start_time)} · {hero.duration_minutes} دقيقة
                  {hero.group_room ? ` · ${hero.group_room}` : ''}
                  {countsQ.data ? ` · ${countsQ.data.get(hero.group_id) ?? 0} طالب` : ''}
                </div>
                <Link
                  to={`/attendance?session=${hero.id}`}
                  className="inline-block mt-3 bg-white text-primary font-bold text-[13px] rounded-full px-4 py-2 no-underline"
                >
                  سجّل الحضور
                </Link>
              </>
            ) : (
              <>
                <div className="text-[13px] opacity-85 mb-1">الحصة القادمة</div>
                <div className="font-extrabold text-[17px]">
                  {todaySessions.length > 0 ? 'شكراً على تعبك اليوم' : 'استمتع بيومك'}
                </div>
                <div className="text-[13px] opacity-85 mt-1">
                  {sessions.length === 0
                    ? 'مفيش حصص مجدولة النهاردة أو بكرة — الحصص هتظهر هنا بعد توليدها من جدول المجموعات.'
                    : 'خلصت الحصص المجدولة ومفيش حصة قادمة النهاردة أو بكرة.'}
                </div>
              </>
            )}
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
                <span className="font-bold text-[14px]">هدف تحصيل الشهر</span>
                <span className="font-extrabold text-ok-text">{goalPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-soft overflow-hidden">
                <div className="h-full rounded-full bg-ok" style={{ width: `${goalPct}%` }} />
              </div>
              <div className="text-muted text-[12px] mt-2">
                محصّل {formatMoney(collectedMonth)} من إجمالي فواتير الشهر{' '}
                {formatMoney(invoiceStats.monthIssuedTotal)}
              </div>
            </Card>
          )}

          {/* بطاقة التنبيهات المختصرة */}
          {alertsQ.isPending ? (
            <Skeleton className="h-[64px] mb-3" />
          ) : alertsQ.data ? (
            <Link to="/notifications" className="block no-underline text-text">
              <Card>
                <div className="flex items-center gap-2">
                  <span className="text-[18px]">🔔</span>
                  <span className="font-bold text-[14px]">التنبيهات</span>
                  {(alertsQ.data.length ?? 0) > 0 && (
                    <span className="text-[11px] font-bold bg-bad text-white rounded-full px-2 py-0.5">
                      {alertsQ.data.length}
                    </span>
                  )}
                </div>
                <div className="text-muted text-[13px] mt-1">
                  {alertsQ.data.length > 0 ? alertsQ.data[0].text : 'مفيش أي تنبيهات حالياً ✅'}
                </div>
              </Card>
            </Link>
          ) : null}

          {/* حصص اليوم */}
          <h2 className="text-[15px] font-extrabold mb-2 mt-1">حصص اليوم</h2>
          {todaySessions.length === 0 ? (
            <Card>
              <EmptyState
                icon="📅"
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
              <span className="text-[11px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
                إضافية
              </span>
            )}
            {s.kind === 'moved' && (
              <span className="text-[11px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
                منقولة
              </span>
            )}
            {cancelled && (
              <span className="text-[11px] font-bold bg-muted/15 text-muted border border-border rounded-full px-2 py-0.5">
                ملغاة
              </span>
            )}
          </div>
          <div className="text-muted text-[13px] mt-0.5">
            {shortTime(s.start_time)} · {s.duration_minutes} دقيقة
            {s.group_room ? ` · ${s.group_room}` : ''}
          </div>
        </div>
        {!cancelled &&
          (progressReady && total != null ? (
            total === 0 ? (
              <span className="shrink-0 text-muted text-[12px]">مفيش طلاب مسجلين</span>
            ) : done >= total ? (
              <Link
                to={`/attendance?session=${s.id}`}
                className="shrink-0 text-[12px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-3 py-1.5 no-underline"
              >
                تم ({done})
              </Link>
            ) : (
              <Link
                to={`/attendance?session=${s.id}`}
                className="shrink-0 text-[12px] font-bold bg-soft text-primary border border-primary/30 rounded-full px-3 py-1.5 no-underline"
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
