import { supabase } from '../../lib/supabase'
import type { AttendanceStatus, SessionRow } from '../../types/database'
import { isAttended } from '../attendance/api'

function db() {
  if (!supabase) throw new Error('Supabase غير مربوط — راجع إعدادات .env')
  return supabase
}

// ---------------------------------------------------------------------------
// متابعة الواجبات (خطوة 6 — Phase 2): قراءات فقط فوق نفس جداول الحضور.
//
// الواجب ليس كياناً مستقلاً في المخطط: هو العمود homework_done (boolean)
// في صف attendance نفسه، بجانب status (p/a/l/m أو null = لم يُسجّل) وstarred،
// وصف واحد لكل (session_id, student_id). الكتابة لا تمرّ من هنا إطلاقاً —
// شاشة الواجبات تكتب عبر مسار حفظ الحضور الموحّد (قائمة المزامنة) (نفس الـ
// upsert على المفتاح الأساسي ونفس منطق حذف الصف الفارغ تماماً)، فلا يوجد
// مسار كتابة موازٍ ولا يمكن أن تتناقض الشاشتان.
// ---------------------------------------------------------------------------

const SESSION_COLS =
  'id, teacher_id, group_id, session_date, start_time, duration_minutes, kind, status, origin_session_id, note, created_at, updated_at'

/**
 * حصص مجموعة واحدة — الأحدث أولاً (التاريخ ثم الميعاد تنازلياً).
 * تُستخدم لمنتقي الحصص وللنظرة الإجمالية (نسبة تسليم كل حصة) معاً.
 */
export async function fetchGroupSessions(
  teacherId: string,
  groupId: string,
  limit = 24,
): Promise<SessionRow[]> {
  const { data, error } = await db()
    .from('sessions')
    .select(SESSION_COLS)
    .eq('teacher_id', teacherId)
    .eq('group_id', groupId)
    .order('session_date', { ascending: false })
    .order('start_time', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as SessionRow[]
}

/** علامة واجب/حضور واحدة لطالب في حصة — الحد الأدنى لحساب ملخصات الحصص */
export interface HomeworkMark {
  session_id: string
  student_id: string
  status: AttendanceStatus | null
  homework_done: boolean
}

/** علامات مجموعة حصص دفعة واحدة — لملخصات منتقي الحصص (النظرة الإجمالية) */
export async function fetchHomeworkMarks(
  teacherId: string,
  sessionIds: string[],
): Promise<HomeworkMark[]> {
  if (sessionIds.length === 0) return []
  const { data, error } = await db()
    .from('attendance')
    .select('session_id, student_id, status, homework_done')
    .eq('teacher_id', teacherId)
    .in('session_id', sessionIds)
  if (error) throw error
  return (data ?? []) as unknown as HomeworkMark[]
}

export interface HomeworkSummary {
  /** الحاضرون فعلياً (status في p/l/m — المرجع §2.4): أساس متابعة الواجب */
  attended: number
  /** من الحاضرين: سلّموا الواجب (homework_done = true) */
  submitted: number
  /** من الحاضرين: لسه ما سلّموش — attended - submitted دائماً */
  pending: number
  /** نسبة التسليم % من الحاضرين — null عند غياب أي حاضر (لا نخترع صفراً) */
  rate: number | null
}

/**
 * ملخص واجب من قيم حضور فعّالة: المتابعة للحاضرين أساساً — الغائب (a) ومن
 * بلا حالة (null) لا يدخلون العدّادات أصلاً، مهما كانت قيمة homework_done
 * على صفوفهم (تبقى محفوظة وتظهر، وتُحتسب تلقائياً لو بقوا حاضرين).
 */
export function summarizeHomework(
  values: Iterable<{ status: AttendanceStatus | null; homework_done: boolean }>,
): HomeworkSummary {
  let attended = 0
  let submitted = 0
  for (const v of values) {
    if (!isAttended(v.status)) continue
    attended += 1
    if (v.homework_done) submitted += 1
  }
  return {
    attended,
    submitted,
    pending: attended - submitted,
    rate: attended > 0 ? Math.round((submitted / attended) * 100) : null,
  }
}
