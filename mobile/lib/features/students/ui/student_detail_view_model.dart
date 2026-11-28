import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/core/data/current_teacher_provider.dart';
import 'package:mister/core/data/providers.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/features/students/domain/models/student.dart';

/// بيانات ملف طالب — طالب + تسجيلاته + رصيده من view الأرصدة.
class StudentDetailData {
  const StudentDetailData({
    required this.student,
    required this.enrollments,
    required this.groups,
    required this.balance,
  });

  /// null = طالب غير موجود (فراغ مهذب في الـView — لا خطأ).
  final Student? student;
  final List<Enrollment> enrollments;
  final List<Group> groups;
  final double balance;

  String groupName(String groupId) {
    for (final g in groups) {
      if (g.id == groupId) return g.name;
    }
    return '';
  }
}

/// فيوموديل ملف الطالب (family بمعرّف الطالب).
/// الحذف يمرّ بالعقد: 23503 ← `common_delete_blocked_by_links` عبر AppError.
class StudentDetailViewModel
    extends FamilyNotifier<UiState<StudentDetailData>, String> {
  @override
  UiState<StudentDetailData> build(String studentId) {
    Future.microtask(load);
    return const UiState.loading();
  }

  Future<void> load() async {
    state = const UiState.loading();
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      final repo = ref.read(studentsRepositoryProvider);
      final student = await repo.get(teacherId, arg);
      if (student == null) {
        state = const UiState.data(
          StudentDetailData(
            student: null,
            enrollments: [],
            groups: [],
            balance: 0,
          ),
        );
        return;
      }
      final enrollments = await repo.listStudentEnrollments(teacherId, arg);
      final balances = await repo.balances(teacherId);
      final groups = await ref.read(groupsRepositoryProvider).list(teacherId);
      state = UiState.data(
        StudentDetailData(
          student: student,
          enrollments: enrollments,
          groups: groups,
          balance: balances[arg] ?? 0,
        ),
      );
    } on AppError catch (e) {
      state = UiState.error(e);
    } catch (_) {
      state = UiState.error(AppError.unknown());
    }
  }

  /// يحذف الطالب؛ يعيد AppError عند الفشل (تترجمه الـView) وnull عند النجاح.
  Future<AppError?> deleteStudent() async {
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      await ref.read(studentsRepositoryProvider).delete(teacherId, arg);
      return null;
    } on AppError catch (e) {
      return e;
    } catch (_) {
      return AppError.unknown();
    }
  }
}

final studentDetailViewModelProvider = NotifierProvider.family<
    StudentDetailViewModel, UiState<StudentDetailData>, String>(
  StudentDetailViewModel.new,
);
