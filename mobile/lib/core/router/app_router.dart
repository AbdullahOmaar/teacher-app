import 'package:go_router/go_router.dart';
import 'package:mister/core/router/placeholder_views.dart';
import 'package:mister/main.dart';

/// جدول التنقّل — عقود F1-T1 v1.1 (§6). المسارات مطابقة لأسماء موديولز الويب.
final GoRouter appRouter = GoRouter(
  initialLocation: '/splash',
  routes: [
    GoRoute(path: '/splash', builder: (context, state) => const SplashView()),
    GoRoute(path: '/login', builder: (context, state) => const LoginPlaceholderView()),
    GoRoute(path: '/home', builder: (context, state) => const HomePlaceholderView()),
    GoRoute(path: '/students', builder: (context, state) => const StudentsPlaceholderView()),
    GoRoute(
      path: '/students/:id',
      builder: (context, state) => StudentsPlaceholderView(studentId: state.pathParameters['id']),
    ),
    GoRoute(path: '/groups', builder: (context, state) => const GroupsPlaceholderView()),
    GoRoute(
      path: '/groups/:id',
      builder: (context, state) => GroupsPlaceholderView(groupId: state.pathParameters['id']),
    ),
    GoRoute(path: '/schedule', builder: (context, state) => const SchedulePlaceholderView()),
    GoRoute(
      path: '/attendance/:sessionId',
      builder: (context, state) => AttendancePlaceholderView(sessionId: state.pathParameters['sessionId']!),
    ),
    GoRoute(path: '/settings', builder: (context, state) => const SettingsPlaceholderView()),
  ],
);
