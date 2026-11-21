import { t } from '../i18n'
import type { BillingType } from '../types/database'

/** أسماء الأيام — الفهرس مطابق لـ Date.getDay() ‏(0 = الأحد) ولأعمدة groups.days */
export const DAY_NAMES = [
  t('format.daySunday'),
  t('format.dayMonday'),
  t('format.dayTuesday'),
  t('format.dayWednesday'),
  t('format.dayThursday'),
  t('format.dayFriday'),
  t('format.daySaturday'),
]

export const BILLING_LABELS: Record<BillingType, string> = {
  monthly_fixed: t('format.billingMonthlyFixed'),
  per_session_prepaid: t('format.billingPerSessionPrepaid'),
  per_session_attended: t('format.billingPerSessionAttended'),
  weekly_package: t('format.billingWeeklyPackage'),
}

export const BILLING_TYPES = Object.keys(BILLING_LABELS) as BillingType[]

/** تنسيق مبلغ: فواصل آلاف + «ج» كما في المرجع */
export function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  return t('format.moneyAmount', {
    amount: (Number.isFinite(n) ? n : 0).toLocaleString('en-US'),
  })
}

/** "HH:MM:SS" → "HH:MM" */
export function shortTime(t: string): string {
  return t.slice(0, 5)
}

/** لاحقتا ص/م كثوابت وحدة — لأن وسيط formatTime12 نفسه اسمه t */
const AM_SUFFIX = t('format.amSuffix')
const PM_SUFFIX = t('format.pmSuffix')

/**
 * عرض الوقت بصيغة 12 ساعة موحّدة في كل الواجهات: "16:00" → "4:00 م"،
 * "09:30" → "9:30 ص"، "00:15" → "12:15 ص". الأرقام لاتينية دائماً
 * (تتسق مع tabular-nums في بقية الشاشات المالية).
 */
export function formatTime12(t: string): string {
  const [hRaw, mRaw] = shortTime(t).split(':').map(Number)
  const h = Number.isFinite(hRaw) ? hRaw : 0
  const m = Number.isFinite(mRaw) ? mRaw : 0
  const suffix = h < 12 ? AM_SUFFIX : PM_SUFFIX
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** نفس صيغة formatTime12 لكن من كائن Date (أوقات لحظية مثل الانصراف) */
export function formatClock12(d: Date): string {
  return formatTime12(
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  )
}

export function timeToMin(t: string): number {
  const [h, m] = shortTime(t).split(':').map(Number)
  return h * 60 + (m || 0)
}

/** أسماء أيام مجموعة بصيغة مختصرة للعرض */
export function daysLabel(days: number[]): string {
  if (!days.length) return '—'
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d])
    .join(t('format.daysSeparator'))
}

/**
 * رابط خارجي آمن للعرض كـ href (روابط المجموعات): يُقبل http/https فقط.
 * أي scheme آخر (javascript:/data:/…) أو نص غير صالح كرابط يُرفض (null) —
 * حماية من XSS مخزّن عبر روابط حرة النص تصل لبوابات عامة (مراجعة أمان C-01).
 */
export function safeExternalUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const u = new URL(t)
    return u.protocol === 'https:' || u.protocol === 'http:' ? t : null
  } catch {
    return null
  }
}

/** تحويل رقم هاتف مصري لصيغة wa.me الدولية (افتراضي +20) */
export function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = '20' + digits.slice(1)
  return `https://wa.me/${digits}`
}

/**
 * تاريخ+وقت بصيغة عربية متوسطة (COD-3: كانت 3 نسخ محلية). عند قيمة
 * غير صالحة يُعاد البديل — افتراضياً أول 10 أحرف من النص كما هو.
 */
export function formatDateTimeAr(iso: string, fallback?: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return fallback ?? iso.slice(0, 10)
  return d.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
}
