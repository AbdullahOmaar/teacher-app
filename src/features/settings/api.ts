// ===========================================================================
// الخطوة 10 — التصدير والنسخ الاحتياطي والإعدادات (المواصفات §3.14/§3.15/
// §3.16 + §5.8). كل الأعمدة والجداول بأسماء المخطط 0001_init.sql حرفياً.
//
// عقود مشتركة مع خطوات سابقة لا تُكسر هنا:
// • teacher_settings.last_export_at يقرؤه تنبيه backup في وحدتي الرئيسية
//   والإشعارات (fetchAlerts): «لا تصدير أبداً أو مرّت ≥ 30 يوماً» — أي
//   تصدير CSV أو تنزيل نسخة JSON ناجح يحدّثه هنا (touchLastExportAt).
// • whatsapp_template يقرؤه مودال الإيصال (fetchWhatsappTemplate)،
//   وcenter_share_percent يقرؤه view ‏monthly_profit وشاشة الفلوس —
//   الحفظ هنا في teacher_settings فتصل إليهما القيم الجديدة مباشرة.
// • الثيم: خطاف useTheme القائم (localStorage ‏teacher-app-theme +
//   documentElement.dataset.theme) هو آلية التطبيق الفعلية، وعمود
//   teacher_settings.theme هو النسخة المحفوظة حسابياً — شاشة الإعدادات
//   تزامن الاثنين (تقرأ من القاعدة عند الفتح وتكتب في الاثنين عند الحفظ).
//
// الدفعة #7 (3A-360 — COD-2): فُصل التنفيذ بحسب الأقسام إلى وحدات
// apiSettings (قلب الإعدادات) + apiBrandLogo (الشعار) + apiExport
// (تصدير CSV) + apiImport (استيراد سريع) + apiBackup (النسخ الاحتياطي)
// + apiWhatsapp (واتساب الاختياري)، بمشترك داخلي apiShared — وهذا الملف
// واجهة إعادة تصدير تحفظ السطح العام كما هو حرفياً لكل المستوردين.
// ===========================================================================

export {
  REMINDER_OPTIONS,
  THEME_MODES,
  isValidDigestTime,
  touchLastExportAt,
  updateMascotVisibility,
  updatePushDigestSettings,
  updateTeacherSettings,
  type TeacherSettingsInput,
} from './apiSettings'
export { removeBrandLogo, uploadBrandLogo } from './apiBrandLogo'
export {
  CSV_KINDS,
  buildCsvFile,
  downloadTextFile,
  type CsvKind,
} from './apiExport'
export { quickImportStudents } from './apiImport'
export {
  BACKUP_TABLES,
  buildBackupDownload,
  importBackup,
  parseBackupJson,
  type BackupFile,
  type BackupValidation,
  type ImportReport,
} from './apiBackup'
export {
  fetchWhatsappConfig,
  sendWhatsappTest,
  setWhatsappToken,
  upsertWhatsappConfig,
  type WhatsappConfigInput,
} from './apiWhatsapp'
