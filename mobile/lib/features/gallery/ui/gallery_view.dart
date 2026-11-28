import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/core/error/app_error_l10n.dart';
import 'package:mister/core/theme/app_colors.dart';
import 'package:mister/core/theme/appearance_providers.dart';
import 'package:mister/core/widgets/app_avatar.dart';
import 'package:mister/core/widgets/app_badge.dart';
import 'package:mister/core/widgets/app_button.dart';
import 'package:mister/core/widgets/app_card.dart';
import 'package:mister/core/widgets/app_chip.dart';
import 'package:mister/core/widgets/app_fab.dart';
import 'package:mister/core/widgets/app_logo.dart';
import 'package:mister/core/widgets/app_sheet.dart';
import 'package:mister/core/widgets/app_text_field.dart';
import 'package:mister/core/widgets/app_toast.dart';
import 'package:mister/core/widgets/field_error.dart';
import 'package:mister/core/widgets/list_row.dart';
import 'package:mister/core/widgets/page_tool_bar.dart';
import 'package:mister/core/widgets/states.dart';
import 'package:mister/l10n/app_localizations.dart';

/// شاشة عرض المكونات — بوابة خروج F1-T3 (مواصفة COMPONENT-GALLERY-SPEC).
/// سطح تطوير محلي: لا ريبو ولا ViewModel بيانات؛ الحالة الوحيدة هي
/// مبدّلات اللغة/الثيم نفسها (فورية، بلا إعادة تشغيل). الاتجاه يتبع
/// اللغة دائمًا — التوليفات الأربع: AR-RTL/EN-LTR × فاتح/داكن.
/// عناوين الأقسام من المواصفة (§2) — لا مفاتيح قاموس لها (سطح تطوير).
class GalleryView extends ConsumerWidget {
  const GalleryView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('معرض المكونات — F1-T3'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: l10n.shell_back,
          onPressed: () => context.pop(),
        ),
      ),
      body: ListView(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 16, 32),
        children: [
          const _Toggles(),
          const SizedBox(height: 8),
          _Section(
            title: '1 · الأزرار',
            child: _buttonsSection(context),
          ),
          _Section(
            title: '2 · النماذج',
            child: _formsSection(context),
          ),
          _Section(
            title: '3 · الرقائق',
            child: _chipsSection(context),
          ),
          _Section(
            title: '4 · البطاقات',
            child: _cardsSection(context),
          ),
          _Section(
            title: '5 · القوائم',
            child: _listsSection(context),
          ),
          _Section(
            title: '6 · الأوراق والتأكيد',
            child: _sheetsSection(context),
          ),
          _Section(
            title: '7 · الحالات',
            child: _statesSection(context),
          ),
          _Section(
            title: '8 · التنبيهات',
            child: _toastsSection(context),
          ),
          _Section(
            title: '9 · الأفعال العائمة',
            child: _fabSection(context),
          ),
          _Section(
            title: '10 · الهوية',
            child: _identitySection(context),
          ),
          _Section(
            title: '11 · الأخطاء (عقد §5)',
            child: _errorsSection(context),
          ),
        ],
      ),
    );
  }

  Widget _buttonsSection(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        AppButton(
          label: l10n.groups_form_save,
          onPressed: () => showAppToast(context, l10n.groups_form_save),
        ),
        AppButton(
          label: l10n.groups_edit,
          variant: AppButtonVariant.soft,
          onPressed: () {},
        ),
        AppButton(
          label: l10n.students_detail_delete_btn,
          variant: AppButtonVariant.danger,
          onPressed: () {},
        ),
        AppButton(
          label: l10n.groups_cancel,
          variant: AppButtonVariant.ghost,
          onPressed: () {},
        ),
        AppButton(label: l10n.common_loading, onPressed: null),
        AppButton(label: l10n.groups_saving, loading: true, onPressed: () {}),
      ],
    );
  }

  Widget _formsSection(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppTextField(
          label: l10n.students_form_name_label,
          hint: l10n.students_form_name_placeholder,
        ),
        const SizedBox(height: 12),
        AppTextField(
          label: l10n.students_student_phone_label,
          error: l10n.students_form_name_required,
        ),
        const SizedBox(height: 12),
        AppSelectField<String>(
          label: l10n.students_enroll_group_label,
          value: 'g1',
          items: const [
            DropdownMenuItem(value: 'g1', child: Text('فيزياء 3 ثانوي')),
            DropdownMenuItem(value: 'g2', child: Text('رياضيات 2 ثانوي')),
          ],
          onChanged: (_) {},
        ),
        const SizedBox(height: 12),
        AppTextArea(label: l10n.students_form_level_note_label),
        const SizedBox(height: 12),
        FormError(message: l10n.common_unexpected_error),
      ],
    );
  }

  Widget _chipsSection(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return AppChipRow(
      children: [
        AppChip(
          label: l10n.students_all_groups,
          selected: true,
          onSelected: (_) {},
        ),
        AppChip(
          label: l10n.groups_filter_active,
          selected: false,
          onSelected: (_) {},
        ),
        AppChip(
          label: l10n.groups_filter_archived,
          selected: false,
          onSelected: (_) {},
        ),
        AppChip(
          label: l10n.common_filter,
          selected: false,
          onSelected: (_) {},
        ),
      ],
    );
  }

  Widget _cardsSection(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'فيزياء 3 ثانوي — السبت',
                  style: theme.textTheme.bodyLarge
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              AppBadge(label: l10n.students_badge_paid, tone: AppBadgeTone.ok),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            l10n.schedule_session_meta('90', '4:00 م'),
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              AppButton(
                label: l10n.groups_edit,
                icon: Icons.edit_outlined,
                variant: AppButtonVariant.soft,
                onPressed: () {},
              ),
              const SizedBox(width: 8),
              AppButton(
                label: l10n.schedule_attendance_btn,
                icon: Icons.check_circle_outline,
                variant: AppButtonVariant.ghost,
                onPressed: () {},
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _listsSection(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PageToolBar(
          title: l10n.shell_title_students,
          actions: [
            IconButton(icon: const Icon(Icons.add), onPressed: () {}),
          ],
        ),
        StickyGroupHeader(
          title: l10n.students_section_header(2, l10n.shell_title_students),
        ),
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              AppListRow(
                leading: const AppAvatar(name: 'أحمد محمد علي'),
                title: 'أحمد محمد علي',
                subtitle: 'فيزياء 3 ثانوي — السبت',
                trailing: AppBadge(
                  label: l10n.students_badge_paid,
                  tone: AppBadgeTone.ok,
                ),
              ),
              const Divider(height: 1),
              AppListRow(
                leading: const AppAvatar(name: 'مريم خالد سمير'),
                title: 'مريم خالد سمير',
                subtitle: 'رياضيات 2 ثانوي',
                trailing: AppBadge(
                  label: l10n.students_badge_due('400'),
                  tone: AppBadgeTone.bad,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _sheetsSection(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Wrap(
      spacing: 8,
      children: [
        AppButton(
          label: l10n.groups_form_create_title,
          variant: AppButtonVariant.soft,
          onPressed: () => showAppSheet<void>(
            context,
            child: AppSheetScaffold(
              title: l10n.groups_form_create_title,
              child: Text(l10n.groups_list_empty_hint),
            ),
          ),
        ),
        AppButton(
          label: l10n.students_detail_delete_btn,
          variant: AppButtonVariant.danger,
          onPressed: () => showDangerConfirmSheet(
            context,
            title: l10n.students_detail_delete_btn,
            lines: [l10n.students_detail_delete_line1('طالب تجريبي')],
            confirmLabel: l10n.groups_confirm_delete,
            entityName: 'طالب تجريبي',
          ),
        ),
      ],
    );
  }

  Widget _statesSection(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SkeletonCards(count: 1),
        const SizedBox(height: 12),
        const SkeletonRows(count: 2),
        const SizedBox(height: 12),
        EmptyState(
          icon: Icons.people_outline,
          title: l10n.students_empty_none_title,
          hint: l10n.students_empty_none_hint,
          actionLabel: l10n.students_add_student,
          onAction: () {},
        ),
        ErrorState(
          message: l10n.common_network_error,
          onRetry: () => showAppToast(context, l10n.common_retry),
        ),
        SignInRequired(onSignIn: () {}),
        const NoTeacherProfile(),
        const ComingSoonState(),
      ],
    );
  }

  Widget _toastsSection(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Wrap(
      spacing: 8,
      children: [
        AppButton(
          label: l10n.students_add_student,
          variant: AppButtonVariant.soft,
          onPressed: () => showAppToast(context, l10n.students_add_student),
        ),
        AppButton(
          label: l10n.groups_archived_toast('مجموعة تجريبية'),
          variant: AppButtonVariant.soft,
          onPressed: () => showAppSuccessToast(
            context,
            l10n.groups_archived_toast('مجموعة تجريبية'),
          ),
        ),
      ],
    );
  }

  Widget _fabSection(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return SizedBox(
      height: 64,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          AppFab(onPressed: () {}, tooltip: l10n.groups_fab_aria),
          const SizedBox(width: 12),
          AppFab(
            label: l10n.students_fab_new,
            onPressed: () {},
            tooltip: l10n.students_fab_add_aria,
          ),
        ],
      ),
    );
  }

  Widget _identitySection(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final labels = [
      l10n.common_accent_indigo,
      l10n.common_accent_violet,
      l10n.common_accent_blue,
      l10n.common_accent_teal,
      l10n.common_accent_green,
      l10n.common_accent_amber,
      l10n.common_accent_pink,
      l10n.common_accent_red,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const AppLogo(showTitle: true),
        const SizedBox(height: 16),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (var i = 0; i < AppColors.brandPalette.length; i++)
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: AppColors.brandPalette[i],
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    labels[i],
                    style: Theme.of(context).textTheme.labelMedium,
                  ),
                ],
              ),
          ],
        ),
      ],
    );
  }

  Widget _errorsSection(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    // مفاتيح عقد §5-2 كاملة: التسعة الجدد + المزامنة (v1.1)
    // + delete_blocked + الاحتياطي الوحيد — كلها أمثلة مهذبة، لا خام.
    final errors = <(String, String)>[
      ('common_network_error', l10n.common_network_error),
      ('common_timeout', l10n.common_timeout),
      ('common_duplicate_entry', l10n.common_duplicate_entry),
      ('common_no_permission', l10n.common_no_permission),
      ('common_session_expired', l10n.common_session_expired),
      ('auth_invalid_credentials', l10n.auth_invalid_credentials),
      ('auth_email_not_confirmed', l10n.auth_email_not_confirmed),
      ('auth_too_many_attempts', l10n.auth_too_many_attempts),
      ('auth_otp_expired', l10n.auth_otp_expired),
      ('attendance_sync_failed_error', l10n.attendance_sync_failed_error),
      ('attendance_sync_pending_error', l10n.attendance_sync_pending_error),
      ('common_delete_blocked_by_links', l10n.common_delete_blocked_by_links),
      ('common_unexpected_error', l10n.common_unexpected_error),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const SkeletonBox(width: 60, height: 10),
            const SizedBox(width: 8),
            Icon(Icons.check_circle, size: 16, color: context.appColors.ok),
            const SizedBox(width: 8),
            Icon(
              Icons.error_outline,
              size: 16,
              color: context.appColors.badText,
            ),
            const SizedBox(width: 8),
            Text(
              'UiState: initial / loading / data / error',
              style: Theme.of(context).textTheme.labelMedium,
              textDirection: TextDirection.ltr,
            ),
          ],
        ),
        const SizedBox(height: 12),
        for (final e in errors)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: AppCard(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          e.$1,
                          style: Theme.of(context).textTheme.labelMedium,
                          textDirection: TextDirection.ltr,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          e.$2,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.message_outlined, size: 20),
                    tooltip: 'SnackBar',
                    onPressed: () => showAppToast(context, e.$2),
                  ),
                ],
              ),
            ),
          ),
        // مثال حي: خطأ أمر يُعرَض SnackBar وخطأ تحميل يُعرَض inline.
        AppButton(
          label: localizeAppError(
            l10n,
            AppError.network(),
          ),
          variant: AppButtonVariant.soft,
          onPressed: () =>
              showAppToast(context, localizeAppError(l10n, AppError.network())),
        ),
      ],
    );
  }
}

