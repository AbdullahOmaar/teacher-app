import { useState } from 'react'
import { t } from '../../i18n'
import { Link } from 'react-router-dom'
import { ChartColumn, Lock, Sparkles, TrendingDown, TrendingUp, UserX, Wallet } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import {
  ErrorState,
  LoadingState,
  NoTeacherProfile,
  SignInRequired,
} from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatMoney } from '../../lib/format'
import { periodLabel } from '../invoices/api'
import type { AnalyticsRange } from './api'
import { useAnalytics } from './hooks'
import { AttendanceChart, CollectedChart, GrowthChart, OverdueChart } from './charts'

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: 3, label: t('analytics.range3') },
  { value: 6, label: t('analytics.range6') },
  { value: 12, label: t('analytics.range12') },
]

function Kpi({
  value,
  label,
  valueClass = '',
}: {
  value: string
  label: string
  valueClass?: string
}) {
  return (
    <Card className="mb-0 text-center h-full">
      <b className={`block text-[19px] font-extrabold leading-tight tabular-nums ${valueClass}`}>
        {value}
      </b>
      <span className="block text-muted text-[12px] font-semibold mt-0.5">{label}</span>
    </Card>
  )
}

function ChartCard({
  title,
  hint,
  delay,
  children,
}: {
  title: string
  hint: string
  delay?: string
  children: React.ReactNode
}) {
  return (
    <Card className="mb-0 h-full rise-in" style={delay ? { animationDelay: delay } : undefined}>
      <div className="type-section mb-0.5">{title}</div>
      <p className="text-muted text-[12.5px] mb-3">{hint}</p>
      {children}
    </Card>
  )
}

/** صف رؤية واحدة داخل بطاقة «{t('analytics.insightsTitle')}» — برابط حفر مباشر لوجهتها */
function InsightRow({
  icon: Icon,
  children,
  to,
  last = false,
}: {
  icon: typeof Wallet
  children: React.ReactNode
  to: string
  last?: boolean
}) {
  return (
    <Link
      to={to}
      className={`flex items-start gap-2 py-2 no-underline text-text ${last ? '' : 'border-b border-border/60'}`}
    >
      <span className="w-9 h-9 shrink-0 rounded-full bg-soft text-primary flex items-center justify-center">
        <Icon size={18} />
      </span>
      <span className="flex-1 min-w-0 text-[13.5px] leading-[1.7]">{children}</span>
    </Link>
  )
}

/**
 * لوحة التحليلات (Phase 3 — الخطوة 3): سلاسل زمنية شهرية بمدى 3/6/12
 * شهراً من الـ views القائمة (انظر api.ts لتعريف كل سلسلة ومصدرها).
 *
 * الصلاحيات: اللوحة مالية الطابع — للمالك فقط بنفس نمط شاشة الفلوس:
 * المساعد يرى بطاقة منع هنا، والبيانات نفسها محكومة بـ RLS؛ لا تُجلب
 * أي بيانات أصلاً عند غياب الملكية (enabled = isOwner).
 */
