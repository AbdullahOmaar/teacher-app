/** نصوص التنسيق المشتركة: أسماء الأيام والشهور وتسميات الدورات */
export const format = {
  /** أسماء الأيام — الفهرس مطابق لـ Date.getDay() ‏(0 = الأحد) */
  daySunday: 'الأحد',
  dayMonday: 'الاثنين',
  dayTuesday: 'الثلاثاء',
  dayWednesday: 'الأربعاء',
  dayThursday: 'الخميس',
  dayFriday: 'الجمعة',
  daySaturday: 'السبت',
  /** أسماء الشهور — الفهرس 0 = يناير */
  monthJanuary: 'يناير',
  monthFebruary: 'فبراير',
  monthMarch: 'مارس',
  monthApril: 'أبريل',
  monthMay: 'مايو',
  monthJune: 'يونيو',
  monthJuly: 'يوليو',
  monthAugust: 'أغسطس',
  monthSeptember: 'سبتمبر',
  monthOctober: 'أكتوبر',
  monthNovember: 'نوفمبر',
  monthDecember: 'ديسمبر',
  /** تسميات دورات فوترة المجموعات (قيم BillingType الإنجليزية تبقى مفاتيح) */
  billingMonthlyFixed: 'شهري ثابت',
  billingPerSessionPrepaid: 'بالحصة (مدفوعة مسبقاً)',
  billingPerSessionAttended: 'بالحصة (حسب الحضور)',
  billingWeeklyPackage: 'باقة أسبوعية',
  /** مبلغ منسّق: فواصل آلاف + لاحقة العملة «ج» */
  moneyAmount: '{amount} ج',
  /** لاحقتا صباحاً/مساءً لعرض الوقت بصيغة 12 ساعة */
  amSuffix: 'ص',
  pmSuffix: 'م',
  /** فاصلة تعداد أسماء الأيام */
  daysSeparator: '، ',
} as const
