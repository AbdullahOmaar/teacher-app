import 'package:mister/core/data/fake_database.dart';
import 'package:mister/features/schedule/data/schedule_repository.dart';
import 'package:mister/features/schedule/domain/models/session.dart';

/// تنفيذ وهمي لـ ScheduleRepository بنفس واجهة عقد F1-T1 v1.1 حرفيًا —
/// لوضع تطوير الواجهة (USE_FAKE_DATA) فقط. الحصص تُولّد من قواعد
/// المجموعات في FakeDatabase (كالخادم: العميل يعرض فقط).
class FakeScheduleRepository implements ScheduleRepository {
  FakeScheduleRepository([FakeDatabase? db])
      : _db = db ?? FakeDatabase.instance;

  final FakeDatabase _db;

  Future<void> _delay() =>
      Future<void>.delayed(const Duration(milliseconds: 250));

  @override
  Future<List<Session>> sessionsInRange(
    String teacherId,
    DateTime from,
    DateTime to,
  ) async {
    await _delay();
    return _db.sessionsInRange(from, to);
  }

  @override
  Future<List<Holiday>> holidays(String teacherId) async {
    await _delay();
    return List.of(_db.holidays);
  }

  @override
  Future<void> generateTeacherSessions(String teacherId) async {
    await _delay();
    // التوليد الحقيقي RPC خادمي (0022) — الوهمي لا يفعل شيئًا:
    // الحصص مشتقة من قواعد المجموعات أصلًا في FakeDatabase.
  }

  @override
  Future<Session> createExtraSession(
    String teacherId,
    ExtraSessionInput input,
  ) async {
    await _delay();
    final now = DateTime.now();
    final session = Session(
      id: 'sess-extra-${now.microsecondsSinceEpoch}',
      teacherId: teacherId,
      groupId: input.groupId,
      sessionDate: input.sessionDate,
      startTime: '${input.startTime}:00',
      durationMinutes: input.durationMinutes,
      kind: SessionKind.extra,
      status: SessionStatus.scheduled,
      note: input.note,
      createdAt: now,
      updatedAt: now,
    );
    _db.extraSessions.add(session);
    return session;
  }

  @override
  Future<void> cancelSession(String teacherId, String sessionId) async {
    await _delay();
    _db.cancelledSessionIds.add(sessionId);
  }
}
