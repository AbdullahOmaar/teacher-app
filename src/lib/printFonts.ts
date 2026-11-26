// ===========================================================================
// خطوط طباعة المستندات (مهمة 12 — ج16-1 / مهاجرة 0054)
//
// خط واحد كان يحكم كل مطبوعات مستر: خط الواجهة نفسه. الآن للمدرس خيار
// خط لمستنداته المطبوعة بهوية سنتره (ورقة الامتحان + إيصال الدفع —
// بطاقة الطالب مستثناة عمداً: تصميم بطاقة ثابت لا مستند). القائمة
// مغلقة ومطابقة لقيد CHECK في 0054، والخطوط مضمّنة محلياً عبر
// ‎@fontsource‎ في main.tsx (لا روابط خارجية — قرار الأوفلاين القائم).
// null/غياب/قيمة مكسورة = الافتراضي 'plex' = السلوك الحالي حرفياً.
// ===========================================================================

export const PRINT_FONT_KEYS = ['plex', 'cairo', 'tajawal', 'almarai', 'amiri'] as const

export type PrintFontKey = (typeof PRINT_FONT_KEYS)[number]

export const DEFAULT_PRINT_FONT: PrintFontKey = 'plex'

export function isPrintFontKey(v: unknown): v is PrintFontKey {
  return typeof v === 'string' && (PRINT_FONT_KEYS as readonly string[]).includes(v)
}

/** أي قيمة خام (من القاعدة/الإعداد) → مفتاح صالح أو null (= الافتراضي) */
export function normalizePrintFont(v: unknown): PrintFontKey | null {
  return isPrintFontKey(v) ? v : null
}

/** عائلة الخط لكل مفتاح — تسقط دائماً لخط الواجهة ثم النظام */
export const PRINT_FONT_FAMILY: Record<PrintFontKey, string> = {
  plex: '"IBM Plex Sans Arabic", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif',
  cairo: '"Cairo", "IBM Plex Sans Arabic", system-ui, sans-serif',
  tajawal: '"Tajawal", "IBM Plex Sans Arabic", system-ui, sans-serif',
  almarai: '"Almarai", "IBM Plex Sans Arabic", system-ui, sans-serif',
  amiri: '"Amiri", "IBM Plex Sans Arabic", serif',
}

/**
 * ستايل منطقة الطباعة لمفتاح مختار: الافتراضي (plex أو null) يرجع
 * undefined حتى يبقى تصيير الأسطح كما هو حرفياً قبل هذه المهمة.
 */
export function printFontStyle(
  key: PrintFontKey | null | undefined,
): { fontFamily: string } | undefined {
  if (!key || key === DEFAULT_PRINT_FONT) return undefined
  return { fontFamily: PRINT_FONT_FAMILY[key] }
}
