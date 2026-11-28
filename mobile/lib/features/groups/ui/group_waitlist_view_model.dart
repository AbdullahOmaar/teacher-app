import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/core/data/current_teacher_provider.dart';
import 'package:mister/core/data/providers.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/features/students/domain/models/student.dart';

/// بيانات قائمة انتظار مجموعة.
class GroupWaitlistData {
  const GroupWaitlistData({required this.group, required this.entries});

  final Group? group;
  final List<GroupWaitlist> entries;
}

/// فيوموديل قائمة الانتظار (family بمعرّف المجموعة).
/// الترقية: لا دالة ترقية/تسجيل في العقد v1.1 — تُنشئ طالبًا عبر
/// `StudentsRepository.create` (حل التفصيل الموثّق في F1-T6 ‏4-7).
class GroupWaitlistViewModel
    extends FamilyNotifier<UiState<GroupWaitlistData>, String> {
  @override
  UiState<GroupWaitlistData> build(String groupId) {
    Future.microtask(load);
    return const UiState.loading();
  }

  Future<void> load() async {
    state = const UiState.loading();
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      final groupsRepo = ref.read(groupsRepositoryProvider);
      final group = await groupsRepo.get(teacherId, arg);
      final entries = await groupsRepo.listWaitlist(teacherId, arg);
      state = UiState.data(GroupWaitlistData(group: group, entries: entries));
    } on AppError catch (e) {
      state = UiState.error(e);
    } catch (_) {
      state = UiState.error(AppError.unknown());
    }
  }

  /// ترقية منتظر لطالب — يعيد AppError عند الفشل وnull عند النجاح.
  Future<AppError?> accept(GroupWaitlist entry) async {
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      await ref.read(studentsRepositoryProvider).create(
            teacherId,
            StudentInput(name: entry.name, phone: entry.phone),
          );
      return null;
    } on AppError catch (e) {
      return e;
    } catch (_) {
      return AppError.unknown();
    }
  }
}

final groupWaitlistViewModelProvider = NotifierProvider.family<
    GroupWaitlistViewModel, UiState<GroupWaitlistData>, String>(
  GroupWaitlistViewModel.new,
);
