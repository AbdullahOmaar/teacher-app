import 'package:mister/core/data/fake_database.dart';
import 'package:mister/features/groups/data/groups_repository.dart';
import 'package:mister/features/groups/domain/models/group.dart';

/// تنفيذ وهمي لـ GroupsRepository بنفس واجهة عقد F1-T1 v1.1 حرفيًا —
/// لوضع تطوير الواجهة (USE_FAKE_DATA) فقط.
class FakeGroupsRepository implements GroupsRepository {
  FakeGroupsRepository([FakeDatabase? db]) : _db = db ?? FakeDatabase.instance;

  final FakeDatabase _db;

  Future<void> _delay() =>
      Future<void>.delayed(const Duration(milliseconds: 250));

  @override
  Future<List<Group>> list(String teacherId) async {
    await _delay();
    return List.of(_db.groups);
  }

  @override
  Future<Group?> get(String teacherId, String groupId) async {
    await _delay();
    for (final g in _db.groups) {
      if (g.id == groupId) return g;
    }
    return null;
  }

  @override
  Future<Group> create(String teacherId, GroupInput input) async {
    await _delay();
    final now = DateTime.now();
    final group = Group(
      id: 'g-new-${now.microsecondsSinceEpoch}',
      teacherId: teacherId,
      name: input.name,
      billingType: input.billingType,
      price: input.price,
      days: input.days,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      room: input.room,
      capacity: input.capacity,
      assistantName: input.assistantName,
      links: input.links,
      createdAt: now,
      updatedAt: now,
    );
    _db.groups.add(group);
    return group;
  }

  @override
  Future<Group> update(
    String teacherId,
    String groupId,
    GroupInput input,
  ) async {
    await _delay();
    final index = _db.groups.indexWhere((g) => g.id == groupId);
    final old = _db.groups[index];
    final updated = Group(
      id: old.id,
      teacherId: old.teacherId,
      name: input.name,
      billingType: input.billingType,
      price: input.price,
      days: input.days,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      room: input.room,
      capacity: input.capacity,
      assistantName: input.assistantName,
      links: input.links,
      archivedAt: old.archivedAt,
      createdAt: old.createdAt,
      updatedAt: DateTime.now(),
    );
    _db.groups[index] = updated;
    return updated;
  }

  @override
  Future<void> archive(String teacherId, String groupId) async {
    await _delay();
    final index = _db.groups.indexWhere((g) => g.id == groupId);
    final g = _db.groups[index];
    _db.groups[index] = Group(
      id: g.id,
      teacherId: g.teacherId,
      name: g.name,
      billingType: g.billingType,
      price: g.price,
      days: g.days,
      startTime: g.startTime,
      durationMinutes: g.durationMinutes,
      room: g.room,
      capacity: g.capacity,
      assistantName: g.assistantName,
      links: g.links,
      archivedAt: DateTime.now(),
      createdAt: g.createdAt,
      updatedAt: DateTime.now(),
    );
  }

  @override
  @override
  Future<List<GroupMember>> listMembers(
    String teacherId,
    String groupId,
  ) async {
    await _delay();
    return _db.enrollments
        .where((e) => e.groupId == groupId)
        .map((e) {
          final student = _db.students
              .where((s) => s.id == e.studentId)
              .firstOrNull;
          return GroupMember(
            enrollmentId: e.id,
            studentId: e.studentId,
            groupId: e.groupId,
            studentName: student?.name ?? '—',
            studentCode: student?.publicCode ?? '',
            studentPaused: student?.paused ?? false,
            priceOverride: e.priceOverride,
            prepaidSessions: e.prepaidSessions,
            createdAt: e.createdAt,
          );
        })
        .toList();
  }

  @override
  Future<List<GroupWaitlist>> listWaitlist(
    String teacherId,
    String groupId,
  ) async {
    await _delay();
    return _db.waitlist.where((w) => w.groupId == groupId).toList();
  }

  @override
  Future<GroupWaitlist> addWaitlistEntry(
    String teacherId,
    String groupId,
    WaitlistInput input,
  ) async {
    await _delay();
    final now = DateTime.now();
    final entry = GroupWaitlist(
      id: 'w-${now.microsecondsSinceEpoch}',
      teacherId: teacherId,
      groupId: groupId,
      name: input.name,
      phone: input.phone,
      note: input.note,
      source: 'manual',
      createdAt: now,
    );
    _db.waitlist.add(entry);
    return entry;
  }
}
