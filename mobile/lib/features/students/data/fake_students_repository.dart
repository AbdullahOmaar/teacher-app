import 'package:mister/core/data/fake_database.dart';
import 'package:mister/features/students/data/students_repository.dart';
import 'package:mister/features/students/domain/models/student.dart';

/// تنفيذ وهمي لـ StudentsRepository بنفس واجهة عقد F1-T1 v1.1 حرفيًا —
/// لوضع تطوير الواجهة (USE_FAKE_DATA) فقط؛ البيانات في الذاكرة وقابلة
/// للتعديل حتى تتصرف الشاشات كأنها حية.
class FakeStudentsRepository implements StudentsRepository {
  FakeStudentsRepository([FakeDatabase? db])
      : _db = db ?? FakeDatabase.instance;

  final FakeDatabase _db;

  Future<void> _delay() =>
      Future<void>.delayed(const Duration(milliseconds: 250));

  @override
  Future<List<Student>> list(String teacherId) async {
    await _delay();
    return List.of(_db.students);
  }

  @override
  Future<Student?> get(String teacherId, String studentId) async {
    await _delay();
    for (final s in _db.students) {
      if (s.id == studentId) return s;
    }
    return null;
  }

  @override
  Future<Student> create(String teacherId, StudentInput input) async {
    await _delay();
    final now = DateTime.now();
    final student = Student(
      id: 's-new-${now.microsecondsSinceEpoch}',
      teacherId: teacherId,
      publicCode: 'ST${9000 + _db.students.length}XY',
      name: input.name,
      grade: input.grade,
      school: input.school,
      phone: input.phone,
      guardianName: input.guardianName,
      guardianPhone: input.guardianPhone,
      levelNote: input.levelNote,
      createdAt: now,
      updatedAt: now,
    );
    _db.students.add(student);
    return student;
  }

  @override
  Future<Student> update(
    String teacherId,
    String studentId,
    StudentInput input,
  ) async {
    await _delay();
    final index = _db.students.indexWhere((s) => s.id == studentId);
    final old = _db.students[index];
    final updated = Student(
      id: old.id,
      teacherId: old.teacherId,
      publicCode: old.publicCode,
      name: input.name,
      grade: input.grade ?? old.grade,
      school: input.school ?? old.school,
      paused: old.paused,
      phone: input.phone ?? old.phone,
      guardianName: input.guardianName ?? old.guardianName,
      guardianPhone: input.guardianPhone ?? old.guardianPhone,
      levelNote: input.levelNote ?? old.levelNote,
      createdAt: old.createdAt,
      updatedAt: DateTime.now(),
    );
    _db.students[index] = updated;
    return updated;
  }

  @override
  Future<void> delete(String teacherId, String studentId) async {
    await _delay();
    _db.students.removeWhere((s) => s.id == studentId);
    _db.enrollments.removeWhere((e) => e.studentId == studentId);
  }

  @override
  Future<List<Enrollment>> listEnrollments(String teacherId) async {
    await _delay();
    return List.of(_db.enrollments);
  }

  @override
  Future<List<Enrollment>> listStudentEnrollments(
    String teacherId,
    String studentId,
  ) async {
    await _delay();
    return _db.enrollments.where((e) => e.studentId == studentId).toList();
  }

  @override
  Future<Map<String, double>> balances(String teacherId) async {
    await _delay();
    return Map.of(_db.balancesMap);
  }
}
