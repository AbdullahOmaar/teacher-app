// ============================================================================
// أدوات CSV مشتركة — كانت csvEsc منسوخة في settings/api وstudents/import،
// وُوحّدت هنا (مراجعة الكود النظيف) مع تحييد حقن الصيغ (مراجعة الأمان C-05).
// ============================================================================

/**
 * هروب CSV قياسي: اقتباس عند وجود فاصلة/اقتباس/سطر جديد ومضاعفة علامات
 * الاقتباس. + تحييد صيغ جداول البيانات: خلية نصية تبدأ بـ ‎= + - @‎ قد
 * ينفّذها Excel/Sheets كصيغة عند فتح الملف (Formula Injection) — تُسبَق
 * بفاصلة علوية فتُعرَض كنص. الأرقام الصرفة (مثل ‎-50) تبقى كما هي حتى
 * تظل قابلة للجمع حسابياً.
 */
export function csvEsc(value: unknown): string {
  if (value == null) return ''
  let s = String(value)
  if (/^\s*[=+\-@]/.test(s) && !/^\s*[+-]?[\d.,]+$/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEsc).join(',')).join('\r\n')
}
