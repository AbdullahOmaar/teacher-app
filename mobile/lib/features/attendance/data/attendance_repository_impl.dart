import 'dart:async';

import 'package:mister/core/data/local_storage_service.dart';
import 'package:mister/core/data/services.dart';
import 'package:mister/features/attendance/data/attendance_repository.dart';
import 'package:mister/features/attendance/domain/models/attendance.dart';
import 'package:mister/features/attendance/domain/sync_engine.dart';
import 'package:mister/features/schedule/data/schedule_repository.dart';
import 'package:mister/features/schedule/domain/models/session.dart';

/// تنفيذ AttendanceRepository — الـSSOT للحضور.
/// الكتابة أونلاين = upsert idempotent على (session_id, student_id)؛
/// القيمة الفارغة تمامًا = حذف الصف (دلالة الويب). الأوفلاين عبر الطابور
/// ومحرك المزامنة — والمالية لا تمر من هنا أبدًا (حضور فقط).
class AttendanceRepositoryImpl implements AttendanceRepository {
  AttendanceRepositoryImpl(
    this._service,
    this._storage,
    this._schedule,
    this._connectivity,
  ) {
    _connectivity.online.listen((isOnline) {
      _setStatus(isOnline ? SyncStatus.idle : SyncStatus.offline);
    });
  }

  final SupabaseService _service;
  final LocalStorageServiceImpl _storage;
  final ScheduleRepository _schedule;
  final ConnectivityService _connectivity;

  static const String attendanceCols =
      'teacher_id, session_id, student_id, status, homework_done, starred, left_at, created_at, updated_at';
  static const String conflictKeys = 'session_id,student_id';

  final StreamController<SyncStatus> _status = StreamController<SyncStatus>.broadcast();
  SyncStatus _current = SyncStatus.idle;

  void _setStatus(SyncStatus next) {
    if (next == _current) return;
    _current = next;
    _status.add(next);
  }

  @override
  Future<List<Session>> todaySessions(String teacherId) {
    final now = DateTime.now();
    final day = DateTime(now.year, now.month, now.day);
    return _schedule.sessionsInRange(teacherId, day, day);
  }

  @override
  Future<List<AttendanceRecord>> roster(String teacherId, String sessionId) async {
    final rows = await _service.select(
      'attendance',
      columns: attendanceCols,
      filters: {'teacher_id': teacherId, 'session_id': sessionId},
    );
    return rows.map(AttendanceRecord.fromJson).toList();
  }

  /// رفع قيمة واحدة — تستخدمه saveValue ومحرك المزامنة معًا.
  Future<void> _uploadValue(
    String teacherId,
    String sessionId,
    String studentId,
    AttendanceValue value,
  ) async {
    if (value.isEmpty) {
      await _service.deleteRow(
        'attendance',
        filters: {'session_id': sessionId, 'student_id': studentId},
      );
      return;
    }
    final record = AttendanceRecord(
      teacherId: teacherId,
      sessionId: sessionId,
      studentId: studentId,
      value: value,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
    await _service.upsertRow('attendance', record.toUpsertRow(), onConflict: conflictKeys);
  }

  @override
  Future<void> saveValue(
    String teacherId,
    String sessionId,
    String studentId,
    AttendanceValue value,
  ) =>
      _uploadValue(teacherId, sessionId, studentId, value);

  @override
  Future<void> enqueue(
    String teacherId,
    String sessionId,
    String studentId,
    AttendanceValue value,
  ) {
    return _storage.enqueueAttendance(
      QueuedAttendanceItem(
        key: QueuedAttendanceItem.keyFor(teacherId, sessionId, studentId),
        teacherId: teacherId,
        sessionId: sessionId,
        studentId: studentId,
        value: value,
        queuedAt: DateTime.now(),
      ),
    );
  }

  @override
  Future<List<QueuedAttendanceItem>> pendingQueue() => _storage.readQueue();

  @override
  Future<SyncResult> syncNow() async {
    _setStatus(SyncStatus.syncing);
    final engine = AttendanceSyncEngine(
      _storage,
      (item) => _uploadValue(item.teacherId, item.sessionId, item.studentId, item.value),
    );
    final result = await engine.drain();
    _setStatus(result.failed > 0 ? SyncStatus.failed : SyncStatus.idle);
    return result;
  }

  @override
  Stream<SyncStatus> get syncStatus => _status.stream;

  @override
  Future<void> markLeft(String teacherId, String sessionId, String studentId) async {
    // الويب: الانصراف يُضبط مرة واحدة فقط (left_at IS NULL) — نحرسه هنا.
    final rows = await _service.select(
      'attendance',
      columns: attendanceCols,
      filters: {'teacher_id': teacherId, 'session_id': sessionId, 'student_id': studentId},
    );
    if (rows.isEmpty) return;
    final current = AttendanceRecord.fromJson(rows.first);
    if (current.leftAt != null) return;
    await _service.updateRow(
      'attendance',
      {'left_at': DateTime.now().toUtc().toIso8601String()},
      filters: {'session_id': sessionId, 'student_id': studentId},
    );
  }
}
