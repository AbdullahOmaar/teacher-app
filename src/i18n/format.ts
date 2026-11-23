/**
 * تنسيقات Intl للغة (W7 — R-6).
 *
 * قرار الأرقام الموثّق: التطبيق يستخدم أرقاماً لاتينية وفواصل آلاف
 * ASCII عبر lib/format منذ v1.0 (قرار عرض قائم في كل الشاشات)، فلا
 * يبدّل هذا الملف أرقاماً قائمة — يقدّم فئة الجمع CLDR (تستخدمها t)
 * وتنسيق تاريخ ar-EG بأرقام لاتينية (u-nu-latn) للاستخدامات الجديدة،
 * وأي توحيد شامل للأرقام قرار مرحلة مستقل لا تغيير صامت هنا.
 */

const pluralRules = new Intl.PluralRules('ar-EG')

/** فئة جمع CLDR لعدد — zero/one/two/few/many/other */
export function pluralCategory(count: number): Intl.LDMLPluralRule {
  return pluralRules.select(count)
}

