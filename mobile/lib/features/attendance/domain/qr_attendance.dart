import 'package:mister/features/students/domain/models/student.dart';

/// منطق QR الحضور — منقول من الويب (features/attendance/qr.ts) حرفيًا.
/// قيمة الـQR على كارت الطالب هي students.public_code كما هي؛ التطبيع
/// تسامحي فقط مع ما يضيفه القارئ/الطباعة (مسافات، حالة أحرف، بادئة #).
class QrAttendance {
  const QrAttendance._();

  /// تطبيع نص ممسوح/مكتوب إلى صورة قابلة للمقارنة — null لو فارغ.
  static String? normalizeScannedCode(String raw) {
    var s = raw.trim();
    if (s.startsWith('#')) s = s.substring(1);
    s = s.replaceAll(RegExp(r'\s+'), '').toUpperCase();
    return s.isEmpty ? null : s;
  }

  /// مطابقة ضد قائمة الحصة الحالية فقط — كود غير معروف أو طالب غير
  /// مسجّل في هذه الحصة يُعاملان بنفس الطريقة: لا تسجيل.
  static Student? findStudentByCode(List<Student> roster, String raw) {
    final code = normalizeScannedCode(raw);
    if (code == null) return null;
    for (final student in roster) {
      if (normalizeScannedCode(student.publicCode) == code) return student;
    }
    return null;
  }

  static const int scanCooldownMs = 3000;

  /// كبح تكرار نفس الكود أثناء بقاء الكارت أمام الكاميرا (نافذة تهدئة) —
  /// أكواد مختلفة لا تُكبح أبدًا (مسح متتابع سريع عند الباب).
  static bool shouldAcceptScan(
    ({String code, int atMs})? last,
    String raw, {
    required int nowMs,
    int cooldownMs = scanCooldownMs,
  }) {
    final code = normalizeScannedCode(raw);
    if (code == null) return false;
    if (last == null) return true;
    if (last.code != code) return true;
    return nowMs - last.atMs >= cooldownMs;
  }
}
