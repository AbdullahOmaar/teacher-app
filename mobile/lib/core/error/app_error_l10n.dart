import 'package:mister/core/error/app_error.dart';
import 'package:mister/l10n/app_localizations.dart';

/// ترجمة AppError لعرضه — الواجهة لا ترى إلا نص مفتاح ARB (عقود §5).
/// أي مفتاح غير معروف هنا يسقط للاحتياطي الوحيد `common_unexpected_error`.
String localizeAppError(AppLocalizations l10n, AppError error) {
  return switch (error.arbKey) {
    'common_network_error' => l10n.common_network_error,
    'common_timeout' => l10n.common_timeout,
    'common_duplicate_entry' => l10n.common_duplicate_entry,
    'common_no_permission' => l10n.common_no_permission,
    'common_delete_blocked_by_links' => l10n.common_delete_blocked_by_links,
    'common_session_expired' => l10n.common_session_expired,
    'attendance_sync_failed_error' => l10n.attendance_sync_failed_error,
    'attendance_sync_pending_error' => l10n.attendance_sync_pending_error,
    _ => l10n.common_unexpected_error,
  };
}
