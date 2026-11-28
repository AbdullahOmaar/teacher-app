import 'package:mister/core/error/app_error.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mister/core/error/app_error_l10n.dart';
import 'package:mister/core/theme/app_colors.dart';
import 'package:mister/core/ui/format.dart';
import 'package:mister/core/widgets/app_badge.dart';
import 'package:mister/core/widgets/app_fab.dart';
import 'package:mister/core/widgets/app_toast.dart';
import 'package:mister/core/widgets/page_tool_bar.dart';
import 'package:mister/core/widgets/session_card.dart';
import 'package:mister/core/widgets/states.dart';
import 'package:mister/features/schedule/domain/models/session.dart';
import 'package:mister/features/schedule/ui/extra_session_sheet.dart';
import 'package:mister/features/schedule/ui/schedule_view_model.dart';
import 'package:mister/l10n/app_localizations.dart';

/// 4-8 الجدول والحصص — عرض أسبوعي (أحد..سبت) + توليد خادمي + حصة إضافية
/// + إلغاء حصة. القراءة من الريبو فقط (الكاش خلفه — F1-T4).
class ScheduleView extends ConsumerWidget {
  const ScheduleView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(scheduleViewModelProvider);
    final vm = ref.read(scheduleViewModelProvider.notifier);

    return Scaffold(
      body: switch (state) {
        UiLoading<ScheduleData>() ||
        UiInitial<ScheduleData>() =>
          const LoadingState(),
        UiError<ScheduleData>(:final error) => Center(
            child: ErrorState(
              message: localizeAppError(l10n, error),
              onRetry: vm.load,
            ),
          ),
        UiData<ScheduleData>(:final value) => _body(context, ref, value),
      },
      floatingActionButton: AppFab(
        label: l10n.schedule_fab_extra_label,
        icon: Icons.add,
        tooltip: l10n.schedule_fab_extra_aria,
        onPressed: () async {
          final saved = await showExtraSessionSheet(context);
          if (saved == true && context.mounted) {
            showAppSuccessToast(context, l10n.schedule_extra_added);
          }
        },
      ),
    );
  }

  Widget _body(BuildContext context, WidgetRef ref, ScheduleData data) {
    final l10n = AppLocalizations.of(context);
    final vm = ref.read(scheduleViewModelProvider.notifier);
    final locale = Localizations.localeOf(context).toString();
    final today = DateTime.now();
    return ListView(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 16, 88),
      children: [
        Row(
          children: [
            IconButton(
              icon: const Icon(Icons.chevron_right),
              tooltip: l10n.schedule_prev_week,
              onPressed: vm.prevWeek,
            ),
            Expanded(
              child: Text(
                '${DateFormat.MMMd(locale).format(data.weekStart)} — '
                '${DateFormat.MMMd(locale).format(data.weekStart.add(const Duration(days: 6)))}',
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
            ),
            IconButton(
              icon: const Icon(Icons.chevron_left),
              tooltip: l10n.schedule_next_week,
              onPressed: vm.nextWeek,
            ),
            IconButton(
              icon: const Icon(Icons.refresh),
              tooltip: l10n.schedule_refresh_btn,
              onPressed: () async {
                final error = await vm.refreshFromGroups();
                if (!context.mounted) return;
                if (error != null) {
                  showAppToast(context, localizeAppError(l10n, error));
                } else {
                  showAppSuccessToast(context, l10n.schedule_refreshed_toast);
                }
              },
            ),
          ],
        ),
        if (!vm.isCurrentWeek)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(
              onPressed: vm.thisWeek,
              child: Text(l10n.schedule_back_to_this_week),
            ),
          ),
        const SizedBox(height: 4),
        for (var i = 0; i < 7; i++) ...[
          _daySection(
            context,
            ref,
            data,
            data.weekStart.add(Duration(days: i)),
            isToday: _sameDay(
              data.weekStart.add(Duration(days: i)),
              today,
            ),
          ),
          const SizedBox(height: 16),
        ],
        const Divider(),
        const SizedBox(height: 8),
        PageToolBar(title: l10n.schedule_holidays_title),
        const SizedBox(height: 8),
        if (data.holidays.isEmpty)
          Text(
            l10n.schedule_no_holidays,
            style: Theme.of(context).textTheme.bodySmall,
          )
        else
          for (final h in data.holidays)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  AppBadge(
                    label: l10n.schedule_holiday_badge,
                    tone: AppBadgeTone.warn,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${DateFormat.yMMMMd(locale).format(h.holidayDate)}'
                    '${h.name != null ? ' — ${h.name}' : ''}',
                  ),
                ],
              ),
            ),
      ],
    );
  }

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  Widget _daySection(
    BuildContext context,
    WidgetRef ref,
    ScheduleData data,
    DateTime day, {
    required bool isToday,
  }) {
    final l10n = AppLocalizations.of(context);
    final colors = context.appColors;
    final locale = Localizations.localeOf(context).toString();
    final sessions = data.sessionsOn(day);
    final holiday = data.holidayOn(day);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              '${weekdayName(l10n, day.weekday % 7)} '
              '${DateFormat.MMMd(locale).format(day)}',
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                color: colors.muted,
              ),
            ),
            if (isToday) ...[
              const SizedBox(width: 8),
              AppBadge(
                label: l10n.schedule_today_badge,
                tone: AppBadgeTone.primary,
              ),
            ],
            if (holiday != null) ...[
              const SizedBox(width: 8),
              AppBadge(
                label: holiday.name != null
                    ? l10n.schedule_holiday_badge_named(holiday.name!)
                    : l10n.schedule_holiday_badge,
                tone: AppBadgeTone.warn,
              ),
            ],
          ],
        ),
        const SizedBox(height: 8),
        if (sessions.isEmpty)
          Text(
            holiday != null
                ? l10n.schedule_day_holiday_empty
                : l10n.schedule_selected_no_sessions,
            style: Theme.of(context).textTheme.bodySmall,
          )
        else
          for (final session in sessions) ...[
            SessionCard(
              session: session,
              groupName: data.groupName(session.groupId),
              onTap: () => context.push('/attendance/${session.id}'),
              trailing: session.status == SessionStatus.scheduled
                  ? PopupMenuButton<String>(
                      icon: const Icon(Icons.more_vert),
                      onSelected: (value) async {
                        if (value == 'cancel') {
                          final error = await ref
                              .read(scheduleViewModelProvider.notifier)
                              .cancelSession(session.id);
                          if (!context.mounted) return;
                          if (error != null) {
                            showAppToast(
                              context,
                              localizeAppError(l10n, error),
                            );
                          } else {
                            showAppSuccessToast(
                              context,
                              l10n.schedule_session_cancelled_toast,
                            );
                          }
                        }
                      },
                      itemBuilder: (context) => [
                        PopupMenuItem(
                          value: 'cancel',
                          child: Text(l10n.schedule_cancel_session_btn),
                        ),
                      ],
                    )
                  : null,
            ),
            const SizedBox(height: 8),
          ],
      ],
    );
  }
}
