// ===========================================================================
// الفواتير والمدفوعات — طبقة البيانات (المرجع §3.6 + §5.1–§5.3 + §5.6).
//
// برنامج الكود النظيف (2026-11-27، نمط COD-2 في 3A-360): فُصل التنفيذ
// بحسب الأقسام إلى وحدات apiHelpers (مساعدات نقية وطرق دفع) + apiQueries
// (القراءات) + apiGenerate (إصدار الفواتير) + apiPayments (الدفعات) +
// apiAdjustments (تسوية الحضور) + apiReceipt (الإيصال وواتساب)، بمشترك
// داخلي apiShared — وهذا الملف واجهة إعادة تصدير تحفظ السطح العام كما هو
// حرفياً لكل المستوردين.
// ===========================================================================

export {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  periodYm,
  periodLabel,
  payStateOf,
  isUnpaid,
  INVOICE_MONTH_ALL,
  invoiceMonthOptions,
  resolveInvoiceMonthFilter,
  filterInvoiceList,
  splitArrears,
  summarizeUnpaidByStudent,
  summarizeStudentInvoices,
  type InvoicePayState,
  type InvoiceStatusFilter,
  type ArrearsSplit,
  type UnpaidByStudent,
  type StudentInvoicesSummary,
} from './apiHelpers'
export {
  fetchInvoices,
  fetchInvoice,
  fetchStudentInvoices,
  fetchInvoiceLines,
  fetchInvoicePayments,
  fetchStudentPayments,
  type InvoiceListItem,
  type StudentPaymentItem,
} from './apiQueries'
export {
  calendarSessionsInMonth,
  baseChargeFor,
  clampedDiscount,
  generateInvoices,
  type IssueOptions,
  type IssueResult,
  type BaseChargeInput,
  type BaseCharge,
} from './apiGenerate'
export { createPayment, voidPayment } from './apiPayments'
export {
  fetchInvoiceMonthAttendance,
  applyAttendanceAdjustment,
  type InvoiceMonthSession,
} from './apiAdjustments'
export {
  fetchTeacherDisplayName,
  fetchWhatsappTemplate,
  DEFAULT_WA_TEMPLATE,
  RECEIPT_TEMPLATE_KEYS,
  type ReceiptTemplateKey,
  buildReceiptMessage,
  receiptWaUrl,
} from './apiReceipt'
