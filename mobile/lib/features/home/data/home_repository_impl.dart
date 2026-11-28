import 'package:mister/core/data/services.dart';
import 'package:mister/features/home/data/home_repository.dart';
import 'package:mister/features/schedule/data/schedule_repository.dart';
import 'package:mister/features/schedule/domain/models/session.dart';
import 'package:mister/features/students/data/students_repository.dart';

/// تنفيذ HomeRepository — تجميعات اليوم (قراءة فقط).
/// تركيب من ريبو الجدول والطلاب + عدّ حضور اليوم من جدول attendance
/// (قراءة فقط هنا — كتابة الحضور ومزامنتها في F1-T7).
class HomeRepositoryImpl implements HomeRepository {
  HomeRepositoryImpl(this._service, this._schedule, this._students);

  final SupabaseService _service;
  final ScheduleRepository _schedule;
  final StudentsRepository _students;

  static const String attendanceCols =
      'id, teacher_id, session_id, student_id, status, note, created_at, updated_at';

  @override
  Future<TodaySummary> today(String teacherId) async {
    final now = DateTime.now();
    final day = DateTime(now.year, now.month, now.day);
    final sessions = (await _schedule.sessionsInRange(teacherId, day, day))
        .where((s) => s.status == SessionStatus.scheduled)
        .toList();

    var present = 0;
    var absent = 0;
    if (sessions.isNotEmpty) {
      final rows = await _service.selectIn(
        'attendance',
        columns: attendanceCols,
        filters: {'teacher_id': teacherId},
        inColumn: 'session_id',
        inValues: sessions.map((s) => s.id).toList(),
      );
      for (final r in rows) {
        if (r['status'] == 'p' || r['status'] == 'l') present++;
        if (r['status'] == 'a') absent++;
      }
    }

    final enrollments = await _students.listEnrollments(teacherId);
    final todayGroupIds = sessions.map((s) => s.groupId).toSet();
    final totalStudentsToday = enrollments
        .where((e) => todayGroupIds.contains(e.groupId))
        .map((e) => e.studentId)
        .toSet()
        .length;

    final balances = await _students.balances(teacherId);
    final outstanding =
        balances.values.where((b) => b < 0).fold(0.0, (sum, b) => sum + -b);

    return TodaySummary(
      sessionsToday: sessions,
      presentCount: present,
      absentCount: absent,
      totalStudentsToday: totalStudentsToday,
      outstandingTotal: outstanding,
    );
  }
}
