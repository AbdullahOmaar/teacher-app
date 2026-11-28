import 'package:mister/features/attendance/domain/models/attendance.dart';
import 'package:mister/features/schedule/domain/models/session.dart';

/// عقود F1-T1 v1.1 (§3) — واجهة AttendanceRepository.
/// الـSSOT للحضور — الكاش والطابور هنا لا في الشاشة.
abstract class AttendanceRepository {
  Future<List<Session>> todaySessions(String teacherId);
  Future<List<AttendanceRecord>> roster(String teacherId, String sessionId);
  Future<void> saveValue(String teacherId, String sessionId, String studentId,
      AttendanceValue value,);

  // --- الأوفلاين ---
  Future<void> enqueue(String teacherId, String sessionId, String studentId,
      AttendanceValue value,);
  Future<List<QueuedAttendanceItem>> pendingQueue();

  /// تصريف الطابور بالترتيب — §2-7.
  Future<SyncResult> syncNow();
  Stream<SyncStatus> get syncStatus;

  /// left_at (0012).
  Future<void> markLeft(String teacherId, String sessionId, String studentId);
}
