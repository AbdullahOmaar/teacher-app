import { t } from '../../i18n'
import { db } from '../../lib/supabase'
import { friendlyDbError } from '../../lib/supabaseErrors'
import { logActivity } from '../activity/api'
import type {
  EnrollmentRow,
  GroupInput,
  GroupRow,
  GroupWaitlistRow,
  Tables,
  WaitlistInput,
  WaitlistSource,
} from '../../types/database'

const GROUP_COLS =
  'id, teacher_id, name, billing_type, price, days, start_time, duration_minutes, room, capacity, assistant_name, links, archived_at, created_at, updated_at'
const ENROLLMENT_COLS = 'id, teacher_id, student_id, group_id, price_override, prepaid_sessions, created_at'
const WAITLIST_COLS = 'id, teacher_id, group_id, name, phone, note, source, wants_trial, created_at'

/**
 * صف انتظار من العميل الم typed: ‏source نص في الأنواع المولّدة ومقيّد
 * بقيد CHECK في المخطط (group_waitlist_source_check) لقيمتي
 * WaitlistSource — التضييق هنا توثيق لذلك القيد.
 */
function toWaitlistRow(r: Tables<'group_waitlist'>): GroupWaitlistRow {
  return { ...r, source: r.source as WaitlistSource }
}

export async function fetchGroups(teacherId: string): Promise<GroupRow[]> {
  const { data, error } = await db()
    .from('groups')
    .select(GROUP_COLS)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchGroup(teacherId: string, groupId: string): Promise<GroupRow | null> {
  const { data, error } = await db()
    .from('groups')
    .select(GROUP_COLS)
    .eq('teacher_id', teacherId)
    .eq('id', groupId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function createGroup(teacherId: string, input: GroupInput): Promise<GroupRow> {
  const { data, error } = await db()
    .from('groups')
    .insert({ teacher_id: teacherId, ...input })
    .select(GROUP_COLS)
    .single()
  if (error) throw friendlyDbError(error, t('common.saveError'), t('common.saveBlockedByMissingLink'))
  return data
}

export async function updateGroup(
  teacherId: string,
  groupId: string,
  input: GroupInput,
): Promise<GroupRow> {
  const { data, error } = await db()
    .from('groups')
    .update(input)
    .eq('teacher_id', teacherId)
    .eq('id', groupId)
    .select(GROUP_COLS)
    .single()
  if (error) throw friendlyDbError(error, t('common.saveError'), t('common.saveBlockedByMissingLink'))
  return data
}

/** قائمة طلاب مجموعة (roster): تسجيلات المجموعة مرتبطة ببيانات الطلاب */
export async function fetchGroupRoster(
  teacherId: string,
  groupId: string,
): Promise<(EnrollmentRow & { student_name: string; student_code: string; student_paused: boolean })[]> {
  const { data, error } = await db()
    .from('enrollments')
    .select(`${ENROLLMENT_COLS}, students(name, public_code, paused)`)
    .eq('teacher_id', teacherId)
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => {
    const st = row.students
    return {
      ...row,
      student_name: st?.name ?? '—',
      student_code: st?.public_code ?? '',
      student_paused: Boolean(st?.paused),
    }
  })
}

export async function fetchWaitlist(teacherId: string, groupId: string): Promise<GroupWaitlistRow[]> {
  const { data, error } = await db()
    .from('group_waitlist')
    .select(WAITLIST_COLS)
    .eq('teacher_id', teacherId)
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toWaitlistRow)
}

export async function addWaitlistEntry(
  teacherId: string,
  groupId: string,
  input: WaitlistInput,
): Promise<GroupWaitlistRow> {
  const { data, error } = await db()
    .from('group_waitlist')
    .insert({ teacher_id: teacherId, group_id: groupId, ...input })
    .select(WAITLIST_COLS)
    .single()
  if (error) throw friendlyDbError(error, t('common.saveError'), t('common.saveBlockedByMissingLink'))
  return toWaitlistRow(data)
}

/** حذف طلب انتظار (رفض طلب حجز أو إزالة اسم يدوياً) */
export async function deleteWaitlistEntry(teacherId: string, entryId: string): Promise<void> {
  const { error } = await db()
    .from('group_waitlist')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('id', entryId)
  if (error) throw friendlyDbError(error, t('common.deleteError'))
}

/**
 * قبول طلب انتظار: يتحول لطالب مسجل في مجموعة الطلب نفسها — يُنشأ الطالب
 * (رقم الانتظار هو موبايل ولي الأمر)، يُسجَّل في المجموعة، ثم يُحذف طلب
 * الانتظار. طلب الحصة التجريبية وملاحظة ولي الأمر تنتقلان لملاحظة مستوى
 * الطالب حتى لا تضيعا. عند فشل أي خطوة بعد إنشاء الطالب يبقى الطلب في
 * مكانه ليعيد المدرس المحاولة (التسجيل upsert آمن التكرار).
 */
export async function acceptWaitlistEntry(
  teacherId: string,
  entry: GroupWaitlistRow,
): Promise<{ studentId: string }> {
  const { createStudent, upsertEnrollment } = await import('../students/api')
  const levelBits = [
    entry.wants_trial ? t('groups.apiTrialNote') : null,
    entry.source === 'booking_page' && entry.note ? t('groups.apiBookingNote', { note: entry.note }) : entry.note,
  ].filter(Boolean)
  const student = await createStudent(teacherId, {
    name: entry.name,
    grade: null,
    school: null,
    phone: null,
    guardian_name: null,
    guardian_phone: entry.phone,
    level_note: levelBits.length ? levelBits.join(' — ') : null,
    paused: false,
  })
  await upsertEnrollment(teacherId, {
    student_id: student.id,
    group_id: entry.group_id,
    price_override: null,
    prepaid_sessions: null,
  })
  await deleteWaitlistEntry(teacherId, entry.id)
  return { studentId: student.id }
}

// ---------------------------------------------------------------------------
// حذف / أرشفة آمنة (Phase 2 — خطوة 10)
//
// قواعد المجموعة:
// - الأرشفة (groups.archived_at من 0007): تتوقف المجموعة عن توليد حصص
//   جديدة (حارس في RPC generate_group_sessions + تصفية ensureSessionsGenerated)
//   ولا تظهر كخيار تسجيل جديد، وتبقى كل بياناتها التاريخية سليمة.
// - الحذف النهائي لمجموعة فارغة تماماً فقط: لا تسجيلات ولا حصص ولا فواتير
//   ولا تقييمات. أي تاريخ ⇒ أرشفة فقط. والقاعدة تحرس أيضاً:
//   invoices.group_id بقيد on delete restrict يمنع حذف أي مجموعة لها فواتير.
// - عند حذف مجموعة فارغة إلا من قائمة الانتظار، تُحذف أسماء الانتظار معها
//   (on delete cascade) — ويُذكر ذلك صراحة في شاشة التأكيد قبل التنفيذ.
// - لا تُحذف أي فاتورة أو دفعة من هذا المسار إطلاقاً.
// ---------------------------------------------------------------------------

export interface GroupFootprint {
  enrollmentCount: number
  sessionCount: number
  invoiceCount: number
  assessmentCount: number
  waitlistCount: number
  /** الحذف النهائي مسموح فقط لمجموعة بلا أي تاريخ تشغيلي أو مالي */
  canDelete: boolean
}

/** الجداول القابلة للعدّ في بصمة المجموعة — كلها تحمل teacher_id وgroup_id */
type GroupCountTable = 'enrollments' | 'sessions' | 'invoices' | 'assessments' | 'group_waitlist'

async function countGroupRows(
  table: GroupCountTable,
  teacherId: string,
  groupId: string,
): Promise<number> {
  const { count, error } = await db()
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('teacher_id', teacherId)
    .eq('group_id', groupId)
  if (error) throw error
  return count ?? 0
}

/** بصمة المجموعة: ما يرتبط بها فعلياً — أساس قرار «حذف نهائي أم أرشفة فقط» */
export async function fetchGroupFootprint(
  teacherId: string,
  groupId: string,
): Promise<GroupFootprint> {
  const [enrollmentCount, sessionCount, invoiceCount, assessmentCount, waitlistCount] =
    await Promise.all([
      countGroupRows('enrollments', teacherId, groupId),
      countGroupRows('sessions', teacherId, groupId),
      countGroupRows('invoices', teacherId, groupId),
      countGroupRows('assessments', teacherId, groupId),
      countGroupRows('group_waitlist', teacherId, groupId),
    ])
  return {
    enrollmentCount,
    sessionCount,
    invoiceCount,
    assessmentCount,
    waitlistCount,
    canDelete:
      enrollmentCount === 0 && sessionCount === 0 && invoiceCount === 0 && assessmentCount === 0,
  }
}

/** أرشفة مجموعة (archived=true) أو إلغاء أرشفتها — البيانات التاريخية لا تُمس */
export async function setGroupArchived(
  teacherId: string,
  groupId: string,
  archived: boolean,
): Promise<void> {
  const before = await fetchGroup(teacherId, groupId).catch(() => null)
  const { error } = await db()
    .from('groups')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('teacher_id', teacherId)
    .eq('id', groupId)
  if (error) throw friendlyDbError(error, t('common.saveError'), t('common.saveBlockedByMissingLink'))
  void logActivity(teacherId, {
    event_type: archived ? 'group_archived' : 'group_unarchived',
    entity_type: 'group',
    entity_id: groupId,
    entity_label: before?.name ?? null,
    details: {},
  })
}

/**
 * حذف نهائي لمجموعة فارغة تماماً. وجود فاتورة يمنعه بقيد restrict في
 * القاعدة فيظهر سبب واضح؛ وبقية الروابط (انتظار فقط عملياً عند هذه النقطة)
 * تُحذف cascade.
 */
export async function deleteGroup(teacherId: string, groupId: string): Promise<void> {
  const before = await fetchGroup(teacherId, groupId).catch(() => null)
  const { error } = await db()
    .from('groups')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('id', groupId)
  if (error) throw friendlyDbError(error, t('groups.apiDeleteGroupError'))
  void logActivity(teacherId, {
    event_type: 'group_deleted',
    entity_type: 'group',
    entity_id: groupId,
    entity_label: before?.name ?? null,
    details: {},
  })
}

/** عدّاد طلاب كل مجموعة (لبطاقات القائمة وشريط السعة) */
export function countByGroup(enrollments: EnrollmentRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const e of enrollments) map.set(e.group_id, (map.get(e.group_id) ?? 0) + 1)
  return map
}
