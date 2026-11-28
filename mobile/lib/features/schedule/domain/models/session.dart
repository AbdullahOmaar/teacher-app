/// موديلات الحصة والجدول — عقود F1-T1 v1.1 (§2-5). منقولة حرفيًا من types/database.ts.
enum SessionKind { regular, extra, moved }

enum SessionStatus { scheduled, cancelled }

class Session {
  const Session({
    required this.id,
    required this.teacherId,
    required this.groupId,
    required this.sessionDate,
    required this.startTime,
    required this.durationMinutes,
    required this.kind,
    required this.status,
    this.originSessionId,
    this.note,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Session.fromJson(Map<String, dynamic> json) => Session(
        id: json['id'] as String,
        teacherId: json['teacher_id'] as String,
        groupId: json['group_id'] as String,
        sessionDate: DateTime.parse(json['session_date'] as String),
        startTime: json['start_time'] as String,
        durationMinutes: json['duration_minutes'] as int,
        kind: SessionKind.values.byName(json['kind'] as String),
        status: SessionStatus.values.byName(json['status'] as String),
        originSessionId: json['origin_session_id'] as String?,
        note: json['note'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
        updatedAt: DateTime.parse(json['updated_at'] as String),
      );

  final String id;
  final String teacherId;
  final String groupId;

  /// 'YYYY-MM-DD'.
  final DateTime sessionDate;

  /// "HH:MM:SS" من Postgres.
  final String startTime;
  final int durationMinutes;
  final SessionKind kind;
  final SessionStatus status;
  final String? originSessionId;
  final String? note;
  final DateTime createdAt;
  final DateTime updatedAt;

  Map<String, dynamic> toJson() => {
        'id': id,
        'teacher_id': teacherId,
        'group_id': groupId,
        'session_date': sessionDate.toIso8601String().substring(0, 10),
        'start_time': startTime,
        'duration_minutes': durationMinutes,
        'kind': kind.name,
        'status': status.name,
        'origin_session_id': originSessionId,
        'note': note,
        'created_at': createdAt.toIso8601String(),
        'updated_at': updatedAt.toIso8601String(),
      };
}

class Holiday {
  const Holiday(
      {required this.id,
      required this.teacherId,
      required this.holidayDate,
      this.name,
      required this.createdAt,});

  factory Holiday.fromJson(Map<String, dynamic> json) => Holiday(
        id: json['id'] as String,
        teacherId: json['teacher_id'] as String,
        holidayDate: DateTime.parse(json['holiday_date'] as String),
        name: json['name'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
      );

  final String id;
  final String teacherId;

  /// 'YYYY-MM-DD' — صف لكل يوم.
  final DateTime holidayDate;
  final String? name;
  final DateTime createdAt;
}

class ExtraSessionInput {
  const ExtraSessionInput({
    required this.groupId,
    required this.sessionDate,
    required this.startTime,
    required this.durationMinutes,
    this.note,
  });

  final String groupId;
  final DateTime sessionDate;

  /// 'HH:MM'.
  final String startTime;
  final int durationMinutes;
  final String? note;

  Map<String, dynamic> toJson(String teacherId) => {
        'teacher_id': teacherId,
        'group_id': groupId,
        'session_date': sessionDate.toIso8601String().substring(0, 10),
        'start_time': startTime,
        'duration_minutes': durationMinutes,
        'kind': 'extra',
        'status': 'scheduled',
        'note': note,
      };
}
