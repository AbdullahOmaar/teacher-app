import type { BillingType } from '../types/database'

/** أسماء الأيام — الفهرس مطابق لـ Date.getDay() ‏(0 = الأحد) ولأعمدة groups.days */
export const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

export const BILLING_LABELS: Record<BillingType, string> = {
  monthly_fixed: 'شهري ثابت',
  per_session_prepaid: 'بالحصة (مدفوعة مسبقاً)',
  per_session_attended: 'بالحصة (حسب الحضور)',
  weekly_package: 'باقة أسبوعية',
}

export const BILLING_TYPES = Object.keys(BILLING_LABELS) as BillingType[]

/** تنسيق مبلغ: فواصل آلاف + «ج» كما في المرجع */
export function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  return `${(Number.isFinite(n) ? n : 0).toLocaleString('en-US')} ج`
}

/** "HH:MM:SS" → "HH:MM" */
export function shortTime(t: string): string {
  return t.slice(0, 5)
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
    .join('، ')
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
