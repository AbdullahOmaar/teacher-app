/// موديلات الحضور + طابور الأوفلاين — عقود F1-T1 v1.1 (§2-6/§2-7).
/// دلالات ملزمة: LWW على (teacher,session,student) · upsert idempotent ·
/// فشل الشبكة لا يُحتسب محاولة · MAX_ATTEMPTS = 3.
enum AttendanceStatus { present, absent, late, makeup }

/// حمولة التغيير الكاملة (نفس الويب حرفيًا).
class AttendanceValue {
  const AttendanceValue(
      {this.status, this.homeworkDone = false, this.starred = false,});

  /// null = لم يُسجَّل بعد.
  final AttendanceStatus? status;
  final bool homeworkDone;
  final bool starred;

  static const AttendanceValue empty = AttendanceValue();

  bool get isEmpty => status == null && !homeworkDone && !starred;

  AttendanceValue copyWith(
          {AttendanceStatus? status, bool? homeworkDone, bool? starred,}) =>
      AttendanceValue(
        status: status ?? this.status,
        homeworkDone: homeworkDone ?? this.homeworkDone,
        starred: starred ?? this.starred,
      );
}

class AttendanceRecord {
  const AttendanceRecord({
    required this.teacherId,
    required this.sessionId,
    required this.studentId,
    required this.value,
    this.leftAt,
    required this.createdAt,
    required this.updatedAt,
  });

  final String teacherId;
  final String sessionId;
  final String studentId;
  final AttendanceValue value;

  /// وقت الانصراف الفعلي (0012) — null = لم ينصرف.
  final DateTime? leftAt;
  final DateTime createdAt;
  final DateTime updatedAt;
}

/// جدول Drift المحلي — لا جدول خادم جديد.
class QueuedAttendanceItem {
  const QueuedAttendanceItem({
    required this.key,
    required this.teacherId,
    required this.sessionId,
    required this.studentId,
    required this.value,
    required this.queuedAt,
    this.attempts = 0,
    this.lastError,
    this.failed = false,
  });

  /// "$teacherId:$sessionId:$studentId".
  final String key;
  final String teacherId;
  final String sessionId;
  final String studentId;
  final AttendanceValue value;
  final DateTime queuedAt;

  /// فشل غير شبكي فقط — MAX_ATTEMPTS = 3.
  final int attempts;
  final String? lastError;

  /// بعد 3 = خارج المزامنة التلقائية، ظاهر للمستخدم.
  final bool failed;
}

enum SyncStatus { idle, syncing, offline, failed }

class SyncResult {
  const SyncResult({required this.synced, required this.failed});
  final int synced;
  final int failed;
}
