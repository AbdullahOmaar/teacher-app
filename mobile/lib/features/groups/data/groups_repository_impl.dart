import 'package:mister/core/data/services.dart';
import 'package:mister/features/groups/data/groups_repository.dart';
import 'package:mister/features/groups/domain/models/group.dart';

/// تنفيذ GroupsRepository — أعمدة الويب حرفيًا (features/groups/api.ts).
class GroupsRepositoryImpl implements GroupsRepository {
  GroupsRepositoryImpl(this._service);

  final SupabaseService _service;

  static const String groupCols =
      'id, teacher_id, name, billing_type, price, days, start_time, duration_minutes, room, capacity, assistant_name, links, archived_at, created_at, updated_at';
  static const String waitlistCols =
      'id, teacher_id, group_id, name, phone, note, source, wants_trial, created_at';

  @override
  Future<List<Group>> list(String teacherId) async {
    final rows = await _service.select('groups',
        columns: groupCols, filters: {'teacher_id': teacherId},);
    return rows.map(Group.fromJson).toList();
  }

  @override
  Future<Group?> get(String teacherId, String groupId) async {
    final rows = await _service.select('groups',
        columns: groupCols, filters: {'teacher_id': teacherId, 'id': groupId},);
    return rows.isEmpty ? null : Group.fromJson(rows.first);
  }

  @override
  Future<Group> create(String teacherId, GroupInput input) async {
    final row = await _service.insertRow('groups', input.toJson(teacherId));
    return Group.fromJson(row);
  }

  @override
  Future<Group> update(
      String teacherId, String groupId, GroupInput input,) async {
    final row = await _service.updateRow('groups', input.toJson(teacherId),
        filters: {'teacher_id': teacherId, 'id': groupId},);
    return Group.fromJson(row);
  }

  @override
  Future<void> archive(String teacherId, String groupId) {
    return _service.updateRow(
      'groups',
      {'archived_at': DateTime.now().toUtc().toIso8601String()},
      filters: {'teacher_id': teacherId, 'id': groupId},
    );
  }

  @override
  Future<List<GroupWaitlist>> listWaitlist(
      String teacherId, String groupId,) async {
    final rows = await _service.select('group_waitlist',
        columns: waitlistCols,
        filters: {'teacher_id': teacherId, 'group_id': groupId},);
    return rows.map(GroupWaitlist.fromJson).toList();
  }
}
