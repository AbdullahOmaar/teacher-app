import 'package:mister/features/auth/domain/models/teacher.dart';

/// عقود F1-T1 v1.1 (§3) — واجهة TeacherRepository.
abstract class TeacherRepository {
  /// سناتر المدرّس (0016).
  Future<List<Teacher>> listWorkspaces();
  Future<Teacher> currentWorkspace();
  Future<void> switchWorkspace(String teacherId);
  Future<List<TeacherMember>> listMembers(String teacherId);

  /// إكمال أول جلسة.
  Future<void> createAccountProfile({required String displayName});
}
