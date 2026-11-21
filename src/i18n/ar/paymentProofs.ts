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
} as const
