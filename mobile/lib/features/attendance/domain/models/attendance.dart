/// موديلات الحضور + طابور الأوفلاين — عقود F1-T1 v1.1 (§2-6/§2-7).
/// دلالات ملزمة: LWW على (teacher,session,student) · upsert idempotent ·
/// فشل الشبكة لا يُحتسب محاولة · MAX_ATTEMPTS = 3.
enum AttendanceStatus { present, absent, late, makeup }

/// حمولة التغيير الكاملة (نفس الويب حرفيًا).
class AttendanceValue {
  const AttendanceValue(
      {this.status, this.homeworkDone = false, this.starred = false,});

  factory AttendanceValue.fromJson(Map<String, dynamic> json) => AttendanceValue(
        status: statusFromChar(json['status'] as String?),
        homeworkDone: json['homework_done'] as bool? ?? false,
        starred: json['starred'] as bool? ?? false,
      );

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

  /// حرف الحالة في قاعدة البيانات — 'p'|'a'|'l'|'m' (types/database.ts).
  static String? statusChar(AttendanceStatus? status) => switch (status) {
        AttendanceStatus.present => 'p',
        AttendanceStatus.absent => 'a',
        AttendanceStatus.late => 'l',
        AttendanceStatus.makeup => 'm',
        null => null,
      };

  static AttendanceStatus? statusFromChar(String? ch) => switch (ch) {
        'p' => AttendanceStatus.present,
        'a' => AttendanceStatus.absent,
        'l' => AttendanceStatus.late,
        'm' => AttendanceStatus.makeup,
        _ => null,
      };

  Map<String, dynamic> toJson() => {
        'status': statusChar(status),
        'homework_done': homeworkDone,
        'starred': starred,
      };


  @override
  bool operator ==(Object other) =>
      other is AttendanceValue &&
      other.status == status &&
      other.homeworkDone == homeworkDone &&
      other.starred == starred;

  @override
  int get hashCode => Object.hash(status, homeworkDone, starred);
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

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) => AttendanceRecord(
        teacherId: json['teacher_id'] as String,
        sessionId: json['session_id'] as String,
        studentId: json['student_id'] as String,
        value: AttendanceValue(
          status: AttendanceValue.statusFromChar(json['status'] as String?),
          homeworkDone: json['homework_done'] as bool? ?? false,
          starred: json['starred'] as bool? ?? false,
        ),
        leftAt: json['left_at'] == null ? null : DateTime.parse(json['left_at'] as String),
        createdAt: DateTime.parse(json['created_at'] as String),
        updatedAt: DateTime.parse(json['updated_at'] as String),
      );

  final String teacherId;
  final String sessionId;
  final String studentId;
  final AttendanceValue value;

  /// وقت الانصراف الفعلي (0012) — null = لم ينصرف.
  final DateTime? leftAt;
  final DateTime createdAt;
  final DateTime updatedAt;


  /// صف الـupsert — لا يمس left_at (الويب: upsert يحدّث أعمدته فقط).
  Map<String, dynamic> toUpsertRow() => {
        'teacher_id': teacherId,
        'session_id': sessionId,
        'student_id': studentId,
        'status': AttendanceValue.statusChar(value.status),
        'homework_done': value.homeworkDone,
        'starred': value.starred,
      };
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

  QueuedAttendanceItem copyWith({
    AttendanceValue? value,
    DateTime? queuedAt,
    int? attempts,
    String? lastError,
    bool? failed,
  }) =>
      QueuedAttendanceItem(
        key: key,
        teacherId: teacherId,
        sessionId: sessionId,
        studentId: studentId,
        value: value ?? this.value,
        queuedAt: queuedAt ?? this.queuedAt,
        attempts: attempts ?? this.attempts,
        lastError: lastError ?? this.lastError,
        failed: failed ?? this.failed,
      );

  static String keyFor(String teacherId, String sessionId, String studentId) =>
      '$teacherId:$sessionId:$studentId';
}

enum SyncStatus { idle, syncing, offline, failed }

class SyncResult {
  const SyncResult({required this.synced, required this.failed});
  final int synced;
  final int failed;
}
