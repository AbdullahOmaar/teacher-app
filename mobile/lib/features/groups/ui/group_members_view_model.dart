import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/core/data/current_teacher_provider.dart';
import 'package:mister/core/data/providers.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/features/students/domain/models/student.dart';

/// بيانات أعضاء مجموعة — لا دالة أعضاء مخصصة في العقد v1.1:
/// الربط عبر `StudentsRepository.listEnrollments` (تفصيل F1-T6 ‏4-6).
class GroupMembersData {
  const GroupMembersData({
    required this.group,
    required this.members,
    required this.waitlistCount,
  });

  /// null = مجموعة غير موجودة (فراغ مهذب).
  final Group? group;
  final List<Student> members;
  final int waitlistCount;
}

/// فيوموديل أعضاء المجموعة (family بمعرّف المجموعة).
class GroupMembersViewModel
    extends FamilyNotifier<UiState<GroupMembersData>, String> {
  @override
  UiState<GroupMembersData> build(String groupId) {
    Future.microtask(load);
    return const UiState.loading();
  }

  Future<void> load() async {
    state = const UiState.loading();
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      final group =
          await ref.read(groupsRepositoryProvider).get(teacherId, arg);
      if (group == null) {
        state = const UiState.data(
          GroupMembersData(group: null, members: [], waitlistCount: 0),
        );
        return;
      }
      final studentsRepo = ref.read(studentsRepositoryProvider);
      final students = await studentsRepo.list(teacherId);
      final enrollments = await studentsRepo.listEnrollments(teacherId);
      final memberIds = enrollments
          .where((e) => e.groupId == arg)
          .map((e) => e.studentId)
          .toSet();
      final waitlist =
          await ref.read(groupsRepositoryProvider).listWaitlist(teacherId, arg);
      state = UiState.data(
        GroupMembersData(
          group: group,
          members: students.where((s) => memberIds.contains(s.id)).toList(),
          waitlistCount: waitlist.length,
        ),
      );
    } on AppError catch (e) {
      state = UiState.error(e);
    } catch (_) {
      state = UiState.error(AppError.unknown());
    }
  }
}

final groupMembersViewModelProvider = NotifierProvider.family<
    GroupMembersViewModel, UiState<GroupMembersData>, String>(
  GroupMembersViewModel.new,
);
