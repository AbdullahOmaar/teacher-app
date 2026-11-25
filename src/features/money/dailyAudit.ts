import { db } from '../../lib/supabase'
import { diffOf, diffState, fetchDailyClosing } from './cashboxApi'

// ---------------------------------------------------------------------------
// تدقيق اليوم (مهمة 11 — بند 4 / ج11-4): فحص واحد من أربع نقاط على
// بيانات اليوم الحقيقية، يخرج بتقرير من سطر واحد:
// 1) إغلاق اليوم موجود؟ 2) الخزنة مطابقة (فرق الإغلاق = صفر)؟
// 3) إيصالات دفع بلا اعتماد؟ 4) إشعارات Push فاشلة اليوم؟
// الفحص قراءة فقط — لا يغلق يوماً ولا يعتمد إيصالاً ولا يعيد إرسالاً؛
// الإجراءات نفسها تبقى خطوات مقصودة بيد المدرس (docs/TWO-STEP-FOREVER.md).
// ---------------------------------------------------------------------------

export type DailyAuditIssue =
  | 'day-open'
  | 'cashbox-diff'
  | 'pending-proofs'
  | 'failed-notifications'

export interface DailyAuditInput {
  /** إغلاق daily_closings لليوم موجود */
  closingExists: boolean
  /** فرق الخزنة في إغلاق اليوم غير صفري (بلا إغلاق لا فرق يُحكم عليه) */
  cashboxDiffers: boolean
  /** إيصالات دفع بحالة pending */
  pendingProofs: number
  /** صفوف push_delivery_log بحالة failed منذ بداية اليوم */
  failedNotifications: number
}

export interface DailyAuditData extends DailyAuditInput {
  date: string
}

/** القضايا المفتوحة من مدخلات الفحص — دالة نقية بترتيب عرض ثابت */
export function summarizeDailyAudit(input: DailyAuditInput): DailyAuditIssue[] {
  const issues: DailyAuditIssue[] = []
  if (!input.closingExists) issues.push('day-open')
  else if (input.cashboxDiffers) issues.push('cashbox-diff')
  if (input.pendingProofs > 0) issues.push('pending-proofs')
  if (input.failedNotifications > 0) issues.push('failed-notifications')
  return issues
}

/** تشغيل الفحص الحي على بيانات اليوم (قراءات RLS للمالك فقط أصلاً) */
export async function runDailyAudit(teacherId: string, date: string): Promise<DailyAuditData> {
  const closing = await fetchDailyClosing(teacherId, date)
  const cashboxDiffers = closing ? diffState(diffOf(closing).total) !== 'match' : false

  const { count: pendingProofs, error: proofsError } = await db()
    .from('payment_proofs')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', teacherId)
    .eq('status', 'pending')
  if (proofsError) throw proofsError

  // بداية اليوم المحلي بصيغة ISO — created_at خادمية بالتوقيت العالمي
  const dayStartIso = new Date(`${date}T00:00:00`).toISOString()
  const { count: failedNotifications, error: pushError } = await db()
    .from('push_delivery_log')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', teacherId)
    .eq('status', 'failed')
    .gte('created_at', dayStartIso)
  if (pushError) throw pushError

  return {
    date,
    closingExists: Boolean(closing),
    cashboxDiffers,
    pendingProofs: pendingProofs ?? 0,
    failedNotifications: failedNotifications ?? 0,
  }
}
