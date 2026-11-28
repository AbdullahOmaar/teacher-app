import 'package:flutter_test/flutter_test.dart';
import 'package:mister/features/groups/data/groups_repository_impl.dart';
import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/features/students/data/students_repository_impl.dart';
import 'package:mister/features/students/domain/models/student.dart';

import 'data_layer_test.dart' show FakeSupabaseService;

void main() {
  group('عقود v1.2 — فجوات واجهات فيز 1', () {
    test('enroll: upsert على (student_id, group_id) ثم يقرأ الصف الناتج', () async {
      final service = FakeSupabaseService();
      service.tables['enrollments'] = [
        {
          'id': 'e-1',
          'teacher_id': 't1',
          'student_id': 's1',
          'group_id': 'g1',
          'price_override': null,
          'prepaid_sessions': 4,
          'created_at': '2026-01-01T00:00:00Z',
        },
      ];
      final repo = StudentsRepositoryImpl(service);
      final enrollment = await repo.enroll(
        't1',
        const EnrollmentInput(studentId: 's1', groupId: 'g1', prepaidSessions: 4),
      );
      expect(enrollment.id, 'e-1');
      expect(enrollment.prepaidSessions, 4);
      expect(service.inserts.single.table, 'enrollments');
      expect(service.inserts.single.values['student_id'], 's1');
      expect(service.inserts.single.values['group_id'], 'g1');
    });

    test('listMembers: يفك join الطلاب ويحتفظ بالاسم والكود والإيقاف', () async {
      final service = FakeSupabaseService();
      service.tables['enrollments'] = [
        {
          'id': 'e-1',
          'teacher_id': 't1',
          'student_id': 's1',
          'group_id': 'g1',
          'price_override': null,
          'prepaid_sessions': null,
          'created_at': '2026-01-01T00:00:00Z',
          'students': {'name': 'أحمد', 'public_code': 'ABCD1234', 'paused': true},
        },
        {
          'id': 'e-2',
          'teacher_id': 't1',
          'student_id': 's2',
          'group_id': 'g1',
          'price_override': 120.0,
          'prepaid_sessions': null,
          'created_at': '2026-01-02T00:00:00Z',
          'students': {'name': 'منى', 'public_code': 'WXYZ9876', 'paused': false},
        },
      ];
      final repo = GroupsRepositoryImpl(service);
      final members = await repo.listMembers('t1', 'g1');
      expect(members.length, 2);
      expect(members.first.studentName, 'أحمد');
      expect(members.first.studentCode, 'ABCD1234');
      expect(members.first.studentPaused, isTrue);
      expect(members.last.priceOverride, 120.0);
    });

    test('addWaitlistEntry: يُدرج بلا source (افتراضي خادمي) ويعيد الصف', () async {
      final service = FakeSupabaseService();
      final repo = GroupsRepositoryImpl(service);
      final entry = await repo.addWaitlistEntry(
        't1',
        'g1',
        const WaitlistInput(name: 'سارة', phone: '01000000000'),
      );
      expect(entry.name, 'سارة');
      expect(entry.id, 'new-id');
      final values = service.inserts.single.values;
      expect(values['teacher_id'], 't1');
      expect(values['group_id'], 'g1');
      expect(values.containsKey('source'), isFalse);
    });
  });
}
