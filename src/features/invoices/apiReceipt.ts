// ===========================================================================
// الفواتير — الإيصال: اسم العرض وقالب واتساب وبناء رسالة الإيصال ورابط
// إرسالها. (فُصل من api.ts — برنامج الكود النظيف 2026-11-27، نمط COD-2)
// ===========================================================================

import { db } from '../../lib/supabase'
import { t } from '../../i18n'
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
  return template
    .replaceAll('{guardian}', vars.guardian)
    .replaceAll('{name}', vars.name)
    .replaceAll('{period}', periodYm(vars.periodMonth))
    .replaceAll('{paid}', formatMoney(vars.paid))
    .replaceAll('{total}', formatMoney(vars.total))
    .replaceAll('{balance}', formatMoney(vars.balance))
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
