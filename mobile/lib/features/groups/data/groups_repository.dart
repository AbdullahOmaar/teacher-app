import 'package:mister/features/groups/domain/models/group.dart';

/// عقود F1-T1 v1.1 (§3) — واجهة GroupsRepository.
abstract class GroupsRepository {
  Future<List<Group>> list(String teacherId);
  Future<Group?> get(String teacherId, String groupId);
  Future<Group> create(String teacherId, GroupInput input);
  Future<Group> update(String teacherId, String groupId, GroupInput input);

  /// أرشفة لا حذف (0007).
  Future<void> archive(String teacherId, String groupId);
  Future<List<GroupWaitlist>> listWaitlist(String teacherId, String groupId);
}
