import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mister/core/data/current_teacher_provider.dart';
import 'package:mister/core/data/fake_database.dart';
import 'package:mister/core/data/providers.dart';
import 'package:mister/core/theme/app_theme.dart';
import 'package:mister/features/gallery/ui/gallery_view.dart';
import 'package:mister/features/groups/data/fake_groups_repository.dart';
import 'package:mister/features/home/data/fake_home_repository.dart';
import 'package:mister/features/home/ui/home_view.dart';
import 'package:mister/features/schedule/data/fake_schedule_repository.dart';
import 'package:mister/features/students/data/fake_students_repository.dart';
import 'package:mister/features/students/ui/students_list_view.dart';
import 'package:mister/l10n/app_localizations.dart';
import 'package:mister/main.dart';

/// اختبارات دخان واجهة فيز 1 (الخط ب) — كلها على الـFake Repos
/// بنفس واجهات العقد، وبلا أي خادم.
List<Override> fakeOverrides() => [
      studentsRepositoryProvider.overrideWithValue(FakeStudentsRepository()),
      groupsRepositoryProvider.overrideWithValue(FakeGroupsRepository()),
      scheduleRepositoryProvider.overrideWithValue(FakeScheduleRepository()),
      homeRepositoryProvider.overrideWithValue(FakeHomeRepository()),
      currentTeacherIdProvider
          .overrideWith((ref) async => FakeDatabase.teacherId),
    ];

Widget harness(Widget child) {
  return ProviderScope(
    overrides: fakeOverrides(),
    child: MaterialApp(
      debugShowCheckedModeBanner: false,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: AppTheme.light(),
      home: Scaffold(body: child),
    ),
  );
}

void main() {
  testWidgets('المعرض يعرض أقسامه الأحد عشر', (tester) async {
    await tester.pumpWidget(harness(const GalleryView()));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('معرض المكونات — F1-T3'), findsOneWidget);
    expect(find.text('1 · الأزرار'), findsOneWidget);
    // الأقسام اللاحقة تُبنى عند التمرير (ListView كسول) — مرّر للأسفل.
    // مرّر قائمة المعرض يدويًا حتى يظهر القسم الأخير (ListView كسول).
    final section11 = find.text('11 · الأخطاء (عقد §5)');
    for (var i = 0; i < 25 && section11.evaluate().isEmpty; i++) {
      await tester.drag(find.byType(ListView).first, const Offset(0, -400));
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text('common_network_error'), findsOneWidget);
    expect(find.text('attendance_sync_failed_error'), findsOneWidget);
  });

  testWidgets('الرئيسية تعرض بطاقة «ابدأ هنا» وحصص اليوم من الـFake',
      (tester) async {
    await tester.pumpWidget(harness(const HomeView()));
    // سلسلة الـFake: today + groups + students (250ms لكل نداء).
    await tester.pump(const Duration(milliseconds: 1200));
    await tester.pump();
    expect(find.text('ابدأ هنا — 3 خطوات وتشتغل'), findsOneWidget);
    expect(find.text('حصص اليوم'), findsWidgets);
  });

  testWidgets('قائمة الطلاب تعرض البيانات والبحث يصفّي محليًا',
      (tester) async {
    await tester.pumpWidget(harness(const StudentsListView()));
    // سلسلة الـFake: list + enrollments + balances + groups.
    await tester.pump(const Duration(milliseconds: 1500));
    await tester.pump();
    expect(find.text('أحمد محمد علي'), findsOneWidget);
    expect(find.text('مريم خالد سمير'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, 'مريم');
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('مريم خالد سمير'), findsOneWidget);
    expect(find.text('أحمد محمد علي'), findsNothing);
  });

  testWidgets('التطبيق كاملًا: سبلاش ← قشرة سفلية بأربعة تبويبات بلا «المزيد»',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(overrides: fakeOverrides(), child: const MisterApp()),
    );
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.textContaining('الإصدار'), findsOneWidget);
    // بوابة السبلاش تنتقل بعد 900ms ثم تُحمّل الرئيسية من الـFake.
    await tester.pump(const Duration(milliseconds: 1000));
    await tester.pump(const Duration(milliseconds: 1500));
    await tester.pump();
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.text('الرئيسية'), findsWidgets);
    expect(find.text('الطلاب'), findsWidgets);
    expect(find.text('المجموعات'), findsWidgets);
    expect(find.text('المزيد'), findsNothing);
  });
}
