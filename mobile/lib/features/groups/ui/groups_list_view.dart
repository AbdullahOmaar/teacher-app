import 'package:mister/core/error/app_error.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mister/core/error/app_error_l10n.dart';
import 'package:mister/core/ui/format.dart';
import 'package:mister/core/widgets/app_badge.dart';
import 'package:mister/core/widgets/app_button.dart';
import 'package:mister/core/widgets/app_card.dart';
import 'package:mister/core/widgets/app_chip.dart';
import 'package:mister/core/widgets/app_fab.dart';
import 'package:mister/core/widgets/app_sheet.dart';
import 'package:mister/core/widgets/app_toast.dart';
import 'package:mister/core/widgets/states.dart';
import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/features/groups/ui/group_form_sheet.dart';
import 'package:mister/features/groups/ui/groups_list_view_model.dart';
import 'package:mister/l10n/app_localizations.dart';

/// 4-5 المجموعات: قائمة ببطاقات النمط المعتمد + تصفية نشطة/مؤرشفة
/// + إنشاء (Sheet) + أرشفة (تأكيد خطر) — لا حذف في العقد أصلًا.
class GroupsListView extends ConsumerStatefulWidget {
  const GroupsListView({super.key});

  @override
  ConsumerState<GroupsListView> createState() => _GroupsListViewState();
}

class _GroupsListViewState extends ConsumerState<GroupsListView> {
  bool _showArchived = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(groupsListViewModelProvider);
    final vm = ref.read(groupsListViewModelProvider.notifier);

    return Scaffold(
      body: switch (state) {
        UiLoading<GroupsData>() ||
        UiInitial<GroupsData>() =>
          const LoadingState(),
        UiError<GroupsData>(:final error) => Center(
            child: ErrorState(
              message: localizeAppError(l10n, error),
              onRetry: vm.load,
            ),
          ),
        UiData<GroupsData>(:final value) => _body(context, value),
      },
      floatingActionButton: AppFab(
        icon: Icons.add,
        tooltip: l10n.groups_fab_aria,
        onPressed: () async {
          final saved = await showGroupFormSheet(context);
          if (saved == true && context.mounted) {
            showAppSuccessToast(context, l10n.groups_form_create_title);
          }
        },
      ),
    );
  }

  Widget _body(BuildContext context, GroupsData data) {
    final l10n = AppLocalizations.of(context);
    final visible = data.groups
        .where(
          (g) => _showArchived ? g.archivedAt != null : g.archivedAt == null,
        )
        .toList();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 16, 4),
          child: AppChipRow(
            children: [
              AppChip(
                label: l10n.groups_filter_active,
                selected: !_showArchived,
                onSelected: (_) => setState(() => _showArchived = false),
              ),
              AppChip(
                label: l10n.groups_filter_archived,
                selected: _showArchived,
                onSelected: (_) => setState(() => _showArchived = true),
              ),
            ],
          ),
        ),
        Expanded(
          child: data.groups.isEmpty
              ? EmptyState(
                  icon: Icons.groups_outlined,
                  title: l10n.groups_list_empty_title,
                  hint: l10n.groups_list_empty_hint,
                  actionLabel: l10n.groups_list_empty_action,
                  onAction: () => showGroupFormSheet(context),
                )
              : visible.isEmpty
                  ? EmptyState(
                      icon: Icons.archive_outlined,
                      title: _showArchived
                          ? l10n.groups_list_empty_archived_title
                          : l10n.groups_list_empty_active_title,
                      hint: _showArchived
                          ? l10n.groups_list_empty_archived_hint
                          : l10n.groups_list_empty_active_hint,
                    )
                  : RefreshIndicator(
                      onRefresh:
                          ref.read(groupsListViewModelProvider.notifier).load,
                      child: ListView(
                        padding: const EdgeInsetsDirectional.fromSTEB(
                          16,
                          12,
                          16,
                          88,
                        ),
                        children: [
                          for (final g in visible) ...[
                            _groupCard(context, data, g),
                            const SizedBox(height: 12),
                          ],
                        ],
                      ),
                    ),
        ),
      ],
    );
  }

  Widget _groupCard(BuildContext context, GroupsData data, Group g) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final enrolled = data.enrolledOf(g.id);
    final archived = g.archivedAt != null;
    return AppCard(
      onTap: () => context.push('/groups/${g.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  g.name,
                  style: theme.textTheme.bodyLarge
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              if (archived)
                AppBadge(label: l10n.groups_badge_archived)
              else
                AppBadge(
                  label: billingTypeLabel(l10n, g.billingType),
                  tone: AppBadgeTone.primary,
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            [
              if (g.capacity != null)
                // ترتيب وسائط gen-l10n أبجدي: (capacity, count).
                l10n.groups_list_capacity_count('${g.capacity}', enrolled)
              else
                l10n.groups_list_enrolled_count(enrolled),
              l10n.groups_list_duration('${g.durationMinutes}'),
              formatTimeOfDay(g.startTime),
              formatAmount(g.price),
            ].join(' · '),
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              AppButton(
                // العدّاد في سطر الأرقام أعلاه — الزر قصير حتى لا يفيض
                // صف الأفعال على 375px (نمط الكروت §4-3: صف أفقي واحد).
                label: l10n.shell_title_students,
                icon: Icons.people_outline,
                variant: AppButtonVariant.soft,
                onPressed: () => context.push('/groups/${g.id}'),
              ),
              const Spacer(),
              if (!archived)
                IconButton(
                  icon: const Icon(Icons.archive_outlined),
                  tooltip: l10n.groups_archive_btn,
                  onPressed: () => _confirmArchive(context, g),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _confirmArchive(BuildContext context, Group g) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDangerConfirmSheet(
      context,
      title: l10n.groups_archive_btn,
      lines: [
        l10n.groups_archive_line1(g.name),
        l10n.groups_archive_line2,
        l10n.groups_archive_line3,
      ],
      confirmLabel: l10n.groups_confirm_archive,
    );
    if (!confirmed || !context.mounted) return;
    final error =
        await ref.read(groupsListViewModelProvider.notifier).archive(g.id);
    if (!context.mounted) return;
    if (error != null) {
      showAppToast(context, localizeAppError(l10n, error));
    } else {
      showAppSuccessToast(context, l10n.groups_archived_toast(g.name));
    }
  }
}
