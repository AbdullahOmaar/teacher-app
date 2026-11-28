import 'package:mister/features/schedule/domain/models/session.dart';

/// عقود F1-T1 v1.1 (§3) — واجهة HomeRepository (تجميعات اليوم — قراءة فقط).
abstract class HomeRepository {
  Future<TodaySummary> today(String teacherId);
}

class TodaySummary {
  const TodaySummary({
    required this.sessionsToday,
    required this.presentCount,
    required this.absentCount,
    required this.totalStudentsToday,
    required this.outstandingTotal,
  });

  final List<Session> sessionsToday;
  final int presentCount;
  final int absentCount;
  final int totalStudentsToday;

  /// من student_balances — عرض فقط.
  final double outstandingTotal;
}
