/** نصوص المعرّضين للفقد: البطاقة وأسباب الخطورة وصيغ جمعها */
export const atrisk = {
  cardTitle: 'معرّضون للفقد',
  cardCount: '{count} طالب',
  cardHint: 'تابعهم بدري — طالب بيكمل معاك أرخص بكتير من طالب جديد.',
  reasonAbsence: 'غائب {sessions} متتالية',
  reasonOverdue: 'متأخر {span} — {amount}',
  /** جمع الحصص بصيغ CLDR: few (3–10) «حصص» وغيرها «حصة» */
  sessions: {
    few: '{count} حصص',
    other: '{count} حصة',
  },
  /** امتداد المتأخرات بالشهور: two «شهرين»، few «شهور»، غيرها «شهراً» */
  monthsSpan: {
    two: 'شهرين',
    few: '{count} شهور',
    other: '{count} شهراً',
  },
} as const
