import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mister/core/data/app_database.dart';
import 'package:mister/core/data/local_cache.dart';
import 'package:mister/core/data/services.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/core/error/supabase_error_mapper.dart';
import 'package:mister/features/groups/data/groups_repository_impl.dart';
import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/features/schedule/data/schedule_repository_impl.dart';
import 'package:mister/features/students/data/students_repository_impl.dart';
import 'package:mister/features/students/domain/models/student.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// خدمة وهمية: صفوف جاهزة + تسجيل النداءات + خطأ عند الطلب.
class FakeSupabaseService implements SupabaseService {
  @override
  String? get currentUserId => 'user-1';

  final Map<String, List<Map<String, dynamic>>> tables = {};
  final List<({String table, Map<String, dynamic> values})> inserts = [];
  final List<({String name, Map<String, dynamic> params})> rpcCalls = [];
  String? lastRangeColumn;
  Object? lastRangeFrom;
  Object? lastRangeTo;
  Object? errorToThrow;

  void _maybeThrow() {
    final e = errorToThrow;
    if (e != null) throw e;
  }

  @override
  Future<List<Map<String, dynamic>>> select(String table,
      {required String columns, required Map<String, Object> filters,}) async {
    _maybeThrow();
    return tables[table] ?? const [];
  }

  @override
  Future<List<Map<String, dynamic>>> selectUnordered(String table,
      {required String columns, required Map<String, Object> filters,}) async {
    _maybeThrow();
    return tables[table] ?? const [];
  }

  @override
  Future<List<Map<String, dynamic>>> selectRange(String table,
      {required String columns,
      required Map<String, Object> filters,
      required String rangeColumn,
      required Object from,
      required Object to,}) async {
    _maybeThrow();
    lastRangeColumn = rangeColumn;
    lastRangeFrom = from;
    lastRangeTo = to;
    return tables[table] ?? const [];
  }

  @override
  Future<List<Map<String, dynamic>>> selectIn(String table,
      {required String columns,
      required Map<String, Object> filters,
      required String inColumn,
      required List<Object> inValues,}) async {
    _maybeThrow();
    return (tables[table] ?? const [])
        .where((r) => inValues.contains(r[inColumn]))
        .toList();
  }

  @override
  @override
  Future<void> upsertRow(String table, Map<String, dynamic> values,
      {required String onConflict,}) async {
    _maybeThrow();
    inserts.add((table: table, values: values));
  }

  @override
  Future<Map<String, dynamic>> insertRow(
      String table, Map<String, dynamic> values,) async {
    _maybeThrow();
    inserts.add((table: table, values: values));
    return {
      ...values,
      'id': 'new-id',
      'public_code': 'ST-1',
      'created_at': '2026-01-01T00:00:00Z',
      'updated_at': '2026-01-01T00:00:00Z',
    };
  }

  @override
  Future<Map<String, dynamic>> updateRow(
      String table, Map<String, dynamic> values,
      {required Map<String, Object> filters,}) async {
    _maybeThrow();
    return {...values, 'id': filters['id']};
  }

  @override
  Future<void> deleteRow(String table,
          {required Map<String, Object> filters,}) async =>
      _maybeThrow();

  @override
  Future<Map<String, dynamic>?> rpc(
      String name, Map<String, dynamic> params,) async {
    _maybeThrow();
    rpcCalls.add((name: name, params: params));
    return null;
  }

  @override
  Future<List<Map<String, dynamic>>> rpcList(
          String name, Map<String, dynamic> params,) async =>
      const [];
}

Map<String, dynamic> studentRow({String id = 's1', bool? paused}) => {
      'id': id,
      'teacher_id': 't1',
      'public_code': 'ST-$id',
      'name': 'طالب $id',
      'grade': 'الصف الأول',
      'school': null,
      if (paused != null) 'paused': paused,
      'phone': null,
      'guardian_name': null,
      'guardian_phone': null,
      'level_note': null,
      'created_at': '2026-01-01T00:00:00Z',
      'updated_at': '2026-01-01T00:00:00Z',
    };

