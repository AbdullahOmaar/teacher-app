import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mister/core/data/current_teacher_provider.dart';
import 'package:mister/core/data/fake_database.dart';
import 'package:mister/core/data/providers.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/core/theme/app_theme.dart';
import 'package:mister/features/groups/data/fake_groups_repository.dart';
import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/features/groups/ui/group_members_view_model.dart';
import 'package:mister/features/groups/ui/group_waitlist_view.dart';
import 'package:mister/features/groups/ui/group_waitlist_view_model.dart';
import 'package:mister/features/home/data/fake_home_repository.dart';
import 'package:mister/features/schedule/data/fake_schedule_repository.dart';
import 'package:mister/features/students/data/fake_students_repository.dart';
import 'package:mister/features/students/domain/models/student.dart';
import 'package:mister/features/students/ui/student_form_view_model.dart';
import 'package:mister/l10n/app_localizations.dart';

/// ربط عقود v1.2 في الواجهة (الخط ب) — كلها على الـFake Repos
/// بنفس واجهات العقد، وبلا أي خادم.
List<Override> _overrides() => [
      studentsRepositoryProvider.overrideWithValue(FakeStudentsRepository()),
      groupsRepositoryProvider.overrideWithValue(FakeGroupsRepository()),
      scheduleRepositoryProvider.overrideWithValue(FakeScheduleRepository()),
      homeRepositoryProvider.overrideWithValue(FakeHomeRepository()),
      currentTeacherIdProvider
          .overrideWith((ref) async => FakeDatabase.teacherId),
    ];

