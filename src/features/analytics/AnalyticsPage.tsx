import { useState } from 'react'
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
  { value: 3, label: '3 شهور' },
  { value: 6, label: '6 شهور' },
  { value: 12, label: '12 شهر' },
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
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <Card className="mb-0 h-full">
      <div className="type-section mb-0.5">{title}</div>
      <p className="text-muted text-[12.5px] mb-3">{hint}</p>
      {children}
    </Card>
  )
}

/** صف رؤية واحدة داخل بطاقة «أهم 3 رؤى» — برابط حفر مباشر لوجهتها */
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
        <div className="type-section mb-1">التحليلات للمالك فقط</div>
        <p className="text-muted text-[13.5px] mb-0">
          حساب المساعد لا يملك صلاحية مالية — التحليلات تعرض التحصيل والمتأخرات، وهي أقسام
          محجوبة عن المساعد كما في شاشة المصروفات والأرباح.
        </p>
      </Card>
    )
  }

  const data = analyticsQ.data

  return (
    <div className="flex flex-col gap-3">
      {/* اختيار المدى */}
      <div className="flex gap-2" role="group" aria-label="مدى التحليلات">
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
          message={analyticsQ.error?.message ?? 'مشكلة غير معروفة'}
          onRetry={() => void analyticsQ.refetch()}
        />
      ) : data && !data.hasAnyData ? (
        <Card className="p-0">
          <EmptyState
            icon={ChartColumn}
            title="لسه مفيش بيانات للتحليل"
            hint="أول ما تضيف طلاب وتسجّل حضور ودفعات، هتظهر هنا رسوم التحصيل والحضور والمتأخرات ونمو الطلاب."
          />
        </Card>
      ) : data ? (
        <>
          {/* أهم 3 رؤى (W5 — R-14): حتمية من نفس البيانات، فوق الرسوم،
              كل رؤية برابط حفر لوجهة الإجراء */}
          {(data.insights.topOverdueGroup ||
            data.insights.biggestCollectionChange ||
            data.insights.mostAbsentGroup) && (
            <Card className="mb-0">
              <div className="flex items-center gap-2 font-extrabold text-[15px] mb-1">
                <Sparkles size={20} className="text-primary" />
                أهم 3 رؤى
              </div>
              {data.insights.topOverdueGroup && (
                <InsightRow icon={Wallet} to="/invoices?filter=due">
                  أعلى متأخرات في مجموعة <b>{data.insights.topOverdueGroup.name}</b>:{' '}
                  {formatMoney(data.insights.topOverdueGroup.amount)} غير مسددة الآن
                  (أرصدة حالية — كل الشهور).
                </InsightRow>
              )}
              {data.insights.biggestCollectionChange && (
                <InsightRow
                  icon={data.insights.biggestCollectionChange.pct >= 0 ? TrendingUp : TrendingDown}
                  to="/money"
                >
                  أكبر تغيّر في التحصيل: {periodLabel(data.insights.biggestCollectionChange.toMonth)}{' '}
                  {data.insights.biggestCollectionChange.pct >= 0 ? 'زاد' : 'قلّ'}{' '}
                  {Math.abs(data.insights.biggestCollectionChange.pct)}% عن{' '}
                  {periodLabel(data.insights.biggestCollectionChange.fromMonth)} (
                  {formatMoney(Math.abs(data.insights.biggestCollectionChange.delta))}).
                </InsightRow>
              )}
              {data.insights.mostAbsentGroup && (
                <InsightRow icon={UserX} to="/at-risk" last>
                  الأكثر غياباً: مجموعة <b>{data.insights.mostAbsentGroup.name}</b> (
                  {data.insights.mostAbsentGroup.absences} غياب في المدى)
                  {data.insights.mostAbsentStudent
                    ? ` — وأكثر طالب: ${data.insights.mostAbsentStudent.name} (${data.insights.mostAbsentStudent.absences} مرات)`
                    : ''}
                  .
                </InsightRow>
              )}
            </Card>
          )}

          {/* بطاقات KPI — إجمالي مدى الفترة المختار */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi value={formatMoney(data.totalCollected)} label={`تحصيل آخر ${range} شهور`} />
            <Kpi
              value={data.avgAttendance == null ? '—' : `${data.avgAttendance}%`}
              label="متوسط الحضور في المدى"
            />
            <Kpi
              value={formatMoney(data.currentOverdue)}
              label="المتأخرات الحالية (كل الشهور)"
              valueClass={data.currentOverdue > 0 ? 'text-bad-text' : ''}
            />
            <Kpi value={data.activeStudents.toLocaleString('en-US')} label="طلاب نشطون الآن" />
          </div>

          {/* الرسوم: عمودان على الشاشات الواسعة (R-16) — الأنواع كما هي */}
          <div className="grid gap-3 lg:grid-cols-2">
            <ChartCard title="التحصيل الشهري" hint="مجموع الدفعات المسجلة في كل شهر (من ملخص الأرباح الشهري).">
              <CollectedChart months={data.months} />
            </ChartCard>

            <ChartCard
              title="نسبة الحضور الشهرية"
              hint="الحاضرون (حاضر/متأخر/بعذر) من إجمالي التسجيلات في حصص الشهر — الشهر بلا تسجيلات يظهر فجوة لا صفراً."
            >
              <AttendanceChart months={data.months} />
            </ChartCard>

            <ChartCard
              title="المتأخرات عبر الأشهر"
              hint="المتأخرات الحالية الآن موزعة على شهر استحقاق فواتيرها — فواتير أقدم من المدى تدخل في إجمالي البطاقة العليا فقط."
            >
              <OverdueChart months={data.months} />
            </ChartCard>

            <ChartCard
              title="نمو الطلاب"
              hint="أعمدة: طلاب جدد كل شهر. خط: إجمالي الطلاب التراكمي حتى نهاية الشهر."
            >
              <GrowthChart months={data.months} />
            </ChartCard>
          </div>
        </>
      ) : null}
    </div>
  )
}
