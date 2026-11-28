import 'package:flutter/material.dart';

/// شاشات مؤقتة باقية عند الخط أ — الدخول (F1-T5) والحضور (F1-T7).
/// شاشات القلب (رئيسية/طلاب/مجموعات/جدول/إعدادات) صارت حقيقية عند الخط ب
/// (F1-T3/F1-T6) في `features/*/ui/`.
/// كل شاشة نايمة تعرض حالة «قريبًا» مصممة — ممنوع خطأ خام (بوابة QA).
class LoginPlaceholderView extends StatelessWidget {
  const LoginPlaceholderView({super.key});
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: Text('تسجيل الدخول — قريبًا')));
}

class AttendancePlaceholderView extends StatelessWidget {
  const AttendancePlaceholderView({required this.sessionId, super.key});
  final String sessionId;
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: Text('الحضور — قريبًا')));
}
