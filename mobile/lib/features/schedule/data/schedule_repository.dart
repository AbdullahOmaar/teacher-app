import 'package:mister/features/schedule/domain/models/session.dart';

/// عقود F1-T1 v1.1 (§3) — واجهة ScheduleRepository.
abstract class ScheduleRepository {
  Future<List<Session>> sessionsInRange(String teacherId, DateTime from, DateTime to);
  Future<List<Holiday>> holidays(String teacherId);

  /// توليد الحصص خادمي (RPC generate_teacher_sessions ‏0022) — العميل يعرض فقط.
  Future<void> generateTeacherSessions(String teacherId);
  Future<Session> createExtraSession(String teacherId, ExtraSessionInput input);
  Future<void> cancelSession(String teacherId, String sessionId);
}
