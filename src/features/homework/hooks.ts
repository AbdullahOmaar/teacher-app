import { useQuery } from '@tanstack/react-query'
import { ATT } from '../attendance/hooks'
import { fetchGroupSessions, fetchHomeworkMarks } from './api'

/**
 * مفاتيح كاش الواجبات تبدأ كلها بـ ATT (نفس بادئة وحدة الحضور) عمداً:
 * حفظ الواجب يتم عبر قائمة مزامنة الحضور، وإبطاله يشمل [ATT]
 * و[HOME] و[SCHED] — فلو عاشت قراءات الواجبات تحت بادئة مستقلة لبقيت
 * قديمة بعد أي حفظ من الشاشتين. بنفس البادئة تتحدث ملخصات الحصص هنا
 * وقوائم الحضور هناك معاً بعد كل تبديل، ولا تتناقض الشاشتان أبداً.
 * والقراءات المشتركة فعلياً (roster الجلسة وحضورها) تُستهلك من hooks
 * الحضور نفسها بنفس المفاتيح حرفياً، لا نسخ موازية لها هنا.
 */

export function useGroupSessions(
  teacherId: string | undefined,
  groupId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [ATT, 'group-sessions', teacherId, groupId],
    enabled: Boolean(teacherId && groupId) && enabled,
    queryFn: () => fetchGroupSessions(teacherId!, groupId!),
  })
}

export function useHomeworkMarks(teacherId: string | undefined, sessionIds: string[]) {
  const key = [...sessionIds].sort().join(',')
  return useQuery({
    queryKey: [ATT, 'homework-marks', teacherId, key],
    enabled: Boolean(teacherId) && sessionIds.length > 0,
    queryFn: () => fetchHomeworkMarks(teacherId!, sessionIds),
  })
}
