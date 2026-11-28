import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/core/data/app_database.dart';
import 'package:mister/core/data/connectivity_service.dart';
import 'package:mister/core/data/local_storage_service.dart';
import 'package:mister/core/data/secure_storage_service.dart';
import 'package:mister/core/data/services.dart';
import 'package:mister/core/data/supabase_service.dart';
import 'package:mister/features/auth/data/app_lock_service.dart';
import 'package:mister/features/auth/data/auth_gateway.dart';
import 'package:mister/features/auth/data/auth_repository.dart';
import 'package:mister/features/auth/data/auth_repository_impl.dart';
import 'package:mister/features/attendance/data/attendance_repository.dart';
import 'package:mister/features/attendance/data/attendance_repository_impl.dart';
import 'package:mister/features/auth/data/teacher_repository.dart';
import 'package:mister/features/auth/data/teacher_repository_impl.dart';
import 'package:mister/features/groups/data/groups_repository.dart';
import 'package:mister/features/groups/data/groups_repository_impl.dart';
import 'package:mister/features/home/data/home_repository.dart';
import 'package:mister/features/home/data/home_repository_impl.dart';
import 'package:mister/features/schedule/data/schedule_repository.dart';
import 'package:mister/features/schedule/data/schedule_repository_impl.dart';
import 'package:mister/features/students/data/students_repository.dart';
import 'package:mister/features/students/data/students_repository_impl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// ربط DI المركزي (حزمة الاعتماد أ): خدمة واحدة ← ريبو SSOT لكل فيتشر.
/// الشاشات وفيوموديلات الخط ب تستهلك الريبو من هنا فقط.
final supabaseServiceProvider = Provider<SupabaseService>(
  (ref) => SupabaseServiceImpl(Supabase.instance.client),
);

final teacherRepositoryProvider = Provider<TeacherRepository>(
  (ref) => TeacherRepositoryImpl(ref.watch(supabaseServiceProvider)),
);

final studentsRepositoryProvider = Provider<StudentsRepository>(
  (ref) => StudentsRepositoryImpl(ref.watch(supabaseServiceProvider)),
);

final groupsRepositoryProvider = Provider<GroupsRepository>(
  (ref) => GroupsRepositoryImpl(ref.watch(supabaseServiceProvider)),
);

final scheduleRepositoryProvider = Provider<ScheduleRepository>(
  (ref) => ScheduleRepositoryImpl(ref.watch(supabaseServiceProvider)),
);

final homeRepositoryProvider = Provider<HomeRepository>(
  (ref) => HomeRepositoryImpl(
    ref.watch(supabaseServiceProvider),
    ref.watch(scheduleRepositoryProvider),
    ref.watch(studentsRepositoryProvider),
  ),
);

/// F1-T5 — الدخول والأمان.
final secureStorageServiceProvider = Provider<SecureStorageServiceImpl>(
  (ref) => SecureStorageServiceImpl(),
);

final authGatewayProvider = Provider<AuthGateway>(
  (ref) => SupabaseAuthGateway(Supabase.instance.client.auth),
);

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepositoryImpl(
    ref.watch(authGatewayProvider),
    ref.watch(supabaseServiceProvider),
  ),
);

final biometricGatewayProvider = Provider<BiometricGateway>(
  (ref) => LocalAuthGateway(),
);

final appLockServiceProvider = Provider<AppLockService>(
  (ref) => AppLockService(
    ref.watch(secureStorageServiceProvider),
    ref.watch(biometricGatewayProvider),
  ),
);

/// F1-T7 — التخزين المحلي والحضور.
/// قاعدة Drift تُفتح في main وتُحقن هنا (override) — أي قراءة بلا حقن = خطأ برمجي.
final appDatabaseProvider = Provider<AppDatabase>(
  (ref) => throw UnimplementedError('AppDatabase تُحقن في main بعد فتحها'),
);

final localStorageServiceProvider = Provider<LocalStorageServiceImpl>(
  (ref) => LocalStorageServiceImpl(ref.watch(appDatabaseProvider)),
);

final connectivityServiceProvider = Provider<ConnectivityService>(
  (ref) => ConnectivityServiceImpl(),
);

final attendanceRepositoryProvider = Provider<AttendanceRepository>(
  (ref) => AttendanceRepositoryImpl(
    ref.watch(supabaseServiceProvider),
    ref.watch(localStorageServiceProvider),
    ref.watch(scheduleRepositoryProvider),
    ref.watch(connectivityServiceProvider),
  ),
);
