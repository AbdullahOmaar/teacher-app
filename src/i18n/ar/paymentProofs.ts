/** نصوص إثباتات الدفع */
export const paymentProofs = {
  reviewTitle: 'إثباتات دفع قيد المراجعة',
  reviewHint:
    'أولياء أمور رفعوا لقطات تحويل من البوابة — الاعتماد بيسجل دفعة حقيقية بإيصال، والرفض بيوصل سببه لولي الأمر في البوابة.',
  reviewAction: 'مراجعة',
  reviewSheetTitle: 'مراجعة إثبات دفع — {name}',
  approving: 'بنعتمد ونسجل الدفعة…',
  approveAction: 'اعتماد وتسجيل دفعة',
  approveSuccessToast: 'تم اعتماد الإثبات وتسجيل دفعة — إيصال رقم {receiptNo}',
  rejecting: 'بنرفض…',
  rejectAction: 'رفض الإثبات',
  rejectSuccessToast: 'تم رفض الإثبات — ولي الأمر هيشوف الرفض في البوابة',
  cancel: 'إلغاء',
  imageLoadingAria: 'بنحمّل صورة الإثبات…',
  imageErrorHint:
    'ماقدرناش نعرض صورة الإثبات — ممكن تكون اتحذفت من التخزين. راجع البيانات واتصرف بحذر.',
  imageAlt: 'إثبات دفع {name}',
  claimPrefix: 'ادّعى تحويل',
  claimUploaded: 'اترفع',
  invoiceFieldLabel: 'الفاتورة اللي هتتسجل عليها الدفعة',
  loadingInvoices: 'بنحمّل فواتير الطالب…',
  noDueInvoicesWarn:
    'الطالب مالوش فواتير مستحقة حالياً — الدفعة لازم ترتبط بفاتورة، فالاعتماد متوقف. اصدر فاتورة الشهر الأول أو ارفض الإثبات.',
  optionRemaining: 'متبقي',
  amountFieldLabel: 'المبلغ المعتمد (ج) — زي ما ظاهر في اللقطة فعلياً',
  rejectReasonLabel: 'سبب الرفض (اختياري — بيظهر لولي الأمر في البوابة لو رفضت)',
  rejectReasonPlaceholder: 'مثال: اللقطة مش واضحة، ابعت لقطة أوضح',
  /** رسائل طبقة البيانات (أخطاء مراجعة الإثباتات) */
  apiImageUrlError: 'ماقدرناش نجهز رابط صورة الإثبات',
  apiAlreadyProcessed: 'الإثبات ده اتراجع خلاص — حدّث القائمة وحاول تاني لو محتاج',
  apiAmountError: 'مبلغ الاعتماد لازم يكون أكبر من صفر',
  /** Extract-1 (T10): القراءة التلقائية من لقطة الإثبات عبر مفتاح المدرّس */
  methodFieldLabel: 'طريقة الدفع المعتمدة',
  extractAction: 'قراءة تلقائية من اللقطة',
  extracting: 'بنقرأ اللقطة…',
  extractTitle: 'اللي اتقرأ من اللقطة',
  extractHint:
    'اقتراح آلي من مفتاح الذكاء بتاعك — عبّينا الحقول بيه، راجعه قبل الاعتماد والقرار الأخير ليك دايماً.',
  extractAmountLabel: 'المبلغ',
  extractMethodLabel: 'الطريقة',
  extractDateLabel: 'تاريخ الدفع',
  extractMatch: 'مطابق للمدّعى',
  extractMismatch: 'مختلف عن المدّعى — راجع اللقطة',
  extractConfidenceLabel: 'ثقة القراءة',
  extractConfidenceHigh: 'عالية',
  extractConfidenceMedium: 'متوسطة',
  extractConfidenceLow: 'منخفضة',
  extractNothing:
    'القراءة ما لقتش بيانات واضحة في اللقطة — راجعها بنفسك وكمّل يدوياً زي العادة.',
  extractUnavailable:
    'القراءة التلقائية لسه مش مفعّلة على المنصة — كمّل المراجعة يدوياً زي العادة.',
  extractNoKey:
    'القراءة التلقائية بتشتغل بمفتاح الذكاء بتاعك — ضيفه من الإعدادات الأول وبعدين جرّب تاني.',
  extractFailed: 'القراءة التلقائية ما كملتش — كمّل المراجعة يدوياً زي العادة.',
} as const
