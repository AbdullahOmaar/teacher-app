/** نصوص التحليلات: المدى والرؤى والمؤشرات وعناوين الرسوم وتلميحاتها */
export const analytics = {
  rangeAria: 'مدى التحليلات',
  range3: '3 شهور',
  range6: '6 شهور',
  range12: '12 شهر',
  ownerOnlyTitle: 'التحليلات للمالك فقط',
  ownerOnlyBody:
    'حساب المساعد لا يملك صلاحية مالية — التحليلات تعرض التحصيل والمتأخرات، وهي أقسام محجوبة عن المساعد كما في شاشة المصروفات والأرباح.',
  errorUnknown: 'مشكلة غير معروفة',
  emptyTitle: 'لسه مفيش بيانات للتحليل',
  emptyHint:
    'أول ما تضيف طلاب وتسجّل حضور ودفعات، هتظهر هنا رسوم التحصيل والحضور والمتأخرات ونمو الطلاب.',
  insightsTitle: 'أهم 3 رؤى',
  insightOverduePre: 'أعلى متأخرات في مجموعة',
  insightOverduePost: ': {amount} غير مسددة الآن (أرصدة حالية — كل الشهور).',
  insightChange: 'أكبر تغيّر في التحصيل: {to} {dir} {pct}% عن {from} ({delta}).',
  changeUp: 'زاد',
  changeDown: 'قلّ',
  insightAbsencePre: 'الأكثر غياباً: مجموعة',
  insightAbsencePost: '({count} غياب في المدى)',
  insightAbsenceStudent: ' — وأكثر طالب: {name} ({count} مرات)',
  kpiCollectedRange: 'تحصيل آخر {range} شهور',
  kpiAvgAttendance: 'متوسط الحضور في المدى',
  kpiCurrentOverdue: 'المتأخرات الحالية (كل الشهور)',
  kpiActiveNow: 'طلاب نشطون الآن',
  chartCollectedTitle: 'التحصيل الشهري',
  chartCollectedHint: 'مجموع الدفعات المسجلة في كل شهر (من ملخص الأرباح الشهري).',
  chartAttendanceTitle: 'نسبة الحضور الشهرية',
  chartAttendanceHint:
    'الحاضرون (حاضر/متأخر/بعذر) من إجمالي التسجيلات في حصص الشهر — الشهر بلا تسجيلات يظهر فجوة لا صفراً.',
  chartOverdueTitle: 'المتأخرات عبر الأشهر',
  chartOverdueHint:
    'المتأخرات الحالية الآن موزعة على شهر استحقاق فواتيرها — فواتير أقدم من المدى تدخل في إجمالي البطاقة العليا فقط.',
  chartGrowthTitle: 'نمو الطلاب',
  chartGrowthHint: 'أعمدة: طلاب جدد كل شهر. خط: إجمالي الطلاب التراكمي حتى نهاية الشهر.',
} as const
