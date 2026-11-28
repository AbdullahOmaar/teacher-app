import 'package:mister/features/attendance/domain/models/attendance.dart';
import 'package:mister/features/schedule/domain/models/session.dart';

/// عقود F1-T1 v1.1 (§4) — واجهات Services (عديمة الحالة).
/// الخدمة لا تعرف موديل Domain — تُرجع صفوفًا خامًا؛ الريبو وحده يحوّلها.

/// العميل الوحيد — نظير lib/supabase.ts. يُبنى من إعدادات البيئة (dart-define).
abstract class SupabaseService {
  Future<List<Map<String, dynamic>>> select(String table, {required String columns, required Map<String, Object> filters});
  Future<Map<String, dynamic>?> rpc(String name, Map<String, dynamic> params);
}

/// Drift — الكاش + الطابور (§2-7).
abstract class LocalStorageService {
  Future<void> putCachedSessions(List<Session> sessions);
  Future<List<Session>> cachedSessions(DateTime day);
  Future<void> enqueueAttendance(QueuedAttendanceItem item);
  Future<List<QueuedAttendanceItem>> readQueue();
  Future<void> removeFromQueue(String key);
}

/// flutter_secure_storage — الجلسة فقط (MASVS STORAGE).
abstract class SecureStorageService {
  Future<void> saveSession(String json);
  Future<String?> readSession();

  /// عند تسجيل الخروج / حذف الحساب.
  Future<void> clearAll();
}

/// connectivity_plus.
abstract class ConnectivityService {
  Stream<bool> get online;
}
