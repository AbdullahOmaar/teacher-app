import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { periodLabel } from '../invoices/api'
import { formatMoney } from '../../lib/format'
import type { AnalyticsMonth } from './api'

/*
 * رسوم لوحة التحليلات — Recharts (تُحمَّل كسولاً مع صفحة التحليلات فقط،
 * فلا تدخل الحزمة الأولية). الألوان تُقرأ من متغيرات هوية «نيلي الثقة»
 * في CSS وقت الرسم وتُعاد قراءتها عند تبديل الثيم (مراقبة data-theme)،
 * فتعمل الرسوم في الفاتح والداكن بألوان الهوية نفسها بلا قيم ثابتة.
 * الحاوية dir=ltr لأن محاور الرسوم اتجاهها ثابت هندسياً، بينما كل
 * التسميات عربية (أسماء الشهور من periodLabel) والأرقام غربية
 * tabular-nums من خط التطبيق.
 */

interface ChartColors {
  primary: string
  ok: string
  bad: string
  accent: string
  muted: string
  border: string
  card: string
  text: string
}

function readColors(): ChartColors {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  return {
    primary: v('--primary', '#4f46e5'),
    ok: v('--ok', '#0e9f6e'),
    bad: v('--bad', '#dc2626'),
    accent: v('--accent', '#f59e0b'),
    muted: v('--muted', '#5b6478'),
    border: v('--border', '#e3e6f0'),
    card: v('--card', '#ffffff'),
    text: v('--text', '#141a2e'),
  }
}

function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(readColors)
  useEffect(() => {
    const obs = new MutationObserver(() => setColors(readColors()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return colors
}

interface ChartPoint {
  label: string
  collected: number
  attendanceRate: number | null
  overdue: number
  newStudents: number
  cumulativeStudents: number
}

function toPoints(months: AnalyticsMonth[]): ChartPoint[] {
  return months.map((m) => ({
    label: periodLabel(m.month),
    collected: m.collected,
    attendanceRate: m.attendanceRate,
    overdue: m.overdue,
    newStudents: m.newStudents,
    cumulativeStudents: m.cumulativeStudents,
  }))
}

const AXIS_TICK = { fontSize: 12 } as const

function ChartTooltip({
  active,
  payload,
  label,
  format,
  colors,
}: {
  active?: boolean
  payload?: { name: string; value: number | null; color?: string }[]
  label?: string
  format: (v: number) => string
  colors: ChartColors
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      dir="rtl"
      className="rounded-xl px-3 py-2 text-[13px] shadow-lg"
      style={{ background: colors.card, border: `1px solid ${colors.border}`, color: colors.text }}
    >
      <div className="font-bold mb-0.5">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="tabular-nums" style={{ color: p.color ?? colors.text }}>
          {p.name}: {p.value == null ? 'لا تسجيلات' : format(p.value)}
        </div>
      ))}
    </div>
  )
}

function ChartFrame({ children }: { children: React.ReactNode }) {
  return (
    <div dir="ltr" className="w-full h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  )
}

const moneyTick = (v: number) => v.toLocaleString('en-US')

/** التحصيل الشهري — أعمدة بلون الهوية الأساسي */
export function CollectedChart({ months }: { months: AnalyticsMonth[] }) {
  const c = useChartColors()
  return (
    <ChartFrame>
      <BarChart data={toPoints(months)} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ ...AXIS_TICK, fill: c.muted }} axisLine={{ stroke: c.border }} tickLine={false} />
        <YAxis tick={{ ...AXIS_TICK, fill: c.muted }} axisLine={false} tickLine={false} tickFormatter={moneyTick} width={52} />
        <Tooltip
          cursor={{ fill: c.border, opacity: 0.35 }}
          content={<ChartTooltip format={(v) => formatMoney(v)} colors={c} />}
        />
        <Bar dataKey="collected" name="التحصيل" fill={c.primary} radius={[6, 6, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ChartFrame>
  )
}

/** نسبة الحضور الشهرية — مساحة خضراء، فجوات صادقة عند غياب التسجيل */
export function AttendanceChart({ months }: { months: AnalyticsMonth[] }) {
  const c = useChartColors()
  return (
    <ChartFrame>
      <AreaChart data={toPoints(months)} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ ...AXIS_TICK, fill: c.muted }} axisLine={{ stroke: c.border }} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ ...AXIS_TICK, fill: c.muted }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} width={40} />
        <Tooltip content={<ChartTooltip format={(v) => `${v}%`} colors={c} />} />
        <Area
          type="monotone"
          dataKey="attendanceRate"
          name="نسبة الحضور"
          stroke={c.ok}
          fill={c.ok}
          fillOpacity={0.18}
          strokeWidth={2.5}
          connectNulls={false}
        />
      </AreaChart>
    </ChartFrame>
  )
}

/** المتأخرات الحالية موزعة على أشهر الاستحقاق — أعمدة بلون الخطر */
export function OverdueChart({ months }: { months: AnalyticsMonth[] }) {
  const c = useChartColors()
  return (
    <ChartFrame>
      <BarChart data={toPoints(months)} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ ...AXIS_TICK, fill: c.muted }} axisLine={{ stroke: c.border }} tickLine={false} />
        <YAxis tick={{ ...AXIS_TICK, fill: c.muted }} axisLine={false} tickLine={false} tickFormatter={moneyTick} width={52} />
        <Tooltip
          cursor={{ fill: c.border, opacity: 0.35 }}
          content={<ChartTooltip format={(v) => formatMoney(v)} colors={c} />}
        />
        <Bar dataKey="overdue" name="متأخرات مستحقة" fill={c.bad} radius={[6, 6, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ChartFrame>
  )
}

/** نمو الطلاب — أعمدة الجدد + خط التراكمي */
export function GrowthChart({ months }: { months: AnalyticsMonth[] }) {
  const c = useChartColors()
  return (
    <ChartFrame>
      <ComposedChart data={toPoints(months)} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ ...AXIS_TICK, fill: c.muted }} axisLine={{ stroke: c.border }} tickLine={false} />
        <YAxis tick={{ ...AXIS_TICK, fill: c.muted }} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
        <Tooltip
          cursor={{ fill: c.border, opacity: 0.35 }}
          content={<ChartTooltip format={(v) => v.toLocaleString('en-US')} colors={c} />}
        />
        <Bar dataKey="newStudents" name="طلاب جدد" fill={c.accent} radius={[6, 6, 0, 0]} maxBarSize={44} />
        <Line type="monotone" dataKey="cumulativeStudents" name="الإجمالي التراكمي" stroke={c.primary} strokeWidth={2.5} dot={{ r: 3 }} />
      </ComposedChart>
    </ChartFrame>
  )
}
