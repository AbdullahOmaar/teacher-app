/// موديلات المجموعة — عقود F1-T1 v1.1 (§2-4). منقولة حرفيًا من types/database.ts.
enum BillingType {
  monthlyFixed,
  perSessionPrepaid,
  perSessionAttended,
  weeklyPackage
}

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

  factory Group.fromJson(Map<String, dynamic> json) => Group(
        id: json['id'] as String,
        teacherId: json['teacher_id'] as String,
        name: json['name'] as String,
        billingType: BillingType.values
            .byName(_billingFromDb(json['billing_type'] as String)),
        price: (json['price'] as num).toDouble(),
        days: (json['days'] as List).cast<int>(),
        startTime: json['start_time'] as String,
        durationMinutes: json['duration_minutes'] as int,
        room: json['room'] as String?,
        capacity: json['capacity'] as int?,
        assistantName: json['assistant_name'] as String?,
        links: (json['links'] as List?)?.cast<String>() ?? const [],
        archivedAt: json['archived_at'] == null
            ? null
            : DateTime.parse(json['archived_at'] as String),
        createdAt: DateTime.parse(json['created_at'] as String),
        updatedAt: DateTime.parse(json['updated_at'] as String),
      );

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

  static String _billingFromDb(String db) => switch (db) {
        'monthly_fixed' => 'monthlyFixed',
        'per_session_prepaid' => 'perSessionPrepaid',
        'per_session_attended' => 'perSessionAttended',
        'weekly_package' => 'weeklyPackage',
        _ => 'monthlyFixed',
      };

  static String billingToDb(BillingType type) => switch (type) {
        BillingType.monthlyFixed => 'monthly_fixed',
        BillingType.perSessionPrepaid => 'per_session_prepaid',
        BillingType.perSessionAttended => 'per_session_attended',
        BillingType.weeklyPackage => 'weekly_package',
      };
}

/// حقول إنشاء/تعديل مجموعة — عقود §3 (GroupInput).
class GroupInput {
  const GroupInput({
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
  });

  final String name;
  final BillingType billingType;
  final double price;
  final List<int> days;
  final String startTime;
  final int durationMinutes;
  final String? room;
  final int? capacity;
  final String? assistantName;
  final List<String> links;

  Map<String, dynamic> toJson(String teacherId) => {
        'teacher_id': teacherId,
        'name': name,
        'billing_type': Group.billingToDb(billingType),
        'price': price,
        'days': days,
        'start_time': startTime,
        'duration_minutes': durationMinutes,
        'room': room,
        'capacity': capacity,
        'assistant_name': assistantName,
        'links': links,
      };
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

  factory GroupWaitlist.fromJson(Map<String, dynamic> json) => GroupWaitlist(
        id: json['id'] as String,
        teacherId: json['teacher_id'] as String,
        groupId: json['group_id'] as String,
        name: json['name'] as String,
        phone: json['phone'] as String?,
        note: json['note'] as String?,
        source: json['source'] as String,
        wantsTrial: json['wants_trial'] as bool? ?? false,
        createdAt: DateTime.parse(json['created_at'] as String),
      );

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
