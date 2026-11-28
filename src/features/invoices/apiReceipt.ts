// ===========================================================================
// الفواتير — الإيصال: اسم العرض وقالب واتساب وبناء رسالة الإيصال ورابط
// إرسالها. (فُصل من api.ts — برنامج الكود النظيف 2026-11-27، نمط COD-2)
// ===========================================================================

import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import type { I18nKey } from '../../i18n/dict'
import { formatMoney, waLink } from '../../lib/format'
import type { StudentRow } from '../../types/database'
import { periodYm } from './apiHelpers'

// ---------------------------------------------------------------------------
// الإيصال — بيانات العرض ورسالة واتساب (المرجع §3.6 + §5.6)
// ---------------------------------------------------------------------------

export async function fetchTeacherDisplayName(teacherId: string): Promise<string> {
  const { data, error } = await db()
    .from('teachers')
    .select('display_name')
    .eq('id', teacherId)
    .maybeSingle()
  if (error) throw error
  return (data?.display_name ?? '').trim()
}

export async function fetchWhatsappTemplate(teacherId: string): Promise<string | null> {
  const { data, error } = await db()
    .from('teacher_settings')
    .select('whatsapp_template')
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (error) throw error
  const tpl = data?.whatsapp_template
  return tpl?.trim() ? tpl : null
}

export const DEFAULT_WA_TEMPLATE = t('invoices.apiDefaultWaTemplate')

/**
 * مفاتيح متغيرات قالب رسالة الإيصال — المصدر الوحيد للحقيقة: محرك
 * التعويض تحت بيستبدل القايمة دي بالظبط، ومنتقي المفاتيح في محرر
 * القالب (إعدادات التطبيق) بيعرضها هي نفسها — ممنوع نسخة تانية في
 * أي مكان. labelKey هو اسم المتغير العربي على شريحة المنتقي.
 */
export interface ReceiptTemplateKey {
  /** نص المفتاح بأقواسه كما يظهر في نص القالب */
  key: string
  labelKey: I18nKey
}

export const RECEIPT_TEMPLATE_KEYS: readonly ReceiptTemplateKey[] = [
  { key: '{guardian}', labelKey: 'settings.waVarGuardian' },
  { key: '{name}', labelKey: 'settings.waVarStudent' },
  { key: '{period}', labelKey: 'settings.waVarPeriod' },
  { key: '{paid}', labelKey: 'settings.waVarPaid' },
  { key: '{total}', labelKey: 'settings.waVarTotal' },
  { key: '{balance}', labelKey: 'settings.waVarBalance' },
]

/** تعويض متغيرات قالب الإيصال (المرجع §5.6) — {period} بصيغة YYYY-MM */
export function buildReceiptMessage(
  template: string,
  vars: {
    guardian: string
    name: string
    periodMonth: string
    paid: number
    total: number
    balance: number
  },
): string {
  const values: Record<string, string> = {
    '{guardian}': vars.guardian,
    '{name}': vars.name,
    '{period}': periodYm(vars.periodMonth),
    '{paid}': formatMoney(vars.paid),
    '{total}': formatMoney(vars.total),
    '{balance}': formatMoney(vars.balance),
  }
  let out = template
  for (const { key } of RECEIPT_TEMPLATE_KEYS) {
    out = out.replaceAll(key, values[key])
  }
  return out
}

/** رابط إرسال الإيصال عبر واتساب لولي الأمر (guardian_phone وإلا phone) */
export function receiptWaUrl(
  student: Pick<StudentRow, 'guardian_phone' | 'phone'>,
  message: string,
): string | null {
  const base = waLink(student.guardian_phone ?? student.phone)
  if (!base) return null
  return `${base}?text=${encodeURIComponent(message)}`
}
