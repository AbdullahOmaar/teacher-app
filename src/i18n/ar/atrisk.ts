/** نصوص المعرّضين للفقد: البطاقة وأسباب الخطورة وصيغ جمعها */
export const atrisk = {
  cardTitle: 'معرّضون للفقد',
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
  pageIntroPre: 'طالب نشط غاب ',
  pageIntroAbsence: '3 حصص متتالية',
  pageIntroMid: ' أو عليه اشتراك',
  pageIntroOverdue: 'متأخر من شهرين أو أكتر',
  pageIntroPost:
    ' — القائمة بتتبني لوحدها من الحضور والفواتير، ومتابعة واحدة بدري ممكن تنقذ اشتراكه.',
  pageIntroAssistantNote: ' (أسباب المتأخرات بتظهر لمالك الحساب بس.)',
  pageFollowedUpToast: 'تمت المتابعة — هيظهر تاني بس لو حصل سبب خطر جديد',
  pageFollowUpErrorToast: 'معلش، تسجيل المتابعة فشل — حاول تاني',
  pageEmptyTitle: 'مفيش طلاب معرّضين للفقد',
  pageEmptyHint:
    'كل الطلاب النشطين حضورهم منتظم ومفيش متأخرات قديمة — القائمة هتظهر هنا لوحدها أول ما حد يستحق المتابعة.',
  pageWhatsappBtn: 'متابعة واتساب',
  pageNoWhatsapp: 'مفيش رقم ولي أمر صالح للواتساب',
  pageStudentFileBtn: 'ملف الطالب',
  pageFollowedUpBtn: 'تمت المتابعة',
  pageFollowingUp: 'بيتسجل…',
  pageReasonGroup: ' — {name}',
  /** نصوص طبقة البيانات: بدائل ورسالة متابعة واتساب لولي الأمر */
  apiGroupFallback: 'مجموعته',
  apiDefaultCentre: 'السنتر',
  apiWaGreeting: 'أهلاً {guardian}، معاكم {centre}.',
  apiWaAbsence:
    'بنطمن على {name}: غاب عن {sessions} متتالية في مجموعة {group}، وحابين نتأكد إن مفيش مشكلة وإننا نقدر نساعد بأي شكل.',
  apiWaOverdue:
    'بنذكّركم إن على {name} اشتراكاً متأخراً ({span}) بمبلغ {amount} — شاكرين تعاونكم في السداد في أقرب وقت ممكن.',
  apiWaClosing: 'شكراً لمتابعتكم، ويسعدنا دايماً تواصلكم معانا.',
} as const
