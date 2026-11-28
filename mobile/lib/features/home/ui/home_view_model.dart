import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/core/data/current_teacher_provider.dart';
import 'package:mister/core/data/providers.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/features/home/data/home_repository.dart';

/// بيانات عرض الرئيسية — تجميع من العقد فقط (لا حساب رصيد في العميل).
class HomeData {
  const HomeData({
    required this.summary,
    required this.groups,
    required this.hasStudents,
  });

  final TodaySummary summary;
  final List<Group> groups;

  /// هل يوجد طلاب أصلًا (خطوة «ابدأ هنا» الثانية).
  final bool hasStudents;

  bool get hasGroups => groups.isNotEmpty;

  /// اكتملت خطوات البدء الثلاث (حساب ← مجموعة ← أول حضور مسجل).
  bool get startHereDone =>
      hasGroups &&
      hasStudents &&
      (summary.presentCount + summary.absentCount) > 0;

  String groupName(String groupId) {
    for (final g in groups) {
      if (g.id == groupId) return g.name;
    }
    return '';
  }
}

/// فيوموديل الرئيسية — UiState<HomeData> واحدة (عقود §6).
class HomeViewModel extends Notifier<UiState<HomeData>> {
  @override
  UiState<HomeData> build() {
    Future.microtask(load);
    return const UiState.loading();
  }

  Future<void> load() async {
    state = const UiState.loading();
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      final summary = await ref.read(homeRepositoryProvider).today(teacherId);
      final groups = await ref.read(groupsRepositoryProvider).list(teacherId);
      final students =
          await ref.read(studentsRepositoryProvider).list(teacherId);
      state = UiState.data(
        HomeData(
          summary: summary,
          groups: groups,
          hasStudents: students.isNotEmpty,
        ),
      );
    } on AppError catch (e) {
      state = UiState.error(e);
    } catch (_) {
      state = UiState.error(AppError.unknown());
    }
  }
}

final homeViewModelProvider =
    NotifierProvider<HomeViewModel, UiState<HomeData>>(HomeViewModel.new);
