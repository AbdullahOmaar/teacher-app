import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/features/schedule/domain/models/session.dart';
import 'package:mister/features/students/domain/models/student.dart';

/// قاعدة البيانات الوهمية المشتركة لتنفيذات Fake (وضع USE_FAKE_DATA).
/// نسخة واحدة (singleton) حتى ترى كل الريبو الوهمية نفس البيانات،
/// وحصص الجدول تُولّد من قواعد المجموعات (أيام/وقت) كالخادم تمامًا.
class FakeDatabase {
  FakeDatabase._() {
    _seed();
  }

  static final FakeDatabase instance = FakeDatabase._();

  static const String teacherId = 'fake-teacher';

  final List<Group> groups = [];
  final List<Student> students = [];
  final List<Enrollment> enrollments = [];
  final List<GroupWaitlist> waitlist = [];
  final List<Session> extraSessions = [];
  final Set<String> cancelledSessionIds = {};
  final List<Holiday> holidays = [];
  final Map<String, double> balancesMap = {};

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  /// يوم الأسبوع بترقيم الويب: 0 = الأحد … 6 = السبت (Date.getDay).
  static int jsDay(DateTime d) => d.weekday % 7;

  static String _dayKey(DateTime d) =>
      '${d.year}${d.month.toString().padLeft(2, '0')}${d.day.toString().padLeft(2, '0')}';

  void _seed() {
    final now = DateTime.now();
    final created = DateTime(now.year, 1, 5, 9);

    groups.addAll([
      Group(
        id: 'g1',
        teacherId: teacherId,
        name: 'فيزياء 3 ثانوي — السبت',
        billingType: BillingType.monthlyFixed,
        price: 400,
        days: const [6, 1],
        startTime: '16:00:00',
        durationMinutes: 90,
        room: 'قاعة 2',
        capacity: 25,
        assistantName: 'أستاذ سامح',
        createdAt: created,
        updatedAt: created,
      ),
      Group(
        id: 'g2',
        teacherId: teacherId,
        name: 'رياضيات 2 ثانوي',
        billingType: BillingType.perSessionAttended,
        price: 60,
        days: const [0, 3],
        startTime: '18:00:00',
        durationMinutes: 120,
        room: 'قاعة 1',
        capacity: 30,
        createdAt: created,
        updatedAt: created,
      ),
      Group(
        id: 'g3',
        teacherId: teacherId,
        name: 'كيمياء 1 ثانوي',
        billingType: BillingType.monthlyFixed,
        price: 350,
        days: const [2, 4],
        startTime: '15:30:00',
        durationMinutes: 90,
        createdAt: created,
        updatedAt: created,
      ),
      Group(
        id: 'g4',
        teacherId: teacherId,
        name: 'لغة عربية 3 إعدادي',
        billingType: BillingType.weeklyPackage,
        price: 200,
        days: const [5],
        startTime: '13:00:00',
        durationMinutes: 60,
        archivedAt: DateTime(now.year, now.month, 1),
        createdAt: created,
        updatedAt: created,
      ),
    ]);

    const names = [
      'أحمد محمد علي',
      'يوسف إبراهيم حسن',
      'مريم خالد سمير',
      'فاطمة الزهراء أحمد',
      'عمر سامي محمود',
      'نور الدين وليد',
      'سارة عبدالله حسن',
      'كريم وليد مصطفى',
      'هنا مصطفى كامل',
      'علي حسان رضوان',
    ];
    for (var i = 0; i < names.length; i++) {
      students.add(
        Student(
          id: 's${i + 1}',
          teacherId: teacherId,
          publicCode: 'ST${1001 + i}XY',
          name: names[i],
          grade: i.isEven ? '3 ثانوي' : '2 ثانوي',
          school: 'مدرسة النور الثانوية',
          phone: '0100000000$i',
          guardianName: 'ولي أمر ${names[i].split(' ').first}',
          guardianPhone: '0111000000$i',
          createdAt: created.add(Duration(days: i)),
          updatedAt: created.add(Duration(days: i)),
        ),
      );
    }
    // أول 6 طلاب في g1، و4 في g2، و3 في g3.
    var seq = 0;
    void enroll(String studentId, String groupId) {
      seq++;
      enrollments.add(
        Enrollment(
          id: 'e$seq',
          teacherId: teacherId,
          studentId: studentId,
          groupId: groupId,
          createdAt: created,
        ),
      );
    }

    for (var i = 1; i <= 6; i++) {
      enroll('s$i', 'g1');
    }
    for (var i = 3; i <= 6; i++) {
      enroll('s$i', 'g2');
    }
    for (var i = 7; i <= 9; i++) {
      enroll('s$i', 'g3');
    }

    waitlist.addAll([
      GroupWaitlist(
        id: 'w1',
        teacherId: teacherId,
        groupId: 'g1',
        name: 'محمود طارق السيد',
        phone: '01022223333',
        source: 'manual',
        wantsTrial: true,
        createdAt: created.add(const Duration(days: 2)),
      ),
      GroupWaitlist(
        id: 'w2',
        teacherId: teacherId,
        groupId: 'g1',
        name: 'ليان أحمد فؤاد',
        phone: '01044445555',
        source: 'booking_page',
        createdAt: created.add(const Duration(days: 3)),
      ),
      GroupWaitlist(
        id: 'w3',
        teacherId: teacherId,
        groupId: 'g1',
        name: 'زياد عمرو نبيل',
        source: 'manual',
        createdAt: created.add(const Duration(days: 4)),
      ),
    ]);

    balancesMap.addAll({
      's1': 0,
      's2': -400,
      's3': -60,
      's4': 0,
      's5': -400,
      's6': 120,
      's7': 0,
      's8': -350,
      's9': 0,
      's10': 0,
    });

    final nextFriday = _dateOnly(now).add(
      Duration(days: (DateTime.friday - now.weekday + 7) % 7 + 7),
    );
    holidays.add(
      Holiday(
        id: 'h1',
        teacherId: teacherId,
        holidayDate: nextFriday,
        name: 'إجازة رسمية',
        createdAt: created,
      ),
    );
  }

