/// موديلات المجموعة — عقود F1-T1 v1.1 (§2-4). منقولة حرفيًا من types/database.ts.
enum BillingType { monthlyFixed, perSessionPrepaid, perSessionAttended, weeklyPackage }

class Group {
  const Group({
    required this.id,
    required this.teacherId,
    required this.name,
    required this.billingType,
    required this.price,
    required this.days,
    required this.startTime,
    required this.durationMinutes,
    this.room,
    this.capacity,
    this.assistantName,
    this.links = const [],
    this.archivedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String teacherId;
  final String name;
  final BillingType billingType;
  final double price;

  /// 0 = الأحد … 6 = السبت (مطابق Date.getDay).
  final List<int> days;

  /// "HH:MM:SS" من Postgres.
  final String startTime;
  final int durationMinutes;
  final String? room;

  /// null = بلا حد.
  final int? capacity;
  final String? assistantName;
  final List<String> links;

  /// null = نشطة، وغير ذلك = مؤرشفة (لا حصص/تسجيل جديد).
  final DateTime? archivedAt;
  final DateTime createdAt;
  final DateTime updatedAt;
}

class GroupWaitlist {
  const GroupWaitlist({
    required this.id,
    required this.teacherId,
    required this.groupId,
    required this.name,
    this.phone,
    this.note,
    required this.source,
    this.wantsTrial = false,
    required this.createdAt,
  });

  final String id;
  final String teacherId;
  final String groupId;
  final String name;
  final String? phone;
  final String? note;

  /// 'manual' | 'booking_page'.
  final String source;
  final bool wantsTrial;
  final DateTime createdAt;
}
