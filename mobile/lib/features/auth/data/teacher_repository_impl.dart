import 'package:mister/core/data/services.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/features/auth/data/teacher_repository.dart';
import 'package:mister/features/auth/domain/models/teacher.dart';

/// تنفيذ TeacherRepository — أعمدة الويب حرفيًا (features/auth/api.ts).
/// مساحات العمل = سناتر يملكها المستخدم + سناتر هو عضو نشط فيها (0016).
/// الاختيار الحالي حالة محلية (تُحفظ آمنًا في F1-T5) — الافتراضي أول مالك.
class TeacherRepositoryImpl implements TeacherRepository {
  TeacherRepositoryImpl(this._service);

  final SupabaseService _service;
  String? _currentTeacherId;

  static const String teacherCols =
      'id, owner_user_id, display_name, avatar_url, phone, created_at, updated_at';
  static const String memberCols =
      'id, teacher_id, user_id, invited_email, role, permissions, status, created_at, updated_at';

  String get _uid {
    final uid = _service.currentUserId;
    if (uid == null) {
      throw const AppError(
          kind: AppErrorKind.auth, arbKey: 'common_session_expired',);
    }
    return uid;
  }

  @override
  Future<List<Teacher>> listWorkspaces() async {
    final uid = _uid;
    final owned = await _service.select('teachers',
        columns: teacherCols, filters: {'owner_user_id': uid},);
    final memberships = await _service.select('teacher_members',
        columns: memberCols, filters: {'user_id': uid, 'status': 'active'},);
    final memberTeacherIds = memberships
        .map((m) => m['teacher_id'] as String)
        .toSet()
      ..removeWhere((id) => owned.any((t) => t['id'] == id));
    final memberTeachers = <Map<String, dynamic>>[];
    if (memberTeacherIds.isNotEmpty) {
      memberTeachers.addAll(await _service.selectIn(
        'teachers',
        columns: teacherCols,
        filters: const {},
        inColumn: 'id',
        inValues: memberTeacherIds.toList(),
      ),);
    }
    return [...owned, ...memberTeachers].map(Teacher.fromJson).toList();
  }

  @override
  Future<Teacher> currentWorkspace() async {
    final workspaces = await listWorkspaces();
    if (workspaces.isEmpty) {
      throw AppError.unknown();
    }
    final chosen = _currentTeacherId;
    return workspaces.firstWhere((t) => t.id == chosen,
        orElse: () => workspaces.first,);
  }

  @override
  Future<void> switchWorkspace(String teacherId) async {
    _currentTeacherId = teacherId;
  }

  @override
  Future<List<TeacherMember>> listMembers(String teacherId) async {
    final rows = await _service.select('teacher_members',
        columns: memberCols, filters: {'teacher_id': teacherId},);
    return rows.map(TeacherMember.fromJson).toList();
  }

  @override
  Future<void> createAccountProfile({required String displayName}) async {
    await _service.insertRow(
        'teachers', {'owner_user_id': _uid, 'display_name': displayName},);
  }
}
