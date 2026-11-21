/** نصوص الإشعارات: عناوين الأقسام وقوالب التنبيهات ورسائل الواتساب والصفحة */
export const notifications = {
  section: {
    att: 'حضور اليوم لسه متسجلش',
    absence: 'غياب متكرر',
    prepaid: 'باقات على وشك النفاد',
    fin: 'متأخرات الدفع',
    proof: 'إثباتات دفع بانتظار المراجعة',
    grade: 'درجات منخفضة',
    backup: 'النسخ الاحتياطي',
  },
  alert: {
    attText: '{group}: {count} طالب لسه متسجلش حضورهم',
    attDetail: 'حصة اليوم · الساعة {time} · {minutes} دقيقة',
    absenceText: '{name} غاب {count} مرات خلال آخر {days} يوم',
    absenceDetail: 'غياب متكرر — يستحق متابعة مع ولي الأمر',
    absenceWa:
      'أهلاً {guardian}، نلاحظ تكرار غياب الطالب {name} — تغيّب {count} مرات خلال آخر {days} يوم. نرجو المتابعة معنا، وشكراً لكم.',
    prepaidDepleted: '({group}): باقة {name} نفدت',
    studentLine: 'الطالب: {name}',
    prepaidDepletedWa:
      'أهلاً {guardian}، نذكّركم إن باقة الطالب {name} في مجموعة {group} خلصت، ونحتاج تجديدها قبل الحصة الجاية بإذن الله.',
    prepaidLowWa:
      'أهلاً {guardian}، نذكّركم إن باقة الطالب {name} في مجموعة {group} متبقي فيها {left} حصة فقط.',
    prepaidSummary: '{count} طالباً باقاتهم على وشك النفاد في {group}',
    prepaidSummaryDetail: 'متبقٍّ لهم ≤ 25% من باقاتهم — افتح التفاصيل لتذكير كل ولي أمر',
    finText: '{name} عليه {amount}',
    finDetail: '{count} فاتورة غير مسددة · أقدمها {month}',
    finWa:
      'أهلاً {guardian}، نذكّركم بوجود مبلغ مستحق على الطالب {name} قدره {amount}. برجاء السداد في أقرب وقت ممكن، وشكراً لكم.',
    gradeText: '{count} طالب تحت 50% في {title}',
    gradeLine: '{name}: {score} من {max}',
    proofText: 'عندك {count} إثبات دفع مستني المراجعة',
    proofDetail:
      'راجع اللقطات واعتمدها فتتحول لدفعات مسجلة — من قسم «إثباتات دفع قيد المراجعة» في شاشة الفواتير',
    backupText: 'مفيش نسخة احتياطية من أكتر من 30 يوم',
    genericReminder:
      'أهلاً وسهلاً، نذكّركم بوجود اشتراك مستحق لم يُسدّد بعد. برجاء السداد في أقرب وقت ممكن، وشكراً لتعاونكم.',
  },
  page: {
    waDefault: 'واتساب',
    waReminder: 'تذكير واتساب',
    sendGrade: 'إرسال الدرجة',
    noGuardianPhone: 'لا رقم ولي أمر',
    tapToGo: 'اضغط للانتقال ›',
    hideDetails: 'إخفاء التفاصيل',
    showInvoices: 'عرض الفواتير المستحقة ({count})',
    showStudents: 'عرض الطلاب ({count})',
    showLess: 'عرض أقل',
    showAll: 'عرض الكل ({count})',
    emptyTitle: 'مفيش أي تنبيهات حالياً',
    emptyHint:
      'كل حاجة تمام: الحضور متسجل، ومفيش متأخرات ولا باقات بتنفد ولا درجات منخفضة تحتاج متابعة.',
    summaryTitle: 'عندك {count} تنبيه',
    definitions:
      'تعريفات سريعة: «متأخرات الدفع» هنا = أي رصيد غير مسدد بكل الشهور · «متأخرات» شاشة الفواتير = شهور سابقة فقط · «المعرّضون للفقد» في الرئيسية = غياب متكرر أو متأخرات ممتدة ≥ شهرين.',
    ownerOnlyNote: 'أقسام المتأخرات والنسخ الاحتياطي مالية وتظهر للمالك فقط.',
    overdueActionsTitle: 'إجراءات المتأخرات',
    overdueActionsBody:
      '{count} طالب عليهم مستحقات — انسخ القائمة أو التذكير العام وابعته كما يناسبك.',
    copyOverdueList: 'نسخ قائمة المتأخرات',
    copyGenericReminder: 'نسخ تذكير عام',
    copiedGenericReminder: 'اتنسخ التذكير العام',
    prepaidMemberLeft: 'متبقي {left} من {prepaid} حصة',
    gradeMemberScore: '{score} من {max} ({pct}%)',
    invoiceBalance: 'باقي {amount}',
  },
} as const
