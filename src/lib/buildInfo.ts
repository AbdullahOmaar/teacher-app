import { t } from '../i18n'

/**
 * سطر ختم الإصدار الموحّد (قاعدة المالك 2026-11-25): «الإصدار X — نُشر
 * [التاريخ والوقت]» مبني من بيانات البناء نفسه — رقم الإصدار من
 * package.json ووقت البناء محقونان عبر define في vite.config.ts
 * (__APP_VERSION__ / __BUILD_TIME__). لا قيمة مكتوبة يدوياً في أي موضع
 * عرض: السبلاش وفوتر الدخول وقسم «حول التطبيق» كلها تمر من هنا.
 */

/**
 * تنسيق لحظة البناء (ISO) بتوقيت Africa/Cairo حصراً: لحظة النشر واقعة
 * واحدة، وعرضها بتوقيت جهاز القارئ كان سيُظهر أوقاتاً مختلفة لنفس
 * النشر. الصيغة هي نفس صيغة formatDateTimeAr المعتمدة في التطبيق
 * (ar-EG — تاريخ متوسط + وقت قصير) مع تثبيت المنطقة الزمنية.
 * عند قيمة غير صالحة يُعاد النص كما هو (سلوك formatDateTimeAr نفسه).
 */
export function formatBuildTime(buildTimeIso: string): string {
  const d = new Date(buildTimeIso)
  if (Number.isNaN(d.getTime())) return buildTimeIso
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(d)
}

/** بناء سطر الختم من قيم صريحة — قابلة للاختبار بلا ثوابت بناء */
export function buildVersionLine(version: string, buildTimeIso: string): string {
  return t('common.versionStamp', {
    version,
    publishedAt: formatBuildTime(buildTimeIso),
  })
}

/** سطر ختم هذا البناء الجاري — المصدر الوحيد لكل مواضع العرض */
export function versionStampLine(): string {
  return buildVersionLine(__APP_VERSION__, __BUILD_TIME__)
}
