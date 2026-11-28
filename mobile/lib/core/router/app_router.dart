import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mister/core/router/app_shell.dart';
import 'package:mister/core/router/placeholder_views.dart';
import 'package:mister/features/gallery/ui/gallery_view.dart';
import 'package:mister/features/groups/ui/group_members_view.dart';
import 'package:mister/features/groups/ui/group_waitlist_view.dart';
import 'package:mister/features/groups/ui/groups_list_view.dart';
import 'package:mister/features/home/ui/home_view.dart';
import 'package:mister/features/schedule/ui/schedule_view.dart';
import 'package:mister/features/settings/ui/settings_view.dart';
import 'package:mister/features/students/ui/student_detail_view.dart';
import 'package:mister/features/students/ui/students_list_view.dart';
import 'package:mister/main.dart';

/// جدول التنقّل — عقود F1-T1 v1.1 (§6). المسارات مطابقة لأسماء موديولز الويب.
/// شاشات القلب الحقيقية من الخط ب (F1-T3/F1-T6) داخل قشرة سفلية بلا «المزيد»؛
/// الدخول (F1-T5) والحضور (F1-T7) عند الخط أ — تبقى مؤقتة حتى تصل شاشاتهما.
final GoRouter appRouter = GoRouter(
  initialLocation: '/splash',
  routes: [
    GoRoute(
      path: '/splash',
      builder: (context, state) => const _SplashGate(),
    ),
    GoRoute(
      path: '/login',
      builder: (context, state) => const LoginPlaceholderView(),
    ),
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) =>
          AppShell(navigationShell: navigationShell),
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/home',
              builder: (context, state) => const HomeView(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/students',
              builder: (context, state) => const StudentsListView(),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (context, state) => StudentDetailView(
                    studentId: state.pathParameters['id']!,
                  ),
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/groups',
              builder: (context, state) => const GroupsListView(),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (context, state) => GroupMembersView(
                    groupId: state.pathParameters['id']!,
                  ),
                  routes: [
                    GoRoute(
                      path: 'waitlist',
                      builder: (context, state) => GroupWaitlistView(
                        groupId: state.pathParameters['id']!,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/schedule',
              builder: (context, state) => const ScheduleView(),
            ),
          ],
        ),
      ],
    ),
    GoRoute(
      path: '/attendance/:sessionId',
      builder: (context, state) => AttendancePlaceholderView(
        sessionId: state.pathParameters['sessionId']!,
      ),
    ),
    GoRoute(
      path: '/settings',
      builder: (context, state) => const SettingsView(),
    ),
    GoRoute(
      path: '/gallery',
      builder: (context, state) => const GalleryView(),
    ),
  ],
);

/// بوابة السبلاش: تعرض SplashView (سطر الإصدار من بيانات البناء)
/// ثم تنتقل للرئيسية — بلا منطق جلسة هنا (حارس الجلسة عند F1-T5).
class _SplashGate extends StatefulWidget {
  const _SplashGate();

  @override
  State<_SplashGate> createState() => _SplashGateState();
}

class _SplashGateState extends State<_SplashGate> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer(const Duration(milliseconds: 900), () {
      if (mounted) context.go('/home');
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => const SplashView();
}
