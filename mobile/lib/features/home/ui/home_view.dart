import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/core/error/app_error_l10n.dart';
import 'package:mister/core/theme/app_colors.dart';
import 'package:mister/core/ui/format.dart';
import 'package:mister/core/widgets/app_card.dart';
import 'package:mister/core/widgets/page_tool_bar.dart';
import 'package:mister/core/widgets/session_card.dart';
import 'package:mister/core/widgets/states.dart';
import 'package:mister/features/home/ui/home_view_model.dart';
import 'package:mister/l10n/app_localizations.dart';

/// 4-1 الرئيسية + «ابدأ هنا» — View نحيفة على UiState<HomeData>.
class HomeView extends ConsumerWidget {
  const HomeView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(homeViewModelProvider);
    final vm = ref.read(homeViewModelProvider.notifier);
    return switch (state) {
      UiLoading<HomeData>() || UiInitial<HomeData>() => const LoadingState(),
      UiError<HomeData>(:final error) => Center(
          child: ErrorState(
            message: localizeAppError(AppLocalizations.of(context), error),
            onRetry: vm.load,
          ),
        ),
      UiData<HomeData>(:final value) => RefreshIndicator(
          onRefresh: vm.load,
          child: _HomeBody(data: value),
        ),
    };
  }
}

class _HomeBody extends StatelessWidget {
  const _HomeBody({required this.data});

  final HomeData data;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final summary = data.summary;
    return ListView(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 16, 24),
      children: [
        if (!data.startHereDone) ...[
          _StartHereCard(data: data),
          const SizedBox(height: 16),
        ],
        Row(
          children: [
            Expanded(
              child: _KpiCard(
                icon: Icons.event_note_outlined,
                value: '${summary.sessionsToday.length}',
                label: l10n.home_today_title,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _KpiCard(
                icon: Icons.groups_outlined,
                value: '${summary.totalStudentsToday}',
                label: l10n.home_kpi_active_students,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _KpiCard(
                icon: Icons.payments_outlined,
                value: summary.outstandingTotal > 0
                    ? formatAmount(summary.outstandingTotal)
                    : '0',
                label: summary.outstandingTotal > 0
                    ? l10n.home_kpi_unpaid_invoices
                    : l10n.home_kpi_no_arrears,
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        PageToolBar(title: l10n.home_today_title),
        const SizedBox(height: 8),
        if (summary.sessionsToday.isEmpty)
          EmptyState(
            icon: Icons.event_busy_outlined,
            title: l10n.home_today_empty_title,
            hint: l10n.home_today_empty_hint,
          )
        else
          for (final session in summary.sessionsToday) ...[
            SessionCard(
              session: session,
              groupName: data.groupName(session.groupId),
              onTap: () => context.push('/attendance/${session.id}'),
            ),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

/// بطاقة «ابدأ هنا» — 3 خطوات بحالة إنجاز (تختفي عند اكتمالها).
class _StartHereCard extends StatelessWidget {
  const _StartHereCard({required this.data});

  final HomeData data;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.appColors;
    final marked = (data.summary.presentCount + data.summary.absentCount) > 0;
    final steps = [
      (label: l10n.home_start_here_step1, done: data.hasGroups),
      (label: l10n.home_start_here_step2, done: data.hasStudents),
      (label: l10n.home_start_here_step3, done: marked),
    ];
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.home_start_here_title,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            l10n.home_start_here_note,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          for (final step in steps) ...[
            Row(
              children: [
                Icon(
                  step.done ? Icons.check_circle : Icons.radio_button_unchecked,
                  size: 20,
                  color: step.done ? colors.ok : colors.muted,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    step.label,
                    style: TextStyle(
                      color: step.done ? colors.muted : colors.text,
                      decoration: step.done ? TextDecoration.lineThrough : null,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.icon,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final theme = Theme.of(context);
    return AppCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: colors.primary),
          const SizedBox(height: 8),
          Text(
            value,
            style: theme.textTheme.titleLarge?.copyWith(fontSize: 18),
          ),
          Text(
            label,
            style: theme.textTheme.bodySmall,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
