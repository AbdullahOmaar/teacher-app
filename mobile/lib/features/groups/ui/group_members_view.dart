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
import 'package:mister/core/widgets/list_row.dart';
import 'package:mister/core/widgets/page_tool_bar.dart';
import 'package:mister/core/widgets/states.dart';
import 'package:mister/features/groups/ui/group_members_view_model.dart';
import 'package:mister/features/students/ui/student_form_sheet.dart';
import 'package:mister/l10n/app_localizations.dart';

/// 4-6 أعضاء مجموعة — قائمة المسجلين + مدخل لقائمة الانتظار (4-7).
class GroupMembersView extends ConsumerWidget {
  const GroupMembersView({required this.groupId, super.key});

  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final provider = groupMembersViewModelProvider(groupId);
    final state = ref.watch(provider);
    final vm = ref.read(provider.notifier);

    return switch (state) {
      UiLoading<GroupMembersData>() ||
      UiInitial<GroupMembersData>() =>
        const LoadingState(),
      UiError<GroupMembersData>(:final error) => Center(
          child: ErrorState(
            message: localizeAppError(l10n, error),
            onRetry: vm.load,
          ),
        ),
      UiData<GroupMembersData>(:final value) => value.group == null
          ? EmptyState(
              icon: Icons.group_off_outlined,
              title: l10n.groups_detail_not_found_title,
              hint: l10n.groups_detail_not_found_hint,
            )
          : _body(context, ref, value),
    };
  }

  Widget _body(BuildContext context, WidgetRef ref, GroupMembersData data) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final group = data.group!;
    return ListView(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 16, 24),
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      group.name,
                      style: theme.textTheme.titleMedium,
                    ),
                  ),
                  if (group.archivedAt != null)
                    AppBadge(label: l10n.groups_badge_archived),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                [
                  billingTypeLabel(l10n, group.billingType),
                  formatAmount(group.price),
                  if (group.capacity != null)
                    // ترتيب وسائط gen-l10n أبجدي: (capacity, done).
                    l10n.groups_detail_capacity(
                      '${group.capacity}',
                      '${data.members.length}',
                    )
                  else
                    l10n.groups_list_enrolled_count(data.members.length),
                ].join(' · '),
                style: theme.textTheme.bodySmall,
              ),
              if (group.assistantName != null) ...[
                const SizedBox(height: 4),
                Text(
                  l10n.groups_detail_assistant(group.assistantName!),
                  style: theme.textTheme.bodySmall,
                ),
              ],
              if (group.archivedAt != null) ...[
                const SizedBox(height: 8),
                Text(
                  l10n.groups_archived_info,
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        PageToolBar(
          title: l10n.groups_roster_title(data.members.length),
          actions: [
            TextButton.icon(
              onPressed: () => context.push('/groups/$groupId/waitlist'),
              icon: const Icon(Icons.hourglass_empty, size: 18),
              label: Text(l10n.groups_waitlist_title(data.waitlistCount)),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (data.members.isEmpty)
          EmptyState(
            icon: Icons.people_outline,
            title: l10n.groups_roster_empty_title,
            hint: l10n.groups_roster_empty_hint,
          )
        else
          AppCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (final s in data.members)
                  AppListRow(
                    leading: AppAvatar(name: s.name),
                    title: s.name,
                    subtitle: s.phone,
                    trailing: s.paused
                        ? AppBadge(label: l10n.groups_badge_paused)
                        : null,
                    onTap: () => context.push('/students/${s.id}'),
                  ),
              ],
            ),
          ),
        const SizedBox(height: 16),
        AppButton(
          label: l10n.groups_add_student_btn,
          icon: Icons.person_add_outlined,
          full: true,
          onPressed: () async {
            final saved = await showStudentFormSheet(context);
            if (saved == true) {
              ref.invalidate(groupMembersViewModelProvider(groupId));
            }
          },
        ),
      ],
    );
  }
}
