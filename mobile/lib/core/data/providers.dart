import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/core/data/services.dart';
import 'package:mister/core/data/supabase_service.dart';
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
