/** نصوص صفحة الواجب */
export const homework = {
  toggleTitleDone: 'اضغط لتعليمه «لم يسلّم»',
  toggleTitleNotDone: 'اضغط لتعليمه «سلّم الواجب»',
  submitted: 'سلّم',
  notSubmitted: 'لم يسلّم',
  loadingGroups: 'بنحمّل المجموعات…',
  noGroupsTitle: 'لا توجد مجموعات بعد — فلا واجبات تُتابَع',
  noGroupsHint:
    'أنشئ مجموعة وسجّل حضور حصصها، ومتابعة تسليم الواجب هتظهر هنا لكل حصة.',
  upcomingBadge: 'قادمة',
  kindExtra: 'إضافية',
  kindMoved: 'منقولة',
  kindCancelled: 'ملغاة',
  submittedRate: 'سلّم {rate}%',
  sessionTime: 'الساعة {time}',
  sessionSubmittedSuffix: ' · سلّم {submitted} من {attended} حاضرين',
  sessionNoAttendeesSuffix: ' · لسه مفيش حاضرين مسجلين',
  sessionsOf: 'حصص {name}',
  noSessionsTitle: 'لا توجد حصص للمجموعة دي لسه',
  noSessionsHint:
    'الحصص بتتولّد من أيام جدول المجموعة — راجع الجدول أو افتح شاشة الحضور لتوليد حصص الشهر.',
  pastOverflow:
    'بنعرض أحدث {limit} حصة فاتت — حصص أقدم من كده افتحها من شاشة الحضور أو الجدول.',
  noPastSessions:
    'لسه مفيش حصص فاتت للمجموعة دي — أول حصة لسه قادمة، وهتلاقيها في «الحصص القادمة» تحت.',
  futureTitle: 'الحصص القادمة',
  futureOverflow:
    'بنعرض أقرب {limit} حصة قادمة — اللي بعدها هيتولّد ويظهر مع دخول شهوره في نافذة الجدول.',
  sessionMeta: '{date} · الساعة {time} · {minutes} دقيقة',
  attendedLabel: 'حاضرون',
  deliveryRate: 'نسبة التسليم {rate}%',
  openAttendance: 'فتح الحضور',
  cancelledBanner:
    'الحصة دي ملغاة — متابعة الواجب مقفولة زي الحضور بالظبط. استرجع الحصة من شاشة الحضور الأول.',
  noStudentsTitle: 'لا يوجد طلاب نشطون مسجلون في المجموعة دي',
  noStudentsHint:
    'سجّل طلاباً في المجموعة من ملفاتهم أو من صفحة المجموعة، وهيظهروا هنا لمتابعة واجبهم.',
  noAttendeesTitle: 'لسه مفيش حاضرين مسجلين في الحصة دي',
  noAttendeesHint:
    'متابعة الواجب بتتحسب للحاضرين — سجّل الحضور الأول من شاشة الحضور وهتظهر القائمتين هنا.',
  submittedSection: 'سلّم الواجب ({count})',
  pendingSection: 'لم يسلّم بعد ({count})',
  othersSection: 'خارج المتابعة ({count})',
  othersHint:
    'الواجب بيُتابَع للحاضرين أساساً — دول مش محسوبين في عدّادات الحصة.',
  absentBadge: 'غائب',
  noAttendanceStatus: 'بلا حالة حضور',
} as const
