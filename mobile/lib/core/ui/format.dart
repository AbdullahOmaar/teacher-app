import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/l10n/app_localizations.dart';

/// تنسيقات عرض موحدة — الأرقام لاتينية (0-9) بقرار موثّق في الويب
/// (`src/i18n/format.ts`: ‏ar-EG-u-nu-latn) فلا تُبدَّل هنا.

/// "16:00:00" → "4:00 م" (12 ساعة + علامة ص/م، أرقام لاتينية).
String formatTimeOfDay(String hhmmss) {
  final parts = hhmmss.split(':');
  var hour = int.parse(parts[0]);
  final minute = parts.length > 1 ? parts[1] : '00';
  final suffix = hour >= 12 ? 'م' : 'ص';
  hour = hour % 12;
  if (hour == 0) hour = 12;
  return '$hour:$minute $suffix';
}

/// مبلغ بلا كسور إن كان صحيحًا (400.0 → "400"، و400.5 → "400.5").
String formatAmount(double value) {
  if (value == value.truncateToDouble()) return value.toInt().toString();
  return value.toString();
}

/// اسم اليوم بترقيم الويب (0 = الأحد … 6 = السبت) من مفاتيح القاموس.
String weekdayName(AppLocalizations l10n, int jsDay) {
  return switch (jsDay) {
    0 => l10n.schedule_weekday_sun,
    1 => l10n.schedule_weekday_mon,
    2 => l10n.schedule_weekday_tue,
    3 => l10n.schedule_weekday_wed,
    4 => l10n.schedule_weekday_thu,
    5 => l10n.schedule_weekday_fri,
    _ => l10n.schedule_weekday_sat,
  };
}

/// تسمية نظام دفع المجموعة من مفاتيح `format_billing_*`.
String billingTypeLabel(AppLocalizations l10n, BillingType type) {
  return switch (type) {
    BillingType.monthlyFixed => l10n.format_billing_monthly_fixed,
    BillingType.perSessionPrepaid => l10n.format_billing_per_session_prepaid,
    BillingType.perSessionAttended => l10n.format_billing_per_session_attended,
    BillingType.weeklyPackage => l10n.format_billing_weekly_package,
  };
}
