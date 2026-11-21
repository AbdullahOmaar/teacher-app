/**
 * النصوص المشتركة بين كل الشاشات (W7 — R-4): أزرار وحالات عامة.
 * القاعدة: لا نصّ ظاهر في أي مكوّن خارج هذا القاموس — المفاتيح بنمط
 * feature.screen.element، والوسائط {name} فقط، والجمع كائن CLDR.
 */
export const common = {
  loading: 'بنحمّل…',
  errorTitle: 'حصلت مشكلة في التحميل',
  retry: 'إعادة المحاولة',
  signInFirst: 'سجل الدخول أولاً',
  signInFirstBody: 'البيانات دي خاصة بحسابك ومحمية — لازم تسجل دخول علشان تظهر.',
  signIn: 'تسجيل الدخول',
  noTeacherTitle: 'لا يوجد ملف مدرس مرتبط بحسابك',
  noTeacherBody:
    'حسابك مسجل دخوله، لكن لسه ما اتعملّوش ملف مدرس (أو عضوية فريق) في قاعدة البيانات.',
  unknownError: 'خطأ غير معروف',
  copyUnavailable: 'النسخ مش متاح في المتصفح ده',
  copiedOverdueList: 'اتنسخت قائمة المتأخرات',
  groupFallback: 'مجموعة',
  filter: 'تصفية',
  filterAdvanced: 'تصفية متقدمة',
  close: 'إغلاق',
  /** عدّاد نتائج القوائم بصيغ جمع CLDR (PAT-7): نتيجة/نتيجتان/نتائج */
  resultsCount: {
    zero: '{count} نتيجة',
    one: 'نتيجة واحدة',
    two: 'نتيجتان',
    few: '{count} نتائج',
    many: '{count} نتيجة',
    other: '{count} نتيجة',
  },
} as const
