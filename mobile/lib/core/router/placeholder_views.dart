import 'package:flutter/material.dart';

/// شاشات مؤقتة — هياكلها الحقيقية عند الخط ب (F1-T3/F1-T6) على عقود F1-T1.
/// كل شاشة نايمة تعرض حالة «قريبًا» مصممة — ممنوع خطأ خام (بوابة QA).
class LoginPlaceholderView extends StatelessWidget {
  const LoginPlaceholderView({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Text('تسجيل الدخول — قريبًا')));
}

class HomePlaceholderView extends StatelessWidget {
  const HomePlaceholderView({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Text('الرئيسية — قريبًا')));
}

class StudentsPlaceholderView extends StatelessWidget {
  const StudentsPlaceholderView({this.studentId, super.key});
  final String? studentId;
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Text('الطلاب — قريبًا')));
}

class GroupsPlaceholderView extends StatelessWidget {
  const GroupsPlaceholderView({this.groupId, super.key});
  final String? groupId;
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Text('المجموعات — قريبًا')));
}

class SchedulePlaceholderView extends StatelessWidget {
  const SchedulePlaceholderView({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Text('الجدول — قريبًا')));
}

class AttendancePlaceholderView extends StatelessWidget {
  const AttendancePlaceholderView({required this.sessionId, super.key});
  final String sessionId;
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Text('الحضور — قريبًا')));
}

class SettingsPlaceholderView extends StatelessWidget {
  const SettingsPlaceholderView({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Text('الإعدادات — قريبًا')));
}
