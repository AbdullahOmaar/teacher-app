import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mister/core/data/current_teacher_provider.dart';
import 'package:mister/core/data/fake_database.dart';
import 'package:mister/core/data/providers.dart';
import 'package:mister/core/theme/app_theme.dart';
import 'package:mister/features/gallery/ui/gallery_view.dart';
import 'package:mister/features/groups/data/fake_groups_repository.dart';
import 'package:mister/features/groups/ui/group_members_view.dart';
import 'package:mister/features/groups/ui/group_waitlist_view.dart';
import 'package:mister/features/groups/ui/groups_list_view.dart';
import 'package:mister/features/home/data/fake_home_repository.dart';
import 'package:mister/features/home/ui/home_view.dart';
import 'package:mister/features/schedule/data/fake_schedule_repository.dart';
import 'package:mister/features/schedule/ui/schedule_view.dart';
import 'package:mister/features/students/data/fake_students_repository.dart';
import 'package:mister/features/students/ui/student_detail_view.dart';
import 'package:mister/features/students/ui/student_form_sheet.dart';
import 'package:mister/features/students/ui/students_list_view.dart';
import 'package:mister/l10n/app_localizations.dart';

/// لقطات الشاشات الثمانية + المعرض من الودجت الحقيقية على بيانات Fake —
/// ‏375px (نطاق بوابة 375px) × فاتح/داكن، عربي RTL.
/// التوليد: `flutter test --update-goldens test/screenshots_test.dart`
List<Override> _fakeOverrides() => [
      studentsRepositoryProvider.overrideWithValue(FakeStudentsRepository()),
      groupsRepositoryProvider.overrideWithValue(FakeGroupsRepository()),
      scheduleRepositoryProvider.overrideWithValue(FakeScheduleRepository()),
      homeRepositoryProvider.overrideWithValue(FakeHomeRepository()),
      currentTeacherIdProvider
          .overrideWith((ref) async => FakeDatabase.teacherId),
    ];

Widget _harness(Widget child, {required bool dark}) {
  return ProviderScope(
    overrides: _fakeOverrides(),
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
      theme: dark ? AppTheme.dark() : AppTheme.light(),
      home: Scaffold(body: child),
    ),
  );
}

void _phoneSize(WidgetTester tester, {double height = 812}) {
  tester.view.physicalSize = Size(375, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
}

Future<void> _shot(
  WidgetTester tester,
  String name,
  Widget screen, {
  required bool dark,
  required int settleMs,
  Finder? capture,
}) async {
  _phoneSize(tester);
  await tester.pumpWidget(_harness(screen, dark: dark));
  await tester.pump(Duration(milliseconds: settleMs));
  await tester.pump();
  await expectLater(
    capture ?? find.byWidget(screen),
    matchesGoldenFile('goldens/$name.png'),
  );
}

void main() {
  setUpAll(() async {
    // بيئة الاختبار لا تحمّل خطوط pubspec تلقائيًا — حمّل IBM Plex
    // Sans Arabic صراحة حتى تُرسَم الحروف العربية لا مربعات بديلة.
    TestWidgetsFlutterBinding.ensureInitialized();
    final loader = FontLoader('IBM Plex Sans Arabic');
    for (final weight in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
      loader.addFont(
        rootBundle.load('assets/fonts/IBMPlexSansArabic-$weight.ttf'),
      );
    }
    await loader.load();
    // أيقونات Material خط أيضًا — تُحمَّل من حزمة الأصول حتى لا تظهر
    // كمربعات بديلة في اللقطات.
    final iconsLoader = FontLoader('MaterialIcons');
    iconsLoader.addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await iconsLoader.load();
  });

  for (final dark in [false, true]) {
    final suffix = dark ? 'dark' : 'light';

    testWidgets('لقطة الرئيسية ($suffix)', (tester) async {
      await _shot(
        tester,
        'home_$suffix',
        const HomeView(),
        dark: dark,
        settleMs: 1200,
        capture: find.byType(HomeView),
      );
    });

    testWidgets('لقطة قائمة الطلاب ($suffix)', (tester) async {
      await _shot(
        tester,
        'students_list_$suffix',
        const StudentsListView(),
        dark: dark,
        settleMs: 1500,
        capture: find.byType(StudentsListView),
      );
    });

    testWidgets('لقطة ملف طالب ($suffix)', (tester) async {
      await _shot(
        tester,
        'student_detail_$suffix',
        const StudentDetailView(studentId: 's1'),
        dark: dark,
        settleMs: 1300,
        capture: find.byType(StudentDetailView),
      );
    });

    testWidgets('لقطة قائمة المجموعات ($suffix)', (tester) async {
      await _shot(
        tester,
        'groups_list_$suffix',
        const GroupsListView(),
        dark: dark,
        settleMs: 900,
        capture: find.byType(GroupsListView),
      );
    });

    testWidgets('لقطة أعضاء مجموعة ($suffix)', (tester) async {
      await _shot(
        tester,
        'group_members_$suffix',
        const GroupMembersView(groupId: 'g1'),
        dark: dark,
        settleMs: 1300,
        capture: find.byType(GroupMembersView),
      );
    });

    testWidgets('لقطة قائمة الانتظار ($suffix)', (tester) async {
      await _shot(
        tester,
        'group_waitlist_$suffix',
        const GroupWaitlistView(groupId: 'g1'),
        dark: dark,
        settleMs: 900,
        capture: find.byType(GroupWaitlistView),
      );
    });

    testWidgets('لقطة الجدول ($suffix)', (tester) async {
      await _shot(
        tester,
        'schedule_$suffix',
        const ScheduleView(),
        dark: dark,
        settleMs: 1100,
        capture: find.byType(ScheduleView),
      );
    });

    testWidgets('لقطة إضافة طالب — ورقة سفلية ($suffix)', (tester) async {
      _phoneSize(tester);
      await tester.pumpWidget(
        _harness(
          Builder(
            builder: (context) => Center(
              child: ElevatedButton(
                onPressed: () => showStudentFormSheet(context),
                child: const Text('open'),
              ),
            ),
          ),
          dark: dark,
        ),
      );
      await tester.pump();
      await tester.tap(find.text('open'));
      // خطوات متدرجة لا قفزة واحدة: الورقة تُبنى في إطار النقر نفسه
      // فتبدأ مؤقّتات الـFake (250ms) من نهاية القفزة الطويلة وتبقى
      // معلّقة، وتُلتقط الورقة قبل اكتمال أنيميشن دخولها.
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 1200));
      await tester.pump();
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/student_form_$suffix.png'),
      );
      // إغلاق الورقة قبل نهاية الاختبار (مسار المودال المفتوح يترك
      // مؤقّتًا معلّقًا يفشل فحص الثوابت في flutter_test).
      await tester.tapAt(const Offset(10, 10));
      await tester.pump(const Duration(milliseconds: 600));
      await tester.pump();
    });

    testWidgets('لقطة معرض المكونات ($suffix)', (tester) async {
      _phoneSize(tester, height: 3600);
      await tester.pumpWidget(_harness(const GalleryView(), dark: dark));
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump();
      await expectLater(
        find.byType(GalleryView),
        matchesGoldenFile('goldens/gallery_$suffix.png'),
      );
    });
  }
}
