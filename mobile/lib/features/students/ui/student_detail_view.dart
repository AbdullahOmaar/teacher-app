import 'package:mister/core/error/app_error.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mister/core/error/app_error_l10n.dart';
import 'package:mister/core/ui/format.dart';
import 'package:mister/core/widgets/app_avatar.dart';
import 'package:mister/core/widgets/app_badge.dart';
import 'package:mister/core/widgets/app_button.dart';
import 'package:mister/core/widgets/app_card.dart';
import 'package:mister/core/widgets/app_chip.dart';
import 'package:mister/core/widgets/app_sheet.dart';
import 'package:mister/core/widgets/app_toast.dart';
import 'package:mister/core/widgets/list_row.dart';
import 'package:mister/core/widgets/states.dart';
import 'package:mister/features/students/ui/student_detail_view_model.dart';
import 'package:mister/features/students/ui/student_form_sheet.dart';
import 'package:mister/features/students/ui/students_list_view_model.dart';
import 'package:mister/l10n/app_localizations.dart';

/// 4-3 ملف طالب — ترويسة + تبويبات (بيانات/مجموعات حقيقية،
/// وبقية التبويبات بحالة «قريبًا» المصممة — سابقة الويب).
class StudentDetailView extends ConsumerStatefulWidget {
  const StudentDetailView({required this.studentId, super.key});

  final String studentId;

  @override
  ConsumerState<StudentDetailView> createState() => _StudentDetailViewState();
}

class _StudentDetailViewState extends ConsumerState<StudentDetailView> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final provider = studentDetailViewModelProvider(widget.studentId);
    final state = ref.watch(provider);
    final vm = ref.read(provider.notifier);

    return switch (state) {
      UiLoading<StudentDetailData>() ||
      UiInitial<StudentDetailData>() =>
        const LoadingState(),
      UiError<StudentDetailData>(:final error) => Center(
          child: ErrorState(
            message: localizeAppError(l10n, error),
            onRetry: vm.load,
          ),
        ),
      UiData<StudentDetailData>(:final value) => value.student == null
          ? EmptyState(
              icon: Icons.person_off_outlined,
              title: l10n.students_detail_not_found_title,
              hint: l10n.students_detail_not_found_hint,
            )
          : _body(context, value),
    };
  }

  Widget _body(BuildContext context, StudentDetailData data) {
    final l10n = AppLocalizations.of(context);
    final student = data.student!;
    final tabs = [
      l10n.students_detail_tab_data,
      l10n.students_detail_tab_groups,
      l10n.students_detail_tab_att,
      l10n.students_detail_tab_pay,
      l10n.students_detail_tab_grades,
      l10n.students_detail_tab_notes,
    ];
    return ListView(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 16, 24),
      children: [
        AppCard(
          child: Row(
            children: [
              AppAvatar(name: student.name, size: 56),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      student.name,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      l10n.students_detail_code_prefix + student.publicCode,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 6),
                    if (student.paused)
                      AppBadge(label: l10n.students_badge_paused)
                    else if (data.balance < 0)
                      AppBadge(
                        label: l10n
                            .students_badge_due(formatAmount(-data.balance)),
                        tone: AppBadgeTone.bad,
                      )
                    else
                      AppBadge(
                        label: l10n.students_badge_paid,
                        tone: AppBadgeTone.ok,
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        AppChipRow(
          children: [
            for (var i = 0; i < tabs.length; i++)
              AppChip(
                label: tabs[i],
                selected: _tab == i,
                onSelected: (_) => setState(() => _tab = i),
              ),
          ],
        ),
        const SizedBox(height: 16),
        if (_tab == 0) _dataTab(context, data),
        if (_tab == 1) _groupsTab(context, data),
        if (_tab >= 2) const ComingSoonState(),
      ],
    );
  }

  Widget _dataTab(BuildContext context, StudentDetailData data) {
    final l10n = AppLocalizations.of(context);
    final s = data.student!;
    final rows = <(String, String?)>[
      (l10n.students_grade_label, s.grade),
      (l10n.students_school_label, s.school),
      (l10n.students_student_phone_label, s.phone),
      (l10n.students_guardian_label, s.guardianName),
      (l10n.students_guardian_phone_label, s.guardianPhone),
      (l10n.students_detail_level_note_label, s.levelNote),
    ];
    return Column(
      children: [
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (final row in rows)
                if (row.$2 != null && row.$2!.isNotEmpty)
                  AppListRow(title: row.$1, trailing: Text(row.$2!)),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: AppButton(
                label: l10n.groups_edit,
                icon: Icons.edit_outlined,
                variant: AppButtonVariant.soft,
                onPressed: () async {
                  final saved = await showStudentFormSheet(context, initial: s);
                  if (saved == true && context.mounted) {
                    ref.invalidate(
                      studentDetailViewModelProvider(widget.studentId),
                    );
                    showAppSuccessToast(context, l10n.students_form_edit_title);
                  }
                },
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: AppButton(
                label: l10n.students_detail_delete_btn,
                icon: Icons.delete_outline,
                variant: AppButtonVariant.danger,
                onPressed: () => _confirmDelete(context, data),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _groupsTab(BuildContext context, StudentDetailData data) {
    final l10n = AppLocalizations.of(context);
    if (data.enrollments.isEmpty) {
      return EmptyState(
        icon: Icons.groups_outlined,
        title: l10n.students_detail_no_groups_title,
        hint: l10n.students_detail_no_groups_hint,
      );
    }
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (final e in data.enrollments)
            AppListRow(
              leading: const Icon(Icons.group_outlined),
              title: data.groupName(e.groupId),
              subtitle: e.priceOverride != null
                  ? l10n.students_detail_enroll_price(
                      formatAmount(e.priceOverride!),
                    )
                  : null,
            ),
        ],
      ),
    );
  }

  Future<void> _confirmDelete(
    BuildContext context,
    StudentDetailData data,
  ) async {
    final l10n = AppLocalizations.of(context);
    final s = data.student!;
    final confirmed = await showDangerConfirmSheet(
      context,
      title: l10n.students_detail_delete_btn,
      lines: [
        l10n.students_detail_delete_line1(s.name),
        l10n.students_detail_delete_line2,
        // ترتيب وسائط gen-l10n أبجدي: (attendance, enrollments, scores).
        l10n.students_detail_delete_line3(
          '0',
          '${data.enrollments.length}',
          '0',
        ),
      ],
      confirmLabel: l10n.groups_confirm_delete,
      entityName: s.name,
    );
    if (!confirmed || !context.mounted) return;
    final provider = studentDetailViewModelProvider(widget.studentId);
    final error = await ref.read(provider.notifier).deleteStudent();
    if (!context.mounted) return;
    if (error != null) {
      showAppToast(context, localizeAppError(l10n, error));
      return;
    }
    ref.invalidate(studentsListViewModelProvider);
    showAppSuccessToast(
      context,
      l10n.students_detail_deleted_toast(s.name),
    );
    context.pop();
  }
}
