import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/core/error/app_error_l10n.dart';
import 'package:mister/core/ui/format.dart';
import 'package:mister/core/widgets/app_avatar.dart';
import 'package:mister/core/widgets/app_badge.dart';
import 'package:mister/core/widgets/app_chip.dart';
import 'package:mister/core/widgets/app_fab.dart';
import 'package:mister/core/widgets/app_toast.dart';
import 'package:mister/core/widgets/list_row.dart';
import 'package:mister/core/widgets/states.dart';
import 'package:mister/features/students/domain/models/student.dart';
import 'package:mister/features/students/ui/student_form_sheet.dart';
import 'package:mister/features/students/ui/students_list_view_model.dart';
import 'package:mister/l10n/app_localizations.dart';

/// 4-2 الطلاب: قائمة + بحث فوري + تصفية بالمجموعة (فلترة عرض محلية).
class StudentsListView extends ConsumerStatefulWidget {
  const StudentsListView({super.key});

  @override
  ConsumerState<StudentsListView> createState() => _StudentsListViewState();
}

class _StudentsListViewState extends ConsumerState<StudentsListView> {
  String _query = '';
  String? _groupId;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(studentsListViewModelProvider);
    final vm = ref.read(studentsListViewModelProvider.notifier);

    return Scaffold(
      body: switch (state) {
        UiLoading<StudentsData>() ||
        UiInitial<StudentsData>() =>
          const Padding(padding: EdgeInsets.all(16), child: SkeletonRows()),
        UiError<StudentsData>(:final error) => Center(
            child: ErrorState(
              message: localizeAppError(l10n, error),
              onRetry: vm.load,
            ),
          ),
        UiData<StudentsData>(:final value) => _body(context, value),
      },
      floatingActionButton: AppFab(
        label: l10n.students_fab_new,
        tooltip: l10n.students_fab_add_aria,
        onPressed: () async {
          final saved = await showStudentFormSheet(context);
          if (saved == true && context.mounted) {
            showAppSuccessToast(context, l10n.students_add_student);
          }
        },
      ),
    );
  }

  Widget _body(BuildContext context, StudentsData data) {
    final l10n = AppLocalizations.of(context);
    final activeGroups =
        data.groups.where((g) => g.archivedAt == null).toList();
    final filtered = data.students.where((s) {
      if (_groupId != null &&
          data.primaryGroupOf(s.id)?.id != _groupId &&
          !data.enrollments
              .any((e) => e.studentId == s.id && e.groupId == _groupId)) {
        return false;
      }
      if (_query.isNotEmpty &&
          !s.name.contains(_query) &&
          !(s.phone?.contains(_query) ?? false) &&
          !s.publicCode.contains(_query)) {
        return false;
      }
      return true;
    }).toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 16, 8),
          child: TextField(
            onChanged: (v) => setState(() => _query = v.trim()),
            decoration: InputDecoration(
              hintText: l10n.students_search_placeholder,
              prefixIcon: const Icon(Icons.search),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsetsDirectional.only(start: 16, end: 16),
          child: AppChipRow(
            children: [
              AppChip(
                label: l10n.students_all_groups,
                selected: _groupId == null,
                onSelected: (_) => setState(() => _groupId = null),
              ),
              for (final g in activeGroups)
                AppChip(
                  label: g.name,
                  selected: _groupId == g.id,
                  onSelected: (sel) =>
                      setState(() => _groupId = sel ? g.id : null),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: data.students.isEmpty
              ? EmptyState(
                  icon: Icons.people_outline,
                  title: l10n.students_empty_none_title,
                  hint: l10n.students_empty_none_hint,
                )
              : filtered.isEmpty
                  ? EmptyState(
                      icon: Icons.search_off,
                      title: l10n.students_empty_no_match_title,
                      hint: l10n.students_empty_no_match_hint,
                    )
                  : RefreshIndicator(
                      onRefresh:
                          ref.read(studentsListViewModelProvider.notifier).load,
                      child: ListView.separated(
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (context, i) =>
                            _studentRow(context, data, filtered[i]),
                      ),
                    ),
        ),
      ],
    );
  }

  Widget _studentRow(BuildContext context, StudentsData data, Student s) {
    final l10n = AppLocalizations.of(context);
    final group = data.primaryGroupOf(s.id);
    final balance = data.balanceOf(s.id);
    return AppListRow(
      leading: AppAvatar(name: s.name),
      title: s.name,
      subtitle: group?.name ?? l10n.students_no_group,
      trailing: s.paused
          ? AppBadge(label: l10n.students_badge_paused)
          : balance < 0
              ? AppBadge(
                  label: l10n.students_badge_due(formatAmount(-balance)),
                  tone: AppBadgeTone.bad,
                )
              : AppBadge(
                  label: l10n.students_badge_paid,
                  tone: AppBadgeTone.ok,
                ),
      onTap: () => context.push('/students/${s.id}'),
    );
  }
}
