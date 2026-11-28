import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mister/app_build_info.dart';
import 'package:mister/core/theme/appearance_providers.dart';
import 'package:mister/core/widgets/app_chip.dart';
import 'package:mister/core/widgets/app_logo.dart';
import 'package:mister/core/widgets/list_row.dart';
import 'package:mister/core/widgets/page_tool_bar.dart';
import 'package:mister/l10n/app_localizations.dart';

/// الإعدادات — سطح القشرة الأساسي في فيز 1: الهوية + سطر الإصدار من
/// بيانات البناء (قاعدة مالك 2026-11-25) + مبدّلا المظهر واللغة
/// + مدخل معرض المكونات (سطح تطوير F1-T3).
/// إعدادات الحساب الكاملة في F2-T4.
class SettingsView extends ConsumerWidget {
  const SettingsView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final themeMode = ref.watch(themeModeProvider);
    final locale = ref.watch(localeProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.shell_title_settings),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: l10n.shell_back,
          onPressed: () => context.pop(),
        ),
      ),
      body: ListView(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 16, 16, 24),
        children: [
          const Center(child: AppLogo(size: 56, showTitle: true)),
          const SizedBox(height: 8),
          Center(
            child: Text(
              AppBuildInfo.releaseLine,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          const SizedBox(height: 24),
          PageToolBar(title: l10n.settings_theme_label),
          const SizedBox(height: 8),
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
          const SizedBox(height: 20),
          // أسماء اللغات أعلام (لا تُترجم) — العنوان نفسه بمفتاح ARB (عقود v1.2).
          PageToolBar(
            title: l10n.settings_language_title,
          ),
          const SizedBox(height: 8),
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
          const SizedBox(height: 20),
          const Divider(),
          AppListRow(
            leading: const Icon(Icons.widgets_outlined),
            // سطح تطوير — عنوانه من مواصفة F1-T3 لا من القاموس.
            title: 'معرض المكونات',
            subtitle: 'F1-T3 — Component Gallery',
            trailing: const Icon(Icons.arrow_forward_ios, size: 16),
            onTap: () => context.push('/gallery'),
          ),
        ],
      ),
    );
  }
}
