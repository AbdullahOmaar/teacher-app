import 'package:flutter/material.dart';
import 'package:mister/core/ui/format.dart';
import 'package:mister/core/widgets/app_badge.dart';
import 'package:mister/core/widgets/app_card.dart';
import 'package:mister/features/schedule/domain/models/session.dart';
import 'package:mister/l10n/app_localizations.dart';

/// بطاقة حصة بنمط الكروت المعتمد (جرد التصميم §4-3): سطر عنوان + شارة
/// حالة · سطر أرقام (وقت/مدة) · تُستخدم في الرئيسية والجدول معًا.
class SessionCard extends StatelessWidget {
  const SessionCard({
    required this.session,
    required this.groupName,
    this.onTap,
    this.trailing,
    super.key,
  });

  final Session session;
  final String groupName;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final cancelled = session.status == SessionStatus.cancelled;
    return AppCard(
      onTap: onTap,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        groupName,
                        style: theme.textTheme.bodyLarge
                            ?.copyWith(fontWeight: FontWeight.w600),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (session.kind == SessionKind.extra)
                      AppBadge(
                        label: l10n.schedule_kind_extra,
                        tone: AppBadgeTone.primary,
                      )
                    else if (session.kind == SessionKind.moved)
                      AppBadge(
                        label: l10n.schedule_kind_moved,
                        tone: AppBadgeTone.primary,
                      ),
                    if (cancelled) ...[
                      const SizedBox(width: 6),
                      AppBadge(
                        label: l10n.schedule_badge_cancelled,
                        tone: AppBadgeTone.bad,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  // ترتيب وسائط gen-l10n أبجدي: (duration, time).
                  l10n.schedule_session_meta(
                    '${session.durationMinutes}',
                    formatTimeOfDay(session.startTime),
                  ),
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: 8),
            trailing!,
          ],
        ],
      ),
    );
  }
}
