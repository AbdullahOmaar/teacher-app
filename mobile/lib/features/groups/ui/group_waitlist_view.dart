import 'package:mister/core/error/app_error.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/core/error/app_error_l10n.dart';
import 'package:mister/core/widgets/app_avatar.dart';
import 'package:mister/core/widgets/app_badge.dart';
import 'package:mister/core/widgets/app_button.dart';
import 'package:mister/core/widgets/app_card.dart';
import 'package:mister/core/widgets/app_toast.dart';
import 'package:mister/core/widgets/list_row.dart';
import 'package:mister/core/widgets/states.dart';
import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/features/groups/ui/group_waitlist_view_model.dart';
import 'package:mister/l10n/app_localizations.dart';

/// 4-7 قائمة انتظار مجموعة — منتظرون مرتّبون + فعل ترقية لطالب.
class GroupWaitlistView extends ConsumerWidget {
  const GroupWaitlistView({required this.groupId, super.key});

  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final provider = groupWaitlistViewModelProvider(groupId);
    final state = ref.watch(provider);
    final vm = ref.read(provider.notifier);

    return switch (state) {
      UiLoading<GroupWaitlistData>() ||
      UiInitial<GroupWaitlistData>() =>
        const LoadingState(),
      UiError<GroupWaitlistData>(:final error) => Center(
          child: ErrorState(
            message: localizeAppError(l10n, error),
            onRetry: vm.load,
          ),
        ),
      UiData<GroupWaitlistData>(:final value) => _body(context, ref, value),
    };
  }

  Widget _body(BuildContext context, WidgetRef ref, GroupWaitlistData data) {
    final l10n = AppLocalizations.of(context);
    if (data.entries.isEmpty) {
      return EmptyState(
        icon: Icons.hourglass_empty,
        title: l10n.groups_waitlist_title(0),
        hint: l10n.groups_waitlist_empty,
      );
    }
    return ListView(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 16, 24),
      children: [
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (final entry in data.entries) _entryRow(context, ref, entry),
            ],
          ),
        ),
        if (data.group?.archivedAt != null) ...[
          const SizedBox(height: 12),
          Text(
            l10n.groups_wl_archived_note,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }

  Widget _entryRow(BuildContext context, WidgetRef ref, GroupWaitlist entry) {
    final l10n = AppLocalizations.of(context);
    return Column(
      children: [
        AppListRow(
          leading: AppAvatar(name: entry.name),
          title: entry.name,
          subtitle: entry.phone,
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (entry.source == 'booking_page')
                AppBadge(
                  label: l10n.groups_wl_source_booking,
                  tone: AppBadgeTone.primary,
                ),
              if (entry.wantsTrial) ...[
                const SizedBox(width: 6),
                AppBadge(
                  label: l10n.groups_wl_wants_trial,
                  tone: AppBadgeTone.warn,
                ),
              ],
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(16, 0, 16, 12),
          child: AppButton(
            label: l10n.groups_wl_accept_btn,
            icon: Icons.person_add_outlined,
            variant: AppButtonVariant.soft,
            full: true,
            onPressed: () async {
              final error = await ref
                  .read(groupWaitlistViewModelProvider(groupId).notifier)
                  .accept(entry);
              if (!context.mounted) return;
              if (error != null) {
                showAppToast(context, l10n.groups_wl_accept_error);
              } else {
                showAppSuccessToast(
                  context,
                  l10n.groups_wl_accepted_toast(entry.name),
                );
              }
            },
          ),
        ),
      ],
    );
  }
}
