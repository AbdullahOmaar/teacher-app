import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mister/core/data/app_database.dart';
import 'package:mister/core/data/local_storage_service.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/features/attendance/domain/models/attendance.dart';
import 'package:mister/features/attendance/domain/qr_attendance.dart';
import 'package:mister/features/attendance/domain/sync_engine.dart';
import 'package:mister/features/students/domain/models/student.dart';

QueuedAttendanceItem item(
  String studentId, {
  AttendanceValue value = const AttendanceValue(status: AttendanceStatus.present),
  int attempts = 0,
  bool failed = false,
  DateTime? queuedAt,
}) =>
    QueuedAttendanceItem(
      key: QueuedAttendanceItem.keyFor('t1', 'sess1', studentId),
      teacherId: 't1',
      sessionId: 'sess1',
      studentId: studentId,
      value: value,
      queuedAt: queuedAt ?? DateTime(2026, 1, 1, 10),
      attempts: attempts,
      failed: failed,
    );

/// مخزن طابور في الذاكرة — لنفس واجهة الإنتاج.
class MemoryQueueStore implements AttendanceQueueStore {
  final Map<String, QueuedAttendanceItem> rows = {};

  @override
  Future<List<QueuedAttendanceItem>> readQueue() async {
    final list = rows.values.toList()..sort((a, b) => a.queuedAt.compareTo(b.queuedAt));
    return list;
  }

  @override
  Future<void> saveQueueItem(QueuedAttendanceItem item) async => rows[item.key] = item;

  @override
  Future<void> removeFromQueue(String key) async => rows.remove(key);
}

void main() {
  group('AttendanceSyncEngine (web offlineQueue semantics)', () {
    test('drains in order and removes synced items', () async {
      final store = MemoryQueueStore();
      await store.saveQueueItem(item('s1', queuedAt: DateTime(2026, 1, 1, 10)));
      await store.saveQueueItem(item('s2', queuedAt: DateTime(2026, 1, 1, 9)));
      final uploaded = <String>[];
      final engine = AttendanceSyncEngine(store, (i) async => uploaded.add(i.studentId));
      final result = await engine.drain();
      expect(uploaded, ['s2', 's1']); // الأقدم أولًا
      expect(result.synced, 2);
      expect(result.failed, 0);
      expect(store.rows, isEmpty);
    });

    test('network failure stops the drain and counts NO attempt', () async {
      final store = MemoryQueueStore();
      await store.saveQueueItem(item('s1'));
      await store.saveQueueItem(item('s2'));
      var calls = 0;
      final engine = AttendanceSyncEngine(store, (i) async {
        calls++;
        throw AppError.network();
      });
      final result = await engine.drain();
      expect(calls, 1); // توقف عند أول عنصر
      expect(result.synced, 0);
      expect(store.rows['t1:sess1:s1']!.attempts, 0);
      expect(store.rows.length, 2);
    });

    test('non-network failure increments attempts; 3rd marks failed with the ARB key', () async {
      final store = MemoryQueueStore();
      await store.saveQueueItem(item('s1', attempts: 2));
      final engine = AttendanceSyncEngine(
        store,
        (i) async => throw const AppError(kind: AppErrorKind.conflict, arbKey: 'common_duplicate_entry'),
      );
      final result = await engine.drain();
      final saved = store.rows['t1:sess1:s1']!;
      expect(saved.attempts, 3);
      expect(saved.failed, isTrue);
      expect(saved.lastError, 'common_duplicate_entry'); // مفتاح ARB — لا نص خام
      expect(result.failed, 1);
    });

    test('already-failed items are counted, never retried', () async {
      final store = MemoryQueueStore();
      await store.saveQueueItem(item('s1', attempts: 3, failed: true));
      var calls = 0;
      final engine = AttendanceSyncEngine(store, (i) async => calls++);
      final result = await engine.drain();
      expect(calls, 0);
      expect(result.failed, 1);
      expect(store.rows.length, 1);
    });
  });

  group('LocalStorageServiceImpl queue (Drift, in-memory)', () {
    late AppDatabase db;
    late LocalStorageServiceImpl storage;

    setUp(() {
      db = AppDatabase(NativeDatabase.memory());
      storage = LocalStorageServiceImpl(db);
    });
    tearDown(() => db.close());

    test('enqueue dedupe: same value is a no-op; new value wins (LWW) and resets attempts', () async {
      await storage.enqueueAttendance(item('s1'));
      final first = (await storage.readQueue()).single;
      await storage.enqueueAttendance(item('s1')); // نفس القيمة
      var queue = await storage.readQueue();
      expect(queue.length, 1);
      expect(queue.single.queuedAt, first.queuedAt); // لم يتغير

      // محاكاة فشل سابق ثم قيمة جديدة ⇒ تصفير
      await storage.saveQueueItem(item('s1', attempts: 2));
      await storage.enqueueAttendance(
        item('s1', value: const AttendanceValue(status: AttendanceStatus.absent)),
      );
      queue = await storage.readQueue();
      expect(queue.single.value.status, AttendanceStatus.absent);
      expect(queue.single.attempts, 0);
      expect(queue.single.failed, isFalse);
    });

    test('readQueue is ordered by queuedAt and removeFromQueue works', () async {
      await storage.enqueueAttendance(item('s2', queuedAt: DateTime(2026, 1, 1, 11)));
      await storage.enqueueAttendance(item('s1', queuedAt: DateTime(2026, 1, 1, 9)));
      final queue = await storage.readQueue();
      expect(queue.map((i) => i.studentId), ['s1', 's2']);
      await storage.removeFromQueue(queue.first.key);
      expect((await storage.readQueue()).length, 1);
    });
  });

  group('QrAttendance (web qr.ts semantics)', () {
    Student student(String id, String code) => Student(
          id: id,
          teacherId: 't1',
          publicCode: code,
          name: 'طالب $id',
          createdAt: DateTime(2026),
          updatedAt: DateTime(2026),
        );

    test('normalize trims, strips #, removes spaces, uppercases; empty → null', () {
      expect(QrAttendance.normalizeScannedCode('  #ab cd12 '), 'ABCD12');
      expect(QrAttendance.normalizeScannedCode('   '), isNull);
    });

    test('matches only roster students; unknown code → null (no marking)', () {
      final roster = [student('s1', 'ABCD1234'), student('s2', 'WXYZ9876')];
      expect(QrAttendance.findStudentByCode(roster, '#abcd1234')?.id, 's1');
      expect(QrAttendance.findStudentByCode(roster, 'NOPE0000'), isNull);
    });

    test('cooldown blocks the same code for 3s but never a different code', () {
      const last = (code: 'ABCD1234', atMs: 10000);
      expect(QrAttendance.shouldAcceptScan(last, 'ABCD1234', nowMs: 12000), isFalse);
      expect(QrAttendance.shouldAcceptScan(last, 'ABCD1234', nowMs: 13000), isTrue);
      expect(QrAttendance.shouldAcceptScan(last, 'WXYZ9876', nowMs: 10001), isTrue);
      expect(QrAttendance.shouldAcceptScan(null, 'ABCD1234', nowMs: 0), isTrue);
    });
  });
}
