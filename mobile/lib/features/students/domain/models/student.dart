/// موديلات الطالب — عقود F1-T1 v1.1 (§2-3). منقولة حرفيًا من types/database.ts.
/// كل موديل immutable (حقول final + copyWith).
class Student {
  const Student({
    required this.id,
    required this.teacherId,
    required this.publicCode,
    required this.name,
    this.grade,
    this.school,
    this.paused = false,
    this.phone,
    this.guardianName,
    this.guardianPhone,
    this.levelNote,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Student.fromJson(Map<String, dynamic> json) => Student(
        id: json['id'] as String,
        teacherId: json['teacher_id'] as String,
        publicCode: json['public_code'] as String,
        name: json['name'] as String,
        grade: json['grade'] as String?,
        school: json['school'] as String?,
        paused: json['paused'] as bool? ?? false,
        phone: json['phone'] as String?,
        guardianName: json['guardian_name'] as String?,
        guardianPhone: json['guardian_phone'] as String?,
        levelNote: json['level_note'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
        updatedAt: DateTime.parse(json['updated_at'] as String),
      );

  final String id;
  final String teacherId;

  /// كود عشوائي 8 أحرف — يولّده trigger، لا يُرسل عند الإنشاء.
  final String publicCode;
  final String name;
  final String? grade;
  final String? school;
  final bool paused;
  final String? phone;
  final String? guardianName;
  final String? guardianPhone;
  final String? levelNote;
  final DateTime createdAt;
  final DateTime updatedAt;

  Student copyWith({String? name, bool? paused, String? phone}) => Student(
        id: id,
        teacherId: teacherId,
        publicCode: publicCode,
        name: name ?? this.name,
        grade: grade,
        school: school,
        paused: paused ?? this.paused,
        phone: phone ?? this.phone,
        guardianName: guardianName,
        guardianPhone: guardianPhone,
        levelNote: levelNote,
        createdAt: createdAt,
        updatedAt: updatedAt,
      );
}

class StudentInput {
  const StudentInput({
    required this.name,
    this.grade,
    this.school,
    this.phone,
    this.guardianName,
    this.guardianPhone,
    this.levelNote,
  });

  final String name;
  final String? grade;
  final String? school;
  final String? phone;
  final String? guardianName;
  final String? guardianPhone;
  final String? levelNote;

  /// للإرسال للخادم — بلا public_code (يولّده trigger).
  Map<String, dynamic> toJson(String teacherId) => {
        'teacher_id': teacherId,
        'name': name,
        'grade': grade,
        'school': school,
        'phone': phone,
        'guardian_name': guardianName,
        'guardian_phone': guardianPhone,
        'level_note': levelNote,
      };
}

class Enrollment {
  const Enrollment({
    required this.id,
    required this.teacherId,
    required this.studentId,
    required this.groupId,
    this.priceOverride,
    this.prepaidSessions,
    required this.createdAt,
  });

  factory Enrollment.fromJson(Map<String, dynamic> json) => Enrollment(
        id: json['id'] as String,
        teacherId: json['teacher_id'] as String,
        studentId: json['student_id'] as String,
        groupId: json['group_id'] as String,
        priceOverride: (json['price_override'] as num?)?.toDouble(),
        prepaidSessions: json['prepaid_sessions'] as int?,
        createdAt: DateTime.parse(json['created_at'] as String),
      );

  final String id;
  final String teacherId;
  final String studentId;
  final String groupId;

  /// null = سعر المجموعة.
  final double? priceOverride;
  final int? prepaidSessions;
  final DateTime createdAt;
}

/// view‏ `student_balances` — محسوب خادميًا، غير مخزّن. لا حساب رصيد في العميل.
class StudentBalance {
  const StudentBalance(
      {required this.teacherId,
      required this.studentId,
      required this.balance,});
  final String teacherId;
  final String studentId;
  final double balance;
}
