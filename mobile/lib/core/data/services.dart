import 'package:mister/features/attendance/domain/models/attendance.dart';
import 'package:mister/features/schedule/domain/models/session.dart';

/// عقود F1-T1 v1.1 (§4) — واجهات Services (عديمة الحالة).
/// الخدمة لا تعرف موديل Domain — تُرجع صفوفًا خامًا؛ الريبو وحده يحوّلها.

/// العميل الوحيد — نظير lib/supabase.ts. يُبنى من إعدادات البيئة (dart-define).
/// كل أخطائه تخرج AppError بمفتاح ARB (عقود §5) — لا استثناء خام يعبر للريبو.
abstract class SupabaseService {
  /// معرّف المستخدم الحالي من جلسة Auth (null = لا جلسة).
  String? get currentUserId;

  /// قراءة مرتبة بـ created_at تصاعديًا (افتراضي الويب للقوائم).
  Future<List<Map<String, dynamic>>> select(String table,
      {required String columns, required Map<String, Object> filters,});

  /// قراءة بلا ترتيب افتراضي (views وقوائم خاصة).
  Future<List<Map<String, dynamic>>> selectUnordered(String table,
      {required String columns, required Map<String, Object> filters,});

  /// قراءة بنطاق على عمود (gte/lte) + فلاتر مساواة — لاستعلامات الحصص بالتاريخ.
  Future<List<Map<String, dynamic>>> selectRange(
    String table, {
    required String columns,
    required Map<String, Object> filters,
    required String rangeColumn,
    required Object from,
    required Object to,
  });

  /// قراءة بفلتر «ضمن قائمة» على عمود (in) + فلاتر مساواة.
  Future<List<Map<String, dynamic>>> selectIn(
    String table, {
    required String columns,
    required Map<String, Object> filters,
    required String inColumn,
    required List<Object> inValues,
  });

  /// إدخال أو تحديث عند التعارض (idempotent) — لمزامنة الحضور.
  Future<void> upsertRow(String table, Map<String, dynamic> values,
      {required String onConflict,});

  Future<Map<String, dynamic>> insertRow(
      String table, Map<String, dynamic> values,);
  Future<Map<String, dynamic>> updateRow(
      String table, Map<String, dynamic> values,
      {required Map<String, Object> filters,});
  Future<void> deleteRow(String table, {required Map<String, Object> filters});
  Future<Map<String, dynamic>?> rpc(String name, Map<String, dynamic> params);
  Future<List<Map<String, dynamic>>> rpcList(
      String name, Map<String, dynamic> params,);
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
