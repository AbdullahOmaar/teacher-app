/**
 * جرد شاشات الفحص البصري (3A-326) — تعداد من راوتر التطبيق نفسه
 * (src/App.tsx): الشاشات العامة + شاشات الجلسة + شاشتا البوابتين بروابط
 * مولّدة. كل إدخال: معرّف ثابت (اسم ملف اللقطة)، المسار أو طريقة حلّه،
 * وسماحية الفرق القصوى عند الانحدار (نسبة بكسلات مختلفة مسموحة —
 * الشاشات الحساسة للزمن/التاريخ لها سماحية أعلى وموثّقة).
 *
 * السماحيات: الافتراضي 0.002 (0.2%). الشاشات المعلّمة volatile تحمل
 * نصوصاً زمنية (أوقات نسبية/حصص اليوم) قد تهتزّ رغم تجميد الساعة
 * (طوابع خادم حقيقية)، فسماحيتها 0.01 (1%) — تُراجع بالأدلة عند كل
 * إعادة بناء لخط الأساس.
 */
export const SCREENS = [
  /* ---------------- العامة (بلا جلسة) ---------------- */
  { id: 'login', name: 'تسجيل الدخول', path: '/login', auth: 'public' },
  { id: 'reset-password', name: 'إعادة تعيين كلمة المرور', path: '/reset-password', auth: 'public' },
  { id: 'enrol-book', name: 'صفحة الحجز العامة', path: '/book', auth: 'public' },
  { id: 'exam-entry', name: 'دخول الامتحان (بلا رمز)', path: '/exam', auth: 'public' },
  { id: 'portal-entry', name: 'بوابة ولي الأمر (بلا رابط)', path: '/portal', auth: 'public' },
  // ملحوظة موثقة (مراجعة 3A-326): بلا جلسة يعيد هذا المسار التوجيه إلى
  // /login فعلياً (لقطته مطابقة بايتياً للقطة login) — 404 المنفردة لا
  // تظهر؛ السلوك مسجّل كبند في بند نتائج المراجعة الأولى.
  { id: 'notfound-public', name: '404 خارج الجلسة', path: '/no-such-screen-xyz', auth: 'public' },

  /* ---------------- داخل الجلسة (حساب الديمو) ---------------- */
  { id: 'home', name: 'الرئيسية', path: '/', auth: 'demo', maxDiffRatio: 0.01, volatile: 'بطاقات اليوم/الحصص مرتبطة بتاريخ اليوم المجمّد' },
  { id: 'attendance', name: 'الحضور (أول يوم بجلسة)', path: '/attendance', auth: 'demo', resolve: 'attendance', maxDiffRatio: 0.01, volatile: 'تُقدَّم الأيام حتى أول جلسة (منطق E2E نفسه) — اليوم المختار يُسجَّل في البيان' },
  { id: 'homework', name: 'الواجب', path: '/homework', auth: 'demo', maxDiffRatio: 0.01, volatile: 'ضجيج مقاس 0.40–0.42% (قوائم أسماء طويلة — أشباح حروف دون البكسل) — قياسات 3A-326' },
  { id: 'students', name: 'الطلاب', path: '/students', auth: 'demo' },
  { id: 'student-detail', name: 'ملف طالب', path: null, auth: 'demo', resolve: 'first-student' },
  { id: 'groups', name: 'المجموعات', path: '/groups', auth: 'demo' },
  { id: 'group-detail', name: 'ملف مجموعة', path: null, auth: 'demo', resolve: 'first-group' },
  { id: 'invoices', name: 'الفواتير', path: '/invoices', auth: 'demo' },
  { id: 'invoice-detail', name: 'تفاصيل فاتورة', path: null, auth: 'demo', resolve: 'first-invoice' },
  { id: 'schedule', name: 'الجدول', path: '/schedule', auth: 'demo', maxDiffRatio: 0.01, volatile: 'أسبوع التاريخ المجمّد' },
  { id: 'grades', name: 'الدرجات', path: '/grades', auth: 'demo' },
  { id: 'assessment-detail', name: 'تفاصيل تقييم', path: null, auth: 'demo', resolve: 'first-assessment' },
  { id: 'money', name: 'المالية/الخزنة', path: '/money', auth: 'demo' },
  { id: 'notifications', name: 'الإشعارات', path: '/notifications', auth: 'demo', maxDiffRatio: 0.01, volatile: 'أوقات نسبية محسوبة من طوابع خادم' },
  { id: 'more', name: 'المزيد', path: '/more', auth: 'demo' },
  { id: 'settings', name: 'الإعدادات', path: '/settings', auth: 'demo' },
  { id: 'export', name: 'التصدير', path: '/export', auth: 'demo' },
  { id: 'backup', name: 'النسخ الاحتياطي', path: '/backup', auth: 'demo', maxDiffRatio: 0.01, volatile: 'ضجيج متقطع مقاس حتى 0.66% (0.000% في تشغيلتين) — قياسات 3A-326' },
  { id: 'portal-links', name: 'إدارة روابط البوابات', path: '/portal-links', auth: 'demo' },
  { id: 'activity-log', name: 'سجل النشاط', path: '/activity-log', auth: 'demo', maxDiffRatio: 0.01, volatile: 'طوابع زمنية للنشاط' },
  { id: 'analytics', name: 'التحليلات', path: '/analytics', auth: 'demo', maxDiffRatio: 0.01, volatile: 'فترة الشهر الحالي المجمّد' },
  { id: 'at-risk', name: 'المعرضون للخطر', path: '/at-risk', auth: 'demo', maxDiffRatio: 0.01, volatile: 'بصمة ضجيج ثابتة 0.481% في ثلاث قياسات مستقلة والمحتوى مطابق بالعين — قياسات 3A-326' },
  { id: 'notfound-shell', name: '404 داخل الجلسة', path: '/no-such-screen-xyz', auth: 'demo' },

  /* ---------------- البوابتان (روابط مولّدة، سياق مجهول) ---------------- */
  { id: 'portal-parent', name: 'بوابة ولي الأمر (برابط مولّد)', path: null, auth: 'token', resolve: 'portal-parent' },
  { id: 'portal-student', name: 'بوابة الطالب (برابط مولّد)', path: null, auth: 'token', resolve: 'portal-student' },
];

export const EXPECTED_COUNT = SCREENS.length;
