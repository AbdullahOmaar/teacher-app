import { useQueryClient, type QueryClient } from '@tanstack/react-query'

/**
 * إبطال كاش مركزي بالمبادئ (PAT-1 — مراجعة ما بعد الموجة + 3A-296):
 * كل طفرة تعلن مجموعة المبادئ المتأثرة بها عبر هذه الدالة حصراً، حتى
 * تكون خريطة الإبطال قابلة للمراجعة في موضع واحد لكل وحدة بدل سلاسل
 * invalidateQueries مبعثرة (وبعضها كان ناقصاً: التحليلات والمعرّضون
 * لم يكونا يُبطَلان أبداً من طفرات الفلوس/الحضور، وإنشاء طالب/مجموعة
 * لم يكن يبطل الرئيسية). القاعدة: أي وحدة مشتقة من جداول وحدة أخرى
 * (التحليلات/المعرّضون/الرئيسية) يجب أن تظهر في مجموعة كل طفرة تكتب
 * في تلك الجداول.
 *
 * خريطة الطفرات → المبادئ (3A-377 — اكتملت بالأدلة من قراءات الوحدات
 * المشتقة، لا بالتخمين):
 * - التحليلات تقرأ: attendance, invoice_balances, groups, students
 *   (analytics/api.ts) + view ‏monthly_profit (payments) — فأي طفرة
 *   تكتب في هذه الجداول تُبطل 'analytics'.
 * - المعرّضون يقرأون: students, groups, sessions, invoice_balances,
 *   enrollments, attendance, invoices (atrisk/api.ts) — فطفرات الطلاب/
 *   التسجيلات والفلوس (المتأخرات) تُبطل 'atrisk'.
 * - الرئيسية/التنبيهات تقرأ: students, sessions, attendance, payments,
 *   invoice_balances, enrollments (home/api.ts) + scores/assessments
 *   عبر fetchAlerts (notifications/api.ts) — فطفرات الدرجات/الامتحانات
 *   (التي تكتب scores) تُبطل 'home'.
 * - الحضور يقرأ sessions (attendance/api.ts) — فطفرات الجدول (نقل/
 *   إلغاء حصة) تُبطل 'attendance'.
 * الاتجاه الآمن دائماً: إبطال أوسع، لا أضيق — زيادة لا تُسكت بيانات
 * قديمة، ونقصان يفعل.
 */
export const INVALIDATION_SETS = {
  /** متابعة معرّض للفقد: القائمة المشتقة وحدها. */
  atrisk: ['atrisk'],
  /** الحضور يغذي: الرئيسية، الجدول، المعرّضين، التحليلات، الفواتير. */
  attendance: ['attendance', 'home', 'schedule', 'atrisk', 'analytics', 'invoices'],
  /** الفريق: قائمة الأعضاء + ملف المدرس الحالي. */
  authTeam: ['team', 'current-teacher'],
  /** ملف المدرس الحالي وحده (حفظ الملف/إنشاء سنتر). */
  currentTeacher: ['current-teacher'],
  /** رابط الحجز: الاستعلام الوحيد تحت 'enrol' — المجموعة مساوية مثبتة. */
  enrol: ['enrol'],
  /** الامتحان يكتب scores (الترحيل التلقائي) فتتأثر الدرجات + تنبيهات الرئيسية. */
  exams: ['exams', 'grades', 'home'],
  /** ملاحظات المدرس (0052): قائمتها وعدّاد غير المقروء وحدهما. */
  feedback: ['feedback'],
  /** الدعم الفني + إعلانات المنصة (0065): تذاكر الحساب وإعلاناته. */
  support: ['support'],
  /** الدرجات تغذي الرئيسية (تنبيهات الدرجات) وملف الطالب والتحليلات. */
  grades: ['grades', 'home', 'sg', 'analytics'],
  /** المجموعات: الجدول يولّد منها والحضور يقرأ قوائمها والتحليلات تعدّها،
   * والمعرّضون يقرأون (id, name) للعرض — فإعادة التسمية بلا إبطال
   * 'atrisk' كانت تترك اسمًا قديمًا (ملاحظة المراجعة المستقلة #1 في 3A-377). */
  groups: ['sg', 'home', 'schedule', 'attendance', 'analytics', 'atrisk'],
  /** الفلوس تغذي: الفلوس (الربح)، التحليلات، والمعرّضين (سبب المتأخرات). */
  invoices: ['invoices', 'home', 'sg', 'money', 'analytics', 'atrisk'],
  /** المصروفات/الأسهم تغذي الرئيسية والتحليلات (صافي الربح). */
  money: ['money', 'home', 'analytics'],
  /** اعتماد إثبات ينشئ دفعة: يغذي الفواتير والفلوس والتحليلات والمعرّضين. */
  paymentProofs: ['payment-proofs', 'invoices', 'home', 'sg', 'money', 'analytics', 'atrisk'],
  /** البوابة: توكناتها وقوائمها وحدها. */
  portal: ['portal'],
  /** الصفحة الشخصية (0074): إدارة المدرّس وأسطحها وحدها. */
  profile: ['profile'],
  /** الجدول يغذي الرئيسية والحضور (الحصص مصدر قوائم الحضور اليومية). */
  schedule: ['schedule', 'home', 'attendance'],
  /** حفظ الإعدادات: نسبة السنتر تدخل view الربح وقالب الواتساب وتنبيهات
   * الرئيسية، والهوية البيضاء (الاسم/اللهجة) قد تتغير مع الحفظ فتدخل
   * 'brand-identity' التي تقرأها أسطح العرض. */
  settings: ['settings', 'money', 'invoices', 'home', 'brand-identity'],
  /** الشعار: إعدادات الوحدة + كاش الهوية للأسطح. */
  settingsBrand: ['settings', 'brand-identity'],
  /** بوابة الطالب: توكناتها وحدها. */
  studentPortal: ['student-portal'],
  /** الطلاب/التسجيلات: قوائم الحضور، عدّادات التحليلات، ومجموعة مرشحي المعرّضين. */
  students: ['sg', 'home', 'attendance', 'analytics', 'atrisk'],
  /** حذف طالب: cascade على الحضور والدرجات أيضاً — أوسع مجموعة في التطبيق. */
  studentsDelete: ['sg', 'home', 'attendance', 'grades', 'atrisk', 'analytics'],
} as const

/**
 * إبطال كل الاستعلامات تحت مبادئ معطاة. يرجع وعداً ينتهي بعد إعادة
 * جلب الاستعلامات النشطة المبطَلة — فتستطيع إجراءات «تحديث» الانتظار
 * عليه (سحب-للتحديث) بدل افتراض اكتمال الإبطال فوراً.
 */
export function invalidatePrefixes(
  qc: QueryClient,
  prefixes: readonly string[],
): Promise<void> {
  return Promise.all(
    prefixes.map((prefix) => qc.invalidateQueries({ queryKey: [prefix] })),
  ).then(() => undefined)
}

/**
 * مصنع خطاف الإبطال المركزي (3A-377): كل غلاف useInvalidate* في وحدة
 * ما هو سطر واحد فوق هذا المساعد بمجموعته من INVALIDATION_SETS —
 * بلا invalidateQueries مبعثرة وبلا useQueryClient مكرر في كل ملف.
 */
export function useInvalidatePrefixes(prefixes: readonly string[]): () => void {
  const qc = useQueryClient()
  return () => {
    void invalidatePrefixes(qc, prefixes)
  }
}
