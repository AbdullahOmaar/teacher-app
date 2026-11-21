import { supabase } from './supabase'

// ===========================================================================
// الهوية البيضاء (Phase 3، الخطوة 1 — migration ‏0008)
//
// هوية كل مدرس/سنتر اختيارية بالكامل: اسم تجاري (teacher_settings.
// brand_name)، شعار مرفوع في bucket ‏brand-logos بالمسار
// «<teacher_id>/logo.<ext>» (brand_logo_path)، ولون لهجة #RRGGBB
// (brand_accent). غياب أي عنصر = سقوط آمن لهوية التطبيق الافتراضية
// (شعار «نيلي الثقة» + اسم المدرس) — لا كسر بصري أبداً.
// ===========================================================================

export const BRAND_BUCKET = 'brand-logos'

/** حد حجم الشعار — يفرضه الـ bucket على الخادم أيضاً (2MB) */
export const BRAND_LOGO_MAX_BYTES = 2 * 1024 * 1024

export const BRAND_LOGO_MIME_EXT: Record<string, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const ACCENT_RE = /^#[0-9a-fA-F]{6}$/

export function isValidAccent(v: unknown): v is string {
  return typeof v === 'string' && ACCENT_RE.test(v)
}

/** الهوية كما تستهلكها الأسطح (كارت/إيصال/ورقة امتحان/بوابة) بعد الحل */
export interface BrandIdentity {
  /** الاسم المعروض: اسم السنتر التجاري، وإلا اسم المدرس، وإلا null */
  name: string | null
  /** رابط الشعار العام أو null عند غيابه */
  logoUrl: string | null
  /** لون اللهجة المُتحقق منه (#RRGGBB) أو null */
  accent: string | null
}

export const EMPTY_BRAND: BrandIdentity = { name: null, logoUrl: null, accent: null }

/** رابط عام لشعار من مساره في bucket ‏brand-logos (bucket عام القراءة) */
export function brandLogoUrl(path: string | null | undefined): string | null {
  if (!path || !supabase) return null
  const { data } = supabase.storage.from(BRAND_BUCKET).getPublicUrl(path)
  return data.publicUrl || null
}

/** حل الهوية من قيمها الخام: الاسم التجاري يتقدم اسم المدرس دائماً */
export function resolveBrand(input: {
  brandName?: string | null
  teacherName?: string | null
  logoPath?: string | null
  accent?: string | null
}): BrandIdentity {
  const name = input.brandName?.trim() || input.teacherName?.trim() || null
  return {
    name,
    logoUrl: brandLogoUrl(input.logoPath),
    accent: isValidAccent(input.accent) ? input.accent.toLowerCase() : null,
  }
}

// ---------------------------------------------------------------------------
// اشتقاقات لونية من لون اللهجة (للخلفيات والتدرجات) — إدخال مُتحقق منه
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** تغميق لون بنسبة (0..1) — لطرف التدرج الأعمق في كارت الطالب */
export function darken(hex: string, ratio: number): string {
  const [r, g, b] = hexToRgb(hex)
  const f = 1 - Math.max(0, Math.min(1, ratio))
  return rgbToHex(r * f, g * f, b * f)
}

/** تفتيح لون باتجاه الأبيض بنسبة (0..1) — لخلفيات ناعمة بلون اللهجة */

/** ألوان لهجة جاهزة للمنتقي في الإعدادات (القيم الداكنة نسبياً للتباين) */
export const ACCENT_PRESETS: { hex: string; label: string }[] = [
  { hex: '#4f46e5', label: 'نيلي (الافتراضي)' },
  { hex: '#7c3aed', label: 'بنفسجي' },
  { hex: '#1d4ed8', label: 'أزرق' },
  { hex: '#0f766e', label: 'تركوازي' },
  { hex: '#15803d', label: 'أخضر' },
  { hex: '#b45309', label: 'كهرماني' },
  { hex: '#be185d', label: 'وردي' },
  { hex: '#dc2626', label: 'أحمر' },
]