void main() {
  group('StudentsRepository', () {
    test('list maps rows; missing paused defaults to false', () async {
      final fake = FakeSupabaseService();
      fake.tables['students'] = [
        studentRow(),
        studentRow(id: 's2', paused: true),
      ];
      final repo = StudentsRepositoryImpl(fake);
      final students = await repo.list('t1');
      expect(students, hasLength(2));
      expect(students.first.paused, isFalse);
      expect(students.last.paused, isTrue);
      expect(students.first.publicCode, 'ST-s1');
    });

    test('balances maps the student_balances view rows', () async {
      final fake = FakeSupabaseService();
      fake.tables['student_balances'] = [
        {'teacher_id': 't1', 'student_id': 's1', 'balance': -50},
        {'teacher_id': 't1', 'student_id': 's2', 'balance': 100.5},
      ];
      final repo = StudentsRepositoryImpl(fake);
      final balances = await repo.balances('t1');
      expect(balances, {'s1': -50.0, 's2': 100.5});
    });

    test('create never sends public_code (server trigger owns it)', () async {
      final fake = FakeSupabaseService();
      final repo = StudentsRepositoryImpl(fake);
      final created = await repo.create('t1', const StudentInput(name: 'جديد'));
      expect(created.publicCode, 'ST-1');
      expect(fake.inserts.single.values.containsKey('public_code'), isFalse);
      expect(fake.inserts.single.values['teacher_id'], 't1');
    });
  });

  group('GroupsRepository', () {
    test('billing_type maps db snake_case to enum and back', () async {
      final fake = FakeSupabaseService();
      fake.tables['groups'] = [
        {
          'id': 'g1',
          'teacher_id': 't1',
          'name': 'مجموعة',
          'billing_type': 'per_session_attended',
          'price': 100,
          'days': [6, 1],
          'start_time': '17:00',
          'duration_minutes': 90,
          'room': null,
          'capacity': null,
          'assistant_name': null,
          'links': <String>[],
          'archived_at': null,
          'created_at': '2026-01-01T00:00:00Z',
          'updated_at': '2026-01-01T00:00:00Z',
        },
      ];
      final repo = GroupsRepositoryImpl(fake);
      final groups = await repo.list('t1');
      expect(groups.single.billingType, BillingType.perSessionAttended);
      expect(groups.single.days, [6, 1]);
      expect(Group.billingToDb(BillingType.weeklyPackage), 'weekly_package');
    });
  });

  group('ScheduleRepository', () {
    test('sessionsInRange queries session_date range with formatted dates',
        () async {
      final fake = FakeSupabaseService();
      final repo = ScheduleRepositoryImpl(fake);
      await repo.sessionsInRange(
          't1', DateTime(2026, 11, 1), DateTime(2026, 11, 30),);
      expect(fake.lastRangeColumn, 'session_date');
      expect(fake.lastRangeFrom, '2026-11-01');
      expect(fake.lastRangeTo, '2026-11-30');
    });

    test('generateTeacherSessions calls the server RPC with p_teacher_id',
        () async {
      final fake = FakeSupabaseService();
      final repo = ScheduleRepositoryImpl(fake);
      await repo.generateTeacherSessions('t1');
      expect(fake.rpcCalls.single.name, 'generate_teacher_sessions');
      expect(fake.rpcCalls.single.params, {'p_teacher_id': 't1'});
    });
  });

  group('Error mapping (contracts §5)', () {
    test(
        'Postgrest 23505 → duplicate; 42501 → no permission; unknown → fallback',
        () {
      expect(
          mapSupabaseError(
                  const PostgrestException(message: 'x', code: '23505'),)
              .arbKey,
          'common_duplicate_entry',);
      expect(
          mapSupabaseError(
                  const PostgrestException(message: 'x', code: '42501'),)
              .arbKey,
          'common_no_permission',);
      expect(
          mapSupabaseError(const PostgrestException(
                  message: 'raw secret text', code: 'XX999',),)
              .arbKey,
          'common_unexpected_error',);
    });

    test('Auth invalid credentials maps to its key — never the raw message',
        () {
      final err =
          mapSupabaseError(const AuthException('Invalid login credentials'));
      expect(err.arbKey, 'auth_invalid_credentials');
      expect(err.kind, AppErrorKind.auth);
    });

    test('repository propagates AppError from the service', () async {
      final fake = FakeSupabaseService()
        ..errorToThrow = const AppError(
            kind: AppErrorKind.conflict, arbKey: 'common_duplicate_entry',);
      final repo = StudentsRepositoryImpl(fake);
      await expectLater(repo.list('t1'), throwsA(isA<AppError>()));
    });
  });

  group('LocalCache (Drift, in-memory)', () {
    test('put/get roundtrip keeps full row payload; replace clears stale rows',
        () async {
      final db = AppDatabase(NativeDatabase.memory());
      addTearDown(db.close);
      final cache = LocalCache(db);
      await cache.putAll('student', 't1', [studentRow(), studentRow(id: 's2')]);
      var rows = await cache.getAll('student', 't1');
      expect(rows, hasLength(2));
      expect(rows.first['public_code'], 'ST-s1');

      await cache.replaceAll('student', 't1', [studentRow(id: 's9')]);
      rows = await cache.getAll('student', 't1');
      expect(rows, hasLength(1));
      expect(rows.single['id'], 's9');

      final other = await cache.getAll('student', 't2');
      expect(other, isEmpty);
    });
  });
}