/// مبدّلات اللغة/الثيم الفورية أعلى المعرض.
class _Toggles extends ConsumerWidget {
  const _Toggles();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final themeMode = ref.watch(themeModeProvider);
    final locale = ref.watch(localeProvider);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppChipRow(
            children: [
              AppChip(
                label: 'العربية',
                selected: locale.languageCode == 'ar',
                onSelected: (_) => ref.read(localeProvider.notifier).state =
                    const Locale('ar'),
              ),
              AppChip(
                label: 'English',
                selected: locale.languageCode == 'en',
                onSelected: (_) => ref.read(localeProvider.notifier).state =
                    const Locale('en'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          AppChipRow(
            children: [
              AppChip(
                label: l10n.settings_settings_api_theme_auto,
                selected: themeMode == ThemeMode.system,
                onSelected: (_) => ref.read(themeModeProvider.notifier).state =
                    ThemeMode.system,
              ),
              AppChip(
                label: l10n.settings_settings_api_theme_light,
                selected: themeMode == ThemeMode.light,
                onSelected: (_) => ref.read(themeModeProvider.notifier).state =
                    ThemeMode.light,
              ),
              AppChip(
                label: l10n.settings_settings_api_theme_dark,
                selected: themeMode == ThemeMode.dark,
                onSelected: (_) =>
                    ref.read(themeModeProvider.notifier).state = ThemeMode.dark,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// قسم معرض بعنوان من المواصفة + فاصل.
class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}
