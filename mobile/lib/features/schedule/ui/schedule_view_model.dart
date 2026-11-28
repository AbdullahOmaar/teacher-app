import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/core/data/current_teacher_provider.dart';
import 'package:mister/core/data/providers.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/features/schedule/domain/models/session.dart';

/// بيانات أسبوع الجدول — حصص + إجازات + أسماء مجموعات.
class ScheduleData {
  const ScheduleData({
    required this.weekStart,
    required this.sessions,
    required this.holidays,
    required this.groupNames,
  });

  /// الأحد أول الأسبوع (ترقيم الويب: 0 = الأحد).
  final DateTime weekStart;
  final List<Session> sessions;
  final List<Holiday> holidays;
  final Map<String, String> groupNames;

  List<Session> sessionsOn(DateTime day) {
    return sessions
        .where(
          (s) =>
              s.sessionDate.year == day.year &&
              s.sessionDate.month == day.month &&
              s.sessionDate.day == day.day,
        )
        .toList();
  }

  Holiday? holidayOn(DateTime day) {
    for (final h in holidays) {
      if (h.holidayDate.year == day.year &&
          h.holidayDate.month == day.month &&
          h.holidayDate.day == day.day) {
        return h;
      }
    }
    return null;
  }

  String groupName(String groupId) => groupNames[groupId] ?? '';
}

/// فيوموديل الجدول — أسبوع قابل للتنقل؛ التوليد RPC خادمي (0022)
/// والعميل يعرض فقط. إلغاء الحصة أمر مباشر على الريبو.
class ScheduleViewModel extends Notifier<UiState<ScheduleData>> {
  int _weekOffset = 0;

  @override
  UiState<ScheduleData> build() {
    Future.microtask(load);
    return const UiState.loading();
  }

  static DateTime _sundayOf(DateTime d) {
    final date = DateTime(d.year, d.month, d.day);
    return date.subtract(Duration(days: date.weekday % 7));
  }

  Future<void> load() async {
    state = const UiState.loading();
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      final weekStart =
          _sundayOf(DateTime.now()).add(Duration(days: _weekOffset * 7));
      final weekEnd = weekStart.add(const Duration(days: 6));
      final scheduleRepo = ref.read(scheduleRepositoryProvider);
      final sessions =
          await scheduleRepo.sessionsInRange(teacherId, weekStart, weekEnd);
      final holidays = await scheduleRepo.holidays(teacherId);
      final groups = await ref.read(groupsRepositoryProvider).list(teacherId);
      state = UiState.data(
        ScheduleData(
          weekStart: weekStart,
          sessions: sessions,
          holidays: holidays,
          groupNames: {for (final g in groups) g.id: g.name},
        ),
      );
    } on AppError catch (e) {
      state = UiState.error(e);
    } catch (_) {
      state = UiState.error(AppError.unknown());
    }
  }

  Future<void> nextWeek() async {
    _weekOffset++;
    await load();
  }

  Future<void> prevWeek() async {
    _weekOffset--;
    await load();
  }

  Future<void> thisWeek() async {
    _weekOffset = 0;
    await load();
  }

  bool get isCurrentWeek => _weekOffset == 0;

  /// تحديث الحصص من جداول المجموعات (RPC التوليد الخادمي) ثم إعادة تحميل.
  Future<AppError?> refreshFromGroups() async {
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      await ref
          .read(scheduleRepositoryProvider)
          .generateTeacherSessions(teacherId);
      await load();
      return null;
    } on AppError catch (e) {
      return e;
    } catch (_) {
      return AppError.unknown();
    }
  }

  /// إلغاء حصة — يعيد AppError عند الفشل وnull عند النجاح.
  Future<AppError?> cancelSession(String sessionId) async {
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      await ref
          .read(scheduleRepositoryProvider)
          .cancelSession(teacherId, sessionId);
      await load();
      return null;
    } on AppError catch (e) {
      return e;
    } catch (_) {
      return AppError.unknown();
    }
  }
}

final scheduleViewModelProvider =
    NotifierProvider<ScheduleViewModel, UiState<ScheduleData>>(
  ScheduleViewModel.new,
);
