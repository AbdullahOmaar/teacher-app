// ===========================================================================
// الفواتير — تسوية الحضور: قراءة حضور شهر الفاتورة وتطبيق فرق الحضور كبند
// تسوية على فواتير per_session_attended. (فُصل من api.ts — برنامج الكود
// النظيف 2026-11-27، نمط COD-2)
// ===========================================================================

import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import { friendlyDbError } from '../../lib/supabaseErrors'
import type { AttendanceStatus } from '../../types/database'
import { monthEndStr, monthStartStr, todayStr } from '../home/api'
import { isAttended, saveAttendance } from '../attendance/api'
import type { InvoiceListItem } from './apiQueries'

// ---------------------------------------------------------------------------
// تسوية حضور — لفواتير per_session_attended فقط (المرجع §5.3):
// تغيير حالة الحضور لا يعدّل البند الأساسي؛ الفرق × السعر الفعّال يُضاف
// كبند تسوية (line_type='adjustment') بسبب إلزامي، والحالة تُحدَّث فعلياً.
// ---------------------------------------------------------------------------

export interface InvoiceMonthSession {
  session_id: string
  session_date: string
  start_time: string
  status: AttendanceStatus | null
  homework_done: boolean
  starred: boolean
}

export async function fetchInvoiceMonthAttendance(
  teacherId: string,
  invoice: { student_id: string; group_id: string; period_month: string },
): Promise<InvoiceMonthSession[]> {
  const period = monthStartStr(invoice.period_month)
  const periodEnd = monthEndStr(period)
  const today = todayStr()
  const upper = periodEnd < today ? periodEnd : today
  if (upper < period) return []

  const { data: sess, error: sessErr } = await db()
    .from('sessions')
    .select('id, session_date, start_time')
    .eq('teacher_id', teacherId)
    .eq('group_id', invoice.group_id)
    .gte('session_date', period)
    .lte('session_date', upper)
    .order('session_date', { ascending: true })
    .order('start_time', { ascending: true })
  if (sessErr) throw sessErr
  const sessions = sess ?? []
  if (sessions.length === 0) return []

  const { data: att, error: attErr } = await db()
    .from('attendance')
    .select('session_id, status, homework_done, starred')
    .eq('teacher_id', teacherId)
    .eq('student_id', invoice.student_id)
    .in(
      'session_id',
      sessions.map((s) => s.id),
    )
  if (attErr) throw attErr
  const bySession = new Map(
    (att ?? []).map((a) => [a.session_id, a]),
  )
  return sessions.map((s) => {
    const a = bySession.get(s.id)
    return {
      session_id: s.id,
      session_date: s.session_date,
      start_time: s.start_time,
      status: a?.status ?? null,
      homework_done: a?.homework_done ?? false,
      starred: a?.starred ?? false,
    }
  })
}

export async function applyAttendanceAdjustment(
  teacherId: string,
  invoice: InvoiceListItem,
  session: InvoiceMonthSession,
  newStatus: AttendanceStatus,
  reason: string,
): Promise<{ delta: number }> {
  const trimmed = reason.trim()
  if (!trimmed) throw new Error(t('invoices.apiErrorAdjustmentReason'))

  // السعر الفعّال من التسجيل (price_override وإلا سعر المجموعة)
  const { data: enr, error: enrErr } = await db()
    .from('enrollments')
    .select('price_override, groups(price)')
    .eq('teacher_id', teacherId)
    .eq('student_id', invoice.student_id)
    .eq('group_id', invoice.group_id)
    .maybeSingle()
  if (enrErr) throw enrErr
  const enrRow = enr
  const price = enrRow?.price_override ?? Number(enrRow?.groups?.price ?? 0)

  const delta =
    (isAttended(newStatus) ? 1 : 0) - (isAttended(session.status) ? 1 : 0)
  const deltaAmount = delta * price

  // تحديث حالة الحضور نفسها (مع الحفاظ على الواجب والتمييز)
  await saveAttendance(teacherId, session.session_id, invoice.student_id, {
    status: newStatus,
    homework_done: session.homework_done,
    starred: session.starred,
  })

  if (deltaAmount !== 0) {
    const { error } = await db().from('invoice_lines').insert({
      teacher_id: teacherId,
      invoice_id: invoice.invoice_id,
      line_type: 'adjustment',
      description: t('invoices.apiAdjustmentDesc', { date: session.session_date }),
      amount: deltaAmount,
      reason: trimmed,
    })
    if (error) throw friendlyDbError(error, t('common.saveError'), t('common.saveBlockedByMissingLink'))
  }
  return { delta: deltaAmount }
}