export function AnalyticsPage() {
  const teacher = useCurrentTeacher()
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const [range, setRange] = useState<AnalyticsRange>(6)

  const analyticsQ = useAnalytics(teacherId, range, isOwner)

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  if (!isOwner) {
    return (
      <Card className="text-center py-10">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
          <Lock size={28} />
        </div>
        <div className="type-section mb-1">{t('analytics.ownerOnlyTitle')}</div>
        <p className="text-muted text-[13.5px] mb-0">
          {t('analytics.ownerOnlyBody')}
        </p>
      </Card>
    )
  }

  const data = analyticsQ.data

  return (
    <div className="flex flex-col gap-3">
      {/* اختيار المدى */}
      <div className="flex gap-2" role="group" aria-label={t('analytics.rangeAria')}>
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setRange(r.value)}
            aria-pressed={range === r.value}
            className={`flex-1 min-h-[48px] rounded-xl border font-bold text-[14px] cursor-pointer ${
              range === r.value
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-card text-text border-border hover:bg-soft'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {analyticsQ.isPending ? (
        <LoadingState />
      ) : analyticsQ.isError ? (
        <ErrorState
          message={analyticsQ.error?.message ?? t('analytics.errorUnknown')}
          onRetry={() => void analyticsQ.refetch()}
        />
      ) : data && !data.hasAnyData ? (
        <Card className="p-0">
          <EmptyState
            mascot
            icon={ChartColumn}
            title={t('analytics.emptyTitle')}
            hint={t('analytics.emptyHint')}
          />
        </Card>
      ) : data ? (
        <>
          {/* {t('analytics.insightsTitle')} (W5 — R-14): حتمية من نفس البيانات، فوق الرسوم،
              كل رؤية برابط حفر لوجهة الإجراء */}
          {(data.insights.topOverdueGroup ||
            data.insights.biggestCollectionChange ||
            data.insights.mostAbsentGroup) && (
            <Card className="mb-0">
              <div className="flex items-center gap-2 font-extrabold text-[15px] mb-1">
                <Sparkles size={20} className="text-primary" />
                {t('analytics.insightsTitle')}
              </div>
              {data.insights.topOverdueGroup && (
                <InsightRow icon={Wallet} to="/invoices?filter=due">
                  {t('analytics.insightOverduePre')} <b>{data.insights.topOverdueGroup.name}</b>
                  {t('analytics.insightOverduePost', { amount: formatMoney(data.insights.topOverdueGroup.amount) })}
                </InsightRow>
              )}
              {data.insights.biggestCollectionChange && (
                <InsightRow
                  icon={data.insights.biggestCollectionChange.pct >= 0 ? TrendingUp : TrendingDown}
                  to="/money"
                >
                  {t('analytics.insightChange', {
                    to: periodLabel(data.insights.biggestCollectionChange.toMonth),
                    dir: data.insights.biggestCollectionChange.pct >= 0 ? t('analytics.changeUp') : t('analytics.changeDown'),
                    pct: Math.abs(data.insights.biggestCollectionChange.pct),
                    from: periodLabel(data.insights.biggestCollectionChange.fromMonth),
                    delta: formatMoney(Math.abs(data.insights.biggestCollectionChange.delta)),
                  })}
                </InsightRow>
              )}
              {data.insights.mostAbsentGroup && (
                <InsightRow icon={UserX} to="/at-risk" last>
                  {t('analytics.insightAbsencePre')} <b>{data.insights.mostAbsentGroup.name}</b>{' '}
                  {t('analytics.insightAbsencePost', { count: data.insights.mostAbsentGroup.absences })}
                  {data.insights.mostAbsentStudent
                    ? t('analytics.insightAbsenceStudent', { name: data.insights.mostAbsentStudent.name, count: data.insights.mostAbsentStudent.absences })
                    : ''}
                  .
                </InsightRow>
              )}
            </Card>
          )}

          {/* بطاقات KPI — إجمالي مدى الفترة المختار */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 rise-in" style={{ animationDelay: '0ms' }}>
            <Kpi value={formatMoney(data.totalCollected)} label={t('analytics.kpiCollectedRange', { range })} />
            <Kpi
              value={data.avgAttendance == null ? '—' : `${data.avgAttendance}%`}
              label={t('analytics.kpiAvgAttendance')}
            />
            <Kpi
              value={formatMoney(data.currentOverdue)}
              label={t('analytics.kpiCurrentOverdue')}
              valueClass={data.currentOverdue > 0 ? 'text-bad-text' : ''}
            />
            <Kpi value={data.activeStudents.toLocaleString('en-US')} label={t('analytics.kpiActiveNow')} />
          </div>

          {/* الرسوم: عمودان على الشاشات الواسعة (R-16) — الأنواع كما هي */}
          <div className="grid gap-3 lg:grid-cols-2">
            <ChartCard title={t('analytics.chartCollectedTitle')} hint={t('analytics.chartCollectedHint')} delay="50ms">
              <CollectedChart months={data.months} />
            </ChartCard>

            <ChartCard
              title={t('analytics.chartAttendanceTitle')}
              hint={t('analytics.chartAttendanceHint')}
              delay="90ms"
            >
              <AttendanceChart months={data.months} />
            </ChartCard>

            <ChartCard
              title={t('analytics.chartOverdueTitle')}
              hint={t('analytics.chartOverdueHint')}
              delay="140ms"
            >
              <OverdueChart months={data.months} />
            </ChartCard>

            <ChartCard
              title={t('analytics.chartGrowthTitle')}
              hint={t('analytics.chartGrowthHint')}
              delay="190ms"
            >
              <GrowthChart months={data.months} />
            </ChartCard>
          </div>
        </>
      ) : null}
    </div>
  )
}
