import 'package:mister/core/data/services.dart';
import 'package:mister/features/students/data/students_repository.dart';
import 'package:mister/features/students/domain/models/student.dart';

/// تنفيذ StudentsRepository — أعمدة الويب حرفيًا (features/students/api.ts).
class StudentsRepositoryImpl implements StudentsRepository {
  StudentsRepositoryImpl(this._service);

  final SupabaseService _service;

  static const String studentCols =
      'id, teacher_id, public_code, name, grade, school, paused, phone, guardian_name, guardian_phone, level_note, created_at, updated_at';
  static const String enrollmentCols =
      'id, teacher_id, student_id, group_id, price_override, prepaid_sessions, created_at';

  @override
  Future<List<Student>> list(String teacherId) async {
    final rows = await _service.select('students',
        columns: studentCols, filters: {'teacher_id': teacherId},);
    return rows.map(Student.fromJson).toList();
  }

  @override
  Future<Student?> get(String teacherId, String studentId) async {
    final rows = await _service.select('students',
        columns: studentCols,
        filters: {'teacher_id': teacherId, 'id': studentId},);
    return rows.isEmpty ? null : Student.fromJson(rows.first);
  }

  @override
  Future<Student> create(String teacherId, StudentInput input) async {
    final row = await _service.insertRow('students', input.toJson(teacherId));
    return Student.fromJson(row);
  }

  @override
  Future<Student> update(
      String teacherId, String studentId, StudentInput input,) async {
    final row = await _service.updateRow('students', input.toJson(teacherId),
        filters: {'teacher_id': teacherId, 'id': studentId},);
    return Student.fromJson(row);
  }

  @override
  Future<void> delete(String teacherId, String studentId) {
    return _service.deleteRow('students',
        filters: {'teacher_id': teacherId, 'id': studentId},);
  }

  @override
  Future<List<Enrollment>> listEnrollments(String teacherId) async {
    final rows = await _service.select('enrollments',
        columns: enrollmentCols, filters: {'teacher_id': teacherId},);
    return rows.map(Enrollment.fromJson).toList();
  }

  @override
  Future<List<Enrollment>> listStudentEnrollments(
      String teacherId, String studentId,) async {
    final rows = await _service.select('enrollments',
        columns: enrollmentCols,
        filters: {'teacher_id': teacherId, 'student_id': studentId},);
    return rows.map(Enrollment.fromJson).toList();
  }

  @override
  Future<Map<String, double>> balances(String teacherId) async {
    final rows = await _service.selectUnordered('student_balances',
        columns: 'teacher_id, student_id, balance',
        filters: {'teacher_id': teacherId},);
    return {
      for (final r in rows)
        r['student_id'] as String: (r['balance'] as num).toDouble(),
    };
  }
}
