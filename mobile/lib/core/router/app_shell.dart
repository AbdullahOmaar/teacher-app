import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mister/core/theme/app_colors.dart';
import 'package:mister/core/theme/appearance_providers.dart';
import 'package:mister/l10n/app_localizations.dart';

/// قشرة التنقّل السفلي — F1-T3 (ملحق ب): 4 تبويبات فقط،
/// **بلا صفحة «المزيد»** (قرار ملزم — نمط الويب لا يُنقَل للموبايل).
/// الشريط العلوي: رجوع (في غير الجذور) + عنوان من `shell_title_*`
/// + مبدّل ثيم + أفاتار ← إعدادات (نمط قشرة الويب — جرد التصميم §6).
class AppShell extends ConsumerWidget {
  const AppShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  String _titleFor(AppLocalizations l10n, String path) {
    if (path.startsWith('/students/')) return l10n.shell_title_student;
    if (path.startsWith('/students')) return l10n.shell_title_students;
    if (path.startsWith('/groups')) return l10n.shell_title_groups;
    if (path.startsWith('/schedule')) return l10n.shell_title_schedule;
    return l10n.shell_title_home;
  }

  bool _isDetail(String path) {
    final segments = path.split('/').where((s) => s.isNotEmpty).length;
    return segments > 1;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.appColors;
    final path = GoRouterState.of(context).uri.path;
    final brightness = Theme.of(context).brightness;

    return Scaffold(
      appBar: AppBar(
        leading: _isDetail(path)
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                tooltip: l10n.shell_back,
                onPressed: () => context.pop(),
              )
            : null,
        title: Text(_titleFor(l10n, path)),
        actions: [
          IconButton(
            icon: Icon(
              brightness == Brightness.dark
                  ? Icons.light_mode_outlined
                  : Icons.dark_mode_outlined,
            ),
            tooltip: l10n.shell_toggle_theme,
            onPressed: () {
              ref.read(themeModeProvider.notifier).state =
                  brightness == Brightness.dark
                      ? ThemeMode.light
                      : ThemeMode.dark;
            },
          ),
          IconButton(
            icon: CircleAvatar(
              radius: 14,
              backgroundColor: colors.soft,
              child: Text(
                l10n.shell_avatar_fallback,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: colors.primaryDark,
                ),
              ),
            ),
            tooltip: l10n.shell_settings,
            onPressed: () => context.push('/settings'),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: (index) {
          navigationShell.goBranch(
            index,
            initialLocation: index == navigationShell.currentIndex,
          );
        },
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.home_outlined),
            selectedIcon: const Icon(Icons.home),
            label: l10n.shell_nav_home,
          ),
          NavigationDestination(
            icon: const Icon(Icons.people_outline),
            selectedIcon: const Icon(Icons.people),
            label: l10n.shell_nav_students,
          ),
          NavigationDestination(
            icon: const Icon(Icons.groups_outlined),
            selectedIcon: const Icon(Icons.groups),
            label: l10n.shell_title_groups,
          ),
          NavigationDestination(
            icon: const Icon(Icons.calendar_month_outlined),
            selectedIcon: const Icon(Icons.calendar_month),
            label: l10n.shell_title_schedule,
          ),
        ],
      ),
    );
  }
}
