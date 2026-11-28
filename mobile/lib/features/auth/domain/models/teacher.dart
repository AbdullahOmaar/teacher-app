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

  final bool canTakeAttendance;
  final bool canManageStudents;
  final bool canManageGroups;
  final bool canManageGrades;

  /// false افتراضيًا — الماليات محجوبة في RLS.
  final bool canViewMoney;
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
