import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/core/data/current_teacher_provider.dart';
import 'package:mister/core/data/providers.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/features/groups/domain/models/group.dart';

/// بيانات قائمة المجموعات — مجموعات + عدّاد مسجلين لكل مجموعة.
class GroupsData {
  const GroupsData({required this.groups, required this.enrolledCounts});

  final List<Group> groups;
  final Map<String, int> enrolledCounts;

  int enrolledOf(String groupId) => enrolledCounts[groupId] ?? 0;
}

/// فيوموديل قائمة المجموعات — الأرشفة أرشفة لا حذف (عقد §3).
class GroupsListViewModel extends Notifier<UiState<GroupsData>> {
  @override
  UiState<GroupsData> build() {
    Future.microtask(load);
    return const UiState.loading();
  }

  Future<void> load() async {
    state = const UiState.loading();
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      final groups = await ref.read(groupsRepositoryProvider).list(teacherId);
      final enrollments =
          await ref.read(studentsRepositoryProvider).listEnrollments(teacherId);
      final counts = <String, int>{};
      for (final e in enrollments) {
        counts[e.groupId] = (counts[e.groupId] ?? 0) + 1;
      }
      state = UiState.data(GroupsData(groups: groups, enrolledCounts: counts));
    } on AppError catch (e) {
      state = UiState.error(e);
    } catch (_) {
      state = UiState.error(AppError.unknown());
    }
  }

  /// أرشفة مجموعة — يعيد AppError عند الفشل وnull عند النجاح.
  Future<AppError?> archive(String groupId) async {
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      await ref.read(groupsRepositoryProvider).archive(teacherId, groupId);
      await load();
      return null;
    } on AppError catch (e) {
      return e;
    } catch (_) {
      return AppError.unknown();
    }
  }
}

final groupsListViewModelProvider =
    NotifierProvider<GroupsListViewModel, UiState<GroupsData>>(
  GroupsListViewModel.new,
);
