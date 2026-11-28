import 'package:mister/features/students/domain/models/student.dart';

/// عقود F1-T1 v1.1 (§3) — واجهة StudentsRepository.
abstract class StudentsRepository {
  Future<List<Student>> list(String teacherId);
  Future<Student?> get(String teacherId, String studentId);
  Future<Student> create(String teacherId, StudentInput input);
  Future<Student> update(String teacherId, String studentId, StudentInput input);
  Future<void> delete(String teacherId, String studentId);
  Future<List<Enrollment>> listEnrollments(String teacherId);
  Future<List<Enrollment>> listStudentEnrollments(String teacherId, String studentId);
  Future<Map<String, double>> balances(String teacherId);
}