  /// حصص النطاق: توليد حتمي من قواعد المجموعات النشطة + الحصص الإضافية،
  /// مع تطبيق الإلغاءات المسجلة.
  List<Session> sessionsInRange(DateTime from, DateTime to) {
    final start = _dateOnly(from);
    final end = _dateOnly(to);
    final result = <Session>[];
    for (var d = start; !d.isAfter(end); d = d.add(const Duration(days: 1))) {
      for (final g in groups) {
        if (g.archivedAt != null) continue;
        if (!g.days.contains(jsDay(d))) continue;
        final id = 'sess-${g.id}-${_dayKey(d)}';
        result.add(
          Session(
            id: id,
            teacherId: teacherId,
            groupId: g.id,
            sessionDate: d,
            startTime: g.startTime,
            durationMinutes: g.durationMinutes,
            kind: SessionKind.regular,
            status: cancelledSessionIds.contains(id)
                ? SessionStatus.cancelled
                : SessionStatus.scheduled,
            createdAt: d,
            updatedAt: d,
          ),
        );
      }
    }
    for (final s in extraSessions) {
      final d = _dateOnly(s.sessionDate);
      if (!d.isBefore(start) && !d.isAfter(end)) {
        result.add(
          cancelledSessionIds.contains(s.id)
              ? Session(
                  id: s.id,
                  teacherId: s.teacherId,
                  groupId: s.groupId,
                  sessionDate: s.sessionDate,
                  startTime: s.startTime,
                  durationMinutes: s.durationMinutes,
                  kind: s.kind,
                  status: SessionStatus.cancelled,
                  note: s.note,
                  createdAt: s.createdAt,
                  updatedAt: s.updatedAt,
                )
              : s,
        );
      }
    }
    result.sort((a, b) {
      final byDate = a.sessionDate.compareTo(b.sessionDate);
      return byDate != 0 ? byDate : a.startTime.compareTo(b.startTime);
    });
    return result;
  }
}