Widget _harness(Widget child) {
  return ProviderScope(
    overrides: _overrides(),
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
  group('ربط عقود v1.2 في الواجهة', () {
    test('نموذج الطالب: الحفظ مع مجموعة يستدعي enroll (upsert)', () async {
      final container = ProviderContainer(overrides: _overrides());
      addTearDown(container.dispose);
      const name = 'اختبار ربط v12';
      await container
          .read(studentFormViewModelProvider('').notifier)
          .submit(const StudentInput(name: name), groupId: 'g1');
      final state = container.read(studentFormViewModelProvider(''));
      expect(state.done, isTrue);
      expect(state.formError, isNull);
      final db = FakeDatabase.instance;
      final student = db.students.firstWhere((s) => s.name == name);
      expect(
        db.enrollments.any(
          (e) => e.studentId == student.id && e.groupId == 'g1',
        ),
        isTrue,
      );
    });

    test('نموذج الطالب: الحفظ بلا مجموعة يتخطى enroll', () async {
      final container = ProviderContainer(overrides: _overrides());
      addTearDown(container.dispose);
      const name = 'اختبار بلا مجموعة v12';
      await container
          .read(studentFormViewModelProvider('').notifier)
          .submit(const StudentInput(name: name));
      final state = container.read(studentFormViewModelProvider(''));
      expect(state.done, isTrue);
      final db = FakeDatabase.instance;
      final student = db.students.firstWhere((s) => s.name == name);
      expect(
        db.enrollments.any((e) => e.studentId == student.id),
        isFalse,
      );
    });

    test('أعضاء المجموعة: تُحمَّل من listMembers بالاسم والكود', () async {
      final container = ProviderContainer(overrides: _overrides());
      addTearDown(container.dispose);
      final vm = container.read(groupMembersViewModelProvider('g1').notifier);
      await vm.load();
      final state = container.read(groupMembersViewModelProvider('g1'));
      expect(state, isA<UiData<GroupMembersData>>());
      final data = (state as UiData<GroupMembersData>).value;
      // تطابق مباشر مع مخرجات listMembers نفسها (العدد قد يزيد إن
      // سجّلت اختبارات سابقة طلابًا جددًا في نفس المجموعة — القاعدة
      // الوهمية مشتركة singleton).
      final direct =
          await FakeGroupsRepository().listMembers('fake-teacher', 'g1');
      expect(data.members.length, direct.length);
      expect(data.members.first.studentName, 'أحمد محمد علي');
      expect(data.members.first.studentCode, 'ST1001XY');
      expect(
        data.members.map((m) => m.studentId).toList(),
        direct.map((m) => m.studentId).toList(),
      );
    });

    test('إضافة منتظر: تُدرج بـ source الافتراضي manual', () async {
      final container = ProviderContainer(overrides: _overrides());
      addTearDown(container.dispose);
      const name = 'منتظر اختبار v12';
      final error = await container
          .read(groupWaitlistViewModelProvider('g1').notifier)
          .add(const WaitlistInput(name: name, phone: '01000000099'));
      expect(error, isNull);
      final db = FakeDatabase.instance;
      final entry = db.waitlist.firstWhere((w) => w.name == name);
      expect(entry.groupId, 'g1');
      expect(entry.source, 'manual');
    });

    test('ترقية منتظر: تنشئ الطالب ثم تسجّله في المجموعة', () async {
      final container = ProviderContainer(overrides: _overrides());
      addTearDown(container.dispose);
      final vm = container.read(groupWaitlistViewModelProvider('g1').notifier);
      const name = 'ترقية اختبار v12';
      final addError = await vm.add(const WaitlistInput(name: name));
      expect(addError, isNull);
      final entry =
          FakeDatabase.instance.waitlist.firstWhere((w) => w.name == name);
      final acceptError = await vm.accept(entry);
      expect(acceptError, isNull);
      final db = FakeDatabase.instance;
      final student = db.students.firstWhere((s) => s.name == name);
      expect(
        db.enrollments.any(
          (e) => e.studentId == student.id && e.groupId == 'g1',
        ),
        isTrue,
      );
    });

    testWidgets('ورقة إضافة منتظر تفتح وتُحفَظ وتظهر في القائمة',
        (tester) async {
      await tester.pumpWidget(_harness(const GroupWaitlistView(groupId: 'g1')));
      await tester.pump(const Duration(milliseconds: 1200));
      await tester.pump();
      expect(find.text('محمود طارق السيد'), findsOneWidget);

      // الزر أسفل القائمة (ListView كسول) — مرّر حتى يظهر قبل النقر.
      final addBtn = find.text('+ إضافة لقائمة الانتظار');
      await tester.scrollUntilVisible(addBtn, 200);
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tap(addBtn);
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 600));
      await tester.pump();
      expect(find.text('اسم المنتظر *'), findsOneWidget);

      await tester.enterText(
        find.byWidgetPredicate(
          (w) => w is TextField && w.decoration?.hintText == 'الاسم',
        ),
        'منتظر واجهة v12',
      );
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tap(find.text('+ إضافة لقائمة الانتظار').last);
      // خطوات متدرجة: الحفظ (250ms) + إعادة التحميل (2×250ms)، ثم
      // أنيميشن خروج الورقة بعد pop — تحتاج مضخات إضافية حتى تُصرَّف
      // الورقة من الشجرة قبل أي بحث عن نص الاسم (حقل الاسم في الورقة
      // يحمل النص نفسه فيطابق find.text أثناء وجودها).
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 1200));
      await tester.pump(const Duration(milliseconds: 2000));
      await tester.pump();
      // المدخل الجديد آخر القائمة — مرّر حتى يظهر. النطاق مضيّق على
      // شجرة العرض نفسها لأن حقل الاسم في الورقة يحمل النص نفسه.
      final newEntry = find.descendant(
        of: find.byType(GroupWaitlistView),
        matching: find.text('منتظر واجهة v12'),
      );
      await tester.scrollUntilVisible(newEntry, 200);
      await tester.pump(const Duration(milliseconds: 100));
      expect(newEntry, findsOneWidget);
      // تصريف مؤقّتات إعادة التحميل بعد إبطال المزوّد عند غلق الورقة
      // (get + listWaitlist ‏250ms لكل منهما) قبل نهاية الاختبار.
      await tester.pump(const Duration(milliseconds: 1000));
      await tester.pump();
    });
  });
}
