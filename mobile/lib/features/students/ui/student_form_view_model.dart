import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/core/data/current_teacher_provider.dart';
import 'package:mister/core/data/providers.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/features/students/domain/models/student.dart';

/// حالة أمر نموذج الطالب — قيم الحقول حالة View (controllers)،
/// والفيوموديل يملك: قائمة المجموعات للمنتقي + أمر الحفظ وحالته.
/// عقود v1.2: اختيار المجموعة في النموذج يُحفَظ عبر
/// `StudentsRepository.enroll` (upsert) بعد إنشاء/تعديل الطالب.
class StudentFormState {
  const StudentFormState({
    this.groups = const [],
    this.formError,
    this.submitting = false,
    this.done = false,
  });

  final List<Group> groups;

  /// مفتاح ARB لخطأ الإرسال — الـView تترجمه، لا نص خام.
  final String? formError;
  final bool submitting;
  final bool done;

  StudentFormState copyWith({
    List<Group>? groups,
    String? formError,
    bool clearFormError = false,
    bool? submitting,
    bool? done,
  }) {
    return StudentFormState(
      groups: groups ?? this.groups,
      formError: clearFormError ? null : (formError ?? this.formError),
      submitting: submitting ?? this.submitting,
      done: done ?? this.done,
    );
  }
}

/// فيوموديل نموذج الطالب — المعرّف '' = إنشاء جديد، وغيره = تعديل.
class StudentFormViewModel extends FamilyNotifier<StudentFormState, String> {
  @override
  StudentFormState build(String studentId) {
    Future.microtask(_loadGroups);
    return const StudentFormState();
  }

  bool get isEdit => arg.isNotEmpty;

  Future<void> _loadGroups() async {
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      final groups = await ref.read(groupsRepositoryProvider).list(teacherId);
      state = state.copyWith(groups: groups);
    } catch (_) {
      // فشل تحميل المجموعات لا يمنع النموذج — يبقى المنتقي فارغًا.
    }
  }

  /// حفظ النموذج — بعد إنشاء/تعديل الطالب، يسجّله في المجموعة
  /// المختارة عبر `enroll` (upsert) إن وُجدت؛ بلا مجموعة يُتخطى التسجيل.
  Future<void> submit(StudentInput input, {String? groupId}) async {
    state = state.copyWith(submitting: true, clearFormError: true);
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      final repo = ref.read(studentsRepositoryProvider);
      final Student saved;
      if (isEdit) {
        saved = await repo.update(teacherId, arg, input);
      } else {
        saved = await repo.create(teacherId, input);
      }
      if (groupId != null) {
        await repo.enroll(
          teacherId,
          EnrollmentInput(studentId: saved.id, groupId: groupId),
        );
      }
      state = state.copyWith(submitting: false, done: true);
    } on AppError catch (e) {
      state = state.copyWith(submitting: false, formError: e.arbKey);
    } catch (_) {
      state = state.copyWith(
        submitting: false,
        formError: AppError.unknown().arbKey,
      );
    }
  }
}

final studentFormViewModelProvider =
    NotifierProvider.family<StudentFormViewModel, StudentFormState, String>(
  StudentFormViewModel.new,
);
