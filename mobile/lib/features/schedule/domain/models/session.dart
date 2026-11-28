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
}

class Holiday {
  const Holiday({required this.id, required this.teacherId, required this.holidayDate, this.name, required this.createdAt});

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
}
