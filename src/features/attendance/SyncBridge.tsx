import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { useOfflineSync } from './useOfflineSync'

/**
 * جسر مزامنة الحضور أوفلاين (خطوة 11): يُركَّب داخل AppShell فيعمل
 * محرك المزامنة طوال جلسة التطبيق — محاولة عند الإقلاع ومحاولة عند كل
 * عودة اتصال — حتى لو لم تُفتح شاشة الحضور أصلاً في هذه الجلسة.
 * لا يرسم شيئاً؛ مؤشرات الحالة تعيش في شاشة الحضور (SyncStatusBar).
 */
export function AttendanceSyncBridge() {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  useOfflineSync(teacherId)
  return null
}
