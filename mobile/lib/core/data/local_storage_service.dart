import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:mister/core/data/app_database.dart';
import 'package:mister/core/data/local_cache.dart';
import 'package:mister/core/data/services.dart';
import 'package:mister/features/attendance/domain/models/attendance.dart';
import 'package:mister/features/schedule/domain/models/session.dart';

/// مخزن الطابور الخام — يستخدمه محرك المزامنة لحفظ المحاولات/الفشل.
abstract class AttendanceQueueStore {
  Future<List<QueuedAttendanceItem>> readQueue();
  Future<void> saveQueueItem(QueuedAttendanceItem item);
  Future<void> removeFromQueue(String key);
}

/// تنفيذ LocalStorageService على Drift — كاش الحصص عبر LocalCache
/// وطابور الحضور في جدوله. دلالات الطابور من الويب (offlineQueue.ts):
/// إعادة وضع نفس المفتاح = آخر قيمة تفوز (LWW) مع تصفير المحاولات،
/// إلا لو القيمة نفسها والعنصر غير فاشل ⇒ لا تغيير (منع الاهتزاز).
class LocalStorageServiceImpl implements LocalStorageService, AttendanceQueueStore {
  LocalStorageServiceImpl(this._db) : _cache = LocalCache(_db);

  final AppDatabase _db;
  final LocalCache _cache;

  // --- كاش الحصص ---

  @override
  Future<void> putCachedSessions(List<Session> sessions) async {
    final byTeacher = <String, List<Map<String, dynamic>>>{};
    for (final s in sessions) {
      byTeacher.putIfAbsent(s.teacherId, () => []).add(s.toJson());
    }
    for (final entry in byTeacher.entries) {
      await _cache.putAll('session', entry.key, entry.value);
    }
  }

  @override
  Future<List<Session>> cachedSessions(DateTime day) async {
    final rows = await _cache.getAllAcrossTeachers('session');
    final target =
        '${day.year.toString().padLeft(4, '0')}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
    return rows
        .where((r) => (r['session_date'] as String).startsWith(target))
        .map(Session.fromJson)
        .toList();
  }

  // --- طابور الحضور ---

  QueuedAttendanceItem _toItem(AttendanceQueueItem row) => QueuedAttendanceItem(
        key: row.key,
        teacherId: row.teacherId,
        sessionId: row.sessionId,
        studentId: row.studentId,
        value: AttendanceValue.fromJson(
          (jsonDecode(row.payload) as Map).cast<String, dynamic>(),
        ),
        queuedAt: row.queuedAt,
        attempts: row.attempts,
        lastError: row.lastError,
        failed: row.failed,
      );

  AttendanceQueueItemsCompanion _toRow(QueuedAttendanceItem item) =>
      AttendanceQueueItemsCompanion.insert(
        key: item.key,
        teacherId: item.teacherId,
        sessionId: item.sessionId,
        studentId: item.studentId,
        payload: jsonEncode(item.value.toJson()),
        queuedAt: item.queuedAt,
        attempts: Value(item.attempts),
        lastError: Value(item.lastError),
        failed: Value(item.failed),
      );

  @override
  Future<void> enqueueAttendance(QueuedAttendanceItem item) async {
    final existing = await (_db.select(_db.attendanceQueueItems)
          ..where((t) => t.key.equals(item.key)))
        .getSingleOrNull();
    if (existing != null) {
      final current = _toItem(existing);
      // نفس القيمة وغير فاشل ⇒ لا تغيير (دلالة الويب حرفيًا).
      if (current.value == item.value && !current.failed) return;
    }
    await saveQueueItem(item.copyWith(attempts: 0, lastError: null, failed: false));
  }

  @override
  Future<List<QueuedAttendanceItem>> readQueue() async {
    final query = _db.select(_db.attendanceQueueItems)
      ..orderBy([(t) => OrderingTerm.asc(t.queuedAt)]);
    final rows = await query.get();
    return rows.map(_toItem).toList();
  }

  @override
  Future<void> saveQueueItem(QueuedAttendanceItem item) {
    return _db.into(_db.attendanceQueueItems).insertOnConflictUpdate(_toRow(item));
  }

  @override
  Future<void> removeFromQueue(String key) {
    return (_db.delete(_db.attendanceQueueItems)..where((t) => t.key.equals(key))).go();
  }
}
