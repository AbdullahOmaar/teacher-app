import { db } from '../../lib/supabase'
import type { FeedbackKind, FeedbackStatus, TeacherFeedbackRow } from '../../types/database'

// ---------------------------------------------------------------------------
// قناة ملاحظات المدرس (مهمة 11 — 0052): بلا أي دالة Edge بالتصميم.
// الإرسال عبر RPC ‏submit_teacher_feedback (حارس مالك/عضو نشط خادمياً)،
// والقراءة/الحالة بسياسات RLS: مالك فقط — حتى المساعد كاتب الملاحظة
// لا يقرأ قائمة الحساب، وعدّاد غير المقروء يرجع 0 له بفعل RLS نفسها.
// ملاحظة تشغيلية: حتى تُطبَّق 0052 عند بوابة التجميد تفشل هذه النداءات
// بخطأ «الجدول غير موجود» — مصيره المعلن: حالة خطأ صريحة في الصفحة
// برسالة مهذبة مترجمة (لا رسالة قاعدة البيانات الخام أبداً — قاعدة
// المالك 2026-11-26: لا أخطاء خام من أي فيتشر غير مُطلق) وغياب الشارة
// في «المزيد»، بلا أي إخفاء أو قيم وهمية.
// ---------------------------------------------------------------------------

const FEEDBACK_COLS =
  'id, teacher_id, author_user_id, kind, body, status, created_at, updated_at'

/** إرسال ملاحظة جديدة عبر الـ RPC — يرجع صف الملاحظة المنشأة */
export async function submitFeedback(
  teacherId: string,
  kind: FeedbackKind,
  body: string,
): Promise<{ id: string; status: FeedbackStatus }> {
  const { data, error } = await db().rpc('submit_teacher_feedback', {
    p_teacher_id: teacherId,
    p_kind: kind,
    p_body: body,
  })
  if (error) throw error
  const row = data as { id?: unknown; status?: unknown } | null
  return {
    id: typeof row?.id === 'string' ? row.id : '',
    status: row?.status === 'read' || row?.status === 'closed' ? row.status : 'new',
  }
}

/** قائمة ملاحظات الحساب (المالك فقط بفعل RLS) — الأحدث أولاً */
export async function fetchFeedbackList(teacherId: string): Promise<TeacherFeedbackRow[]> {
  const { data, error } = await db()
    .from('teacher_feedback')
    .select(FEEDBACK_COLS)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as TeacherFeedbackRow[]
}

/** عدّاد غير المقروء (status = 'new') — شارة «المزيد» وقائمة المالك */
export async function fetchFeedbackUnreadCount(teacherId: string): Promise<number> {
  const { count, error } = await db()
    .from('teacher_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', teacherId)
    .eq('status', 'new')
  if (error) throw error
  return count ?? 0
}

/** تغيير حالة ملاحظة (مقروءة/مغلقة) — سياسة التحديث للمالك فقط */
export async function setFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  const { error } = await db().from('teacher_feedback').update({ status }).eq('id', id)
  if (error) throw error
}
