/// موديلات المدرّس ومساحة العمل — عقود F1-T1 v1.1 (§2-2). منقولة حرفيًا من types/database.ts.
enum MemberRole { owner, assistant }

enum MemberStatus { invited, active, suspended }

class Teacher {
  const Teacher({
    required this.id,
    required this.ownerUserId,
    required this.displayName,
    this.avatarUrl,
    this.phone,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Teacher.fromJson(Map<String, dynamic> json) => Teacher(
        id: json['id'] as String,
        ownerUserId: json['owner_user_id'] as String,
        displayName: json['display_name'] as String,
        avatarUrl: json['avatar_url'] as String?,
        phone: json['phone'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
        updatedAt: DateTime.parse(json['updated_at'] as String),
      );

  /// = owner_user_id للسنتر الأساسي.
  final String id;
  final String ownerUserId;
  final String displayName;
  final String? avatarUrl;
  final String? phone;
  final DateTime createdAt;
  final DateTime updatedAt;
}

/// الصلاحيات الخمس — من `member_has_permission` (الويب). لا صلاحية سادسة.
class MemberPermissions {
  const MemberPermissions({
    this.canTakeAttendance = false,
    this.canManageStudents = false,
    this.canManageGroups = false,
    this.canManageGrades = false,
    this.canViewMoney = false,
  });

  factory MemberPermissions.fromJson(Map<String, dynamic> json) =>
      MemberPermissions(
        canTakeAttendance: json['can_take_attendance'] as bool? ?? false,
        canManageStudents: json['can_manage_students'] as bool? ?? false,
        canManageGroups: json['can_manage_groups'] as bool? ?? false,
        canManageGrades: json['can_manage_grades'] as bool? ?? false,
        canViewMoney: json['can_view_money'] as bool? ?? false,
      );

  final bool canTakeAttendance;
  final bool canManageStudents;
  final bool canManageGroups;
  final bool canManageGrades;

  /// false افتراضيًا — الماليات محجوبة في RLS.
  final bool canViewMoney;

  /// من jsonb ‏permissions — المفاتيح حرفية من الويب (features/auth/api.ts).
}

class TeacherMember {
  const TeacherMember({
    required this.id,
    required this.teacherId,
    this.userId,
    this.invitedEmail,
    required this.role,
    required this.permissions,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
  });

  factory TeacherMember.fromJson(Map<String, dynamic> json) => TeacherMember(
        id: json['id'] as String,
        teacherId: json['teacher_id'] as String,
        userId: json['user_id'] as String?,
        invitedEmail: json['invited_email'] as String?,
        role: MemberRole.values.byName(json['role'] as String),
        permissions: MemberPermissions.fromJson(
          (json['permissions'] as Map?)?.cast<String, dynamic>() ?? const {},
        ),
        status: MemberStatus.values.byName(json['status'] as String),
        createdAt: DateTime.parse(json['created_at'] as String),
        updatedAt: DateTime.parse(json['updated_at'] as String),
      );

  final String id;
  final String teacherId;

  /// null = دعوة معلّقة بالبريد لم تُدّعَ بعد (0006).
  final String? userId;
  final String? invitedEmail;
  final MemberRole role;
  final MemberPermissions permissions;
  final MemberStatus status;
  final DateTime createdAt;
  final DateTime updatedAt;
}
