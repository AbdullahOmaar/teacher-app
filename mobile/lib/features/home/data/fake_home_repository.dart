import 'package:mister/core/data/fake_database.dart';
import 'package:mister/features/home/data/home_repository.dart';
import 'package:mister/features/schedule/domain/models/session.dart';

/// تنفيذ وهمي لـ HomeRepository بنفس واجهة عقد F1-T1 v1.1 حرفيًا —
/// لوضع تطوير الواجهة (USE_FAKE_DATA) فقط. حضور اليوم لم يُسجَّل بعد
/// في البيانات الوهمية (حالة صباح واقعية) فتظهر بطاقة «ابدأ هنا».
class FakeHomeRepository implements HomeRepository {
  FakeHomeRepository([FakeDatabase? db]) : _db = db ?? FakeDatabase.instance;

  final FakeDatabase _db;

  @override
  Future<TodaySummary> today(String teacherId) async {
    await Future<void>.delayed(const Duration(milliseconds: 250));
    final now = DateTime.now();
    final todaySessions = _db
        .sessionsInRange(now, now)
        .where((s) => s.status == SessionStatus.scheduled)
        .toList();
    final todayGroupIds = todaySessions.map((s) => s.groupId).toSet();
    final totalStudents = _db.enrollments
        .where((e) => todayGroupIds.contains(e.groupId))
        .map((e) => e.studentId)
        .toSet()
        .length;
    final outstanding = _db.balancesMap.values
        .where((b) => b < 0)
        .fold(0.0, (sum, b) => sum + -b);
    return TodaySummary(
      sessionsToday: todaySessions,
      presentCount: 0,
      absentCount: 0,
      totalStudentsToday: totalStudents,
      outstandingTotal: outstanding,
    );
  }
}
