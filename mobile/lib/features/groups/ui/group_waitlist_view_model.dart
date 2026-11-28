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
/// الترقية (عقود v1.2): إنشاء طالب عبر `StudentsRepository.create`
/// ثم تسجيله في المجموعة عبر `enroll` (upsert).
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

  /// ترقية منتظر لطالب — ينشئ الطالب ثم يسجّله في المجموعة عبر enroll.
  /// يعيد AppError عند الفشل وnull عند النجاح.
  Future<AppError?> accept(GroupWaitlist entry) async {
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      final repo = ref.read(studentsRepositoryProvider);
      final student = await repo.create(
        teacherId,
        StudentInput(name: entry.name, phone: entry.phone),
      );
      await repo.enroll(
        teacherId,
        EnrollmentInput(studentId: student.id, groupId: arg),
      );
      await load();
      return null;
    } on AppError catch (e) {
      return e;
    } catch (_) {
      return AppError.unknown();
    }
  }

  /// إضافة منتظر جديد — `addWaitlistEntry` (source الافتراضي 'manual'
  /// خادميًا — لا يُرسل من العميل). يعيد AppError عند الفشل وnull عند النجاح.
  Future<AppError?> add(WaitlistInput input) async {
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      await ref
          .read(groupsRepositoryProvider)
          .addWaitlistEntry(teacherId, arg, input);
      await load();
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
