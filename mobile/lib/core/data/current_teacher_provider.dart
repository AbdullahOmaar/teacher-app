import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/core/data/providers.dart';

/// معرّف مساحة العمل الحالية — مصدره الوحيد عقد F1-T1:
/// ‏`TeacherRepository.currentWorkspace()`. الفيوموديلات تستهلك هذا
/// المزوّد فقط؛ وفي وضع البيانات الوهمية يُستبدل بقيمة ثابتة من main.
final currentTeacherIdProvider = FutureProvider<String>((ref) async {
  final workspace =
      await ref.watch(teacherRepositoryProvider).currentWorkspace();
  return workspace.id;
});
