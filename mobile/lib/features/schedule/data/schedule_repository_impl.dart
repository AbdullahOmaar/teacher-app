import 'package:mister/core/data/services.dart';
import 'package:mister/features/schedule/data/schedule_repository.dart';
import 'package:mister/features/schedule/domain/models/session.dart';

/// تنفيذ ScheduleRepository — أعمدة الويب حرفيًا (features/schedule/api.ts).
/// توليد الحصص خادمي فقط (RPC 0022) — لا توليد محلي أبدًا (عقود §3).
class ScheduleRepositoryImpl implements ScheduleRepository {
  ScheduleRepositoryImpl(this._service);

  final SupabaseService _service;

  static const String sessionCols =
      'id, teacher_id, group_id, session_date, start_time, duration_minutes, kind, status, origin_session_id, note, created_at, updated_at';
  static const String holidayCols =
      'id, teacher_id, holiday_date, name, created_at';

  static String _date(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  Future<List<Session>> sessionsInRange(
      String teacherId, DateTime from, DateTime to,) async {
    final rows = await _service.selectRange(
      'sessions',
      columns: sessionCols,
      filters: {'teacher_id': teacherId},
      rangeColumn: 'session_date',
      from: _date(from),
      to: _date(to),
    );
    return rows.map(Session.fromJson).toList();
  }

  @override
  Future<List<Holiday>> holidays(String teacherId) async {
    final rows = await _service.select('holidays',
        columns: holidayCols, filters: {'teacher_id': teacherId},);
    return rows.map(Holiday.fromJson).toList();
  }

  @override
  Future<void> generateTeacherSessions(String teacherId) async {
    await _service
        .rpc('generate_teacher_sessions', {'p_teacher_id': teacherId});
  }

  @override
  Future<Session> createExtraSession(
      String teacherId, ExtraSessionInput input,) async {
    final row = await _service.insertRow('sessions', input.toJson(teacherId));
    return Session.fromJson(row);
  }

  @override
  Future<void> cancelSession(String teacherId, String sessionId) {
    return _service.updateRow('sessions', {'status': 'cancelled'},
        filters: {'teacher_id': teacherId, 'id': sessionId},);
  }
}
