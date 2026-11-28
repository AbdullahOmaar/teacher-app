import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/core/data/current_teacher_provider.dart';
import 'package:mister/core/data/providers.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/features/students/domain/models/student.dart';

/// بيانات عرض قائمة الطلاب — من العقد فقط.
class StudentsData {
  const StudentsData({
    required this.students,
    required this.enrollments,
    required this.groups,
    required this.balances,
  });

  final List<Student> students;
  final List<Enrollment> enrollments;
  final List<Group> groups;
  final Map<String, double> balances;

  /// أول مجموعة مسجل فيها الطالب (لعرض الصف) — null = بلا مجموعة.
  Group? primaryGroupOf(String studentId) {
    for (final e in enrollments) {
      if (e.studentId == studentId) {
        for (final g in groups) {
          if (g.id == e.groupId) return g;
        }
      }
    }
    return null;
  }

  double balanceOf(String studentId) => balances[studentId] ?? 0;
}

/// فيوموديل قائمة الطلاب — البحث والتصفية فلترة عرض محلية في الـView
/// (لا نداء خادم لكل حرف — تفصيل F1-T6 ‏4-2).
class StudentsListViewModel extends Notifier<UiState<StudentsData>> {
  @override
  UiState<StudentsData> build() {
    Future.microtask(load);
    return const UiState.loading();
  }

  Future<void> load() async {
    state = const UiState.loading();
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      final studentsRepo = ref.read(studentsRepositoryProvider);
      final students = await studentsRepo.list(teacherId);
      final enrollments = await studentsRepo.listEnrollments(teacherId);
      final balances = await studentsRepo.balances(teacherId);
      final groups = await ref.read(groupsRepositoryProvider).list(teacherId);
      state = UiState.data(
        StudentsData(
          students: students,
          enrollments: enrollments,
          groups: groups,
          balances: balances,
        ),
      );
    } on AppError catch (e) {
      state = UiState.error(e);
    } catch (_) {
      state = UiState.error(AppError.unknown());
    }
  }
}

final studentsListViewModelProvider =
    NotifierProvider<StudentsListViewModel, UiState<StudentsData>>(
  StudentsListViewModel.new,
);
