import { db } from '../../lib/supabase'
import { fetchPlatformOverview } from './api'

// ---------------------------------------------------------------------------
// حالة النظام (3A-933 — طلب مالك 2026-11-28): منطق قسم «حالة النظام»
// في لوحة أدمن المنصة. ثلاث طبقات بلا أي قيمة محفوظة:
// 1) الروابط الرسمية — البرودكشن من نقطة إعداد واحدة (VITE_PRODUCTION_URL)
//    وغيابها حالة «لسه مش منشور» مصممة لا رابط وهمي؛ الديمو هو أصل
//    البيئة الجارية نفسها (التسمية الرسمية للبيئة الحالية «ديمو»)،
//    وصفحة الحجز العامة على نفس الأصل + ‎/book.
// 2) فحوص حية لحظة فتح القسم: التطبيق عبر ‎/api/health (نقطة الفحص
//    القائمة لفجوة 23) مع زمن الرد، وقاعدة البيانات عبر RPC
//    ‏platform_overview بحارس الأدمن — يمرّن PostgREST + القاعدة +
//    RLS بجلسة الأدمن نفسها. فشل أي فحص حالة معروضة («لا يرد»)
//    لا سطح خطأ: مصير الـ catch هنا معلن — الحالة نفسها هي النتيجة.
// 3) آخر نسخة ليلية — نقطة الربط: جدول platform_settings (‏0057،
//    قراءة أدمن فقط) بمفتاح last_backup_at؛ آلية النسخ الليلي
//    (تُبنى مع إعداد البرودكشن) ستكتب فيه عبر service role قيمة
//    jsonb نصية ISO للحظة آخر نسخة ناجحة. غياب الصف/الجدول =
//    «لسه مش مفعّلة» مصممة — لا مهاجرة جديدة لهذا البند.
// ---------------------------------------------------------------------------

/** مفتاح آخر نسخة ليلية ناجحة في platform_settings — عقد آلية النسخ */
export const LAST_BACKUP_KEY = 'last_backup_at'

/** روابط النظام الرسمية — البرودكشن null حتى يُضبط رابطه عند الإطلاق */
export interface SystemLinks {
  production: string | null
  demo: string
  booking: string
}

/**
 * تنقية قيمة رابط البرودكشن الخام من الإعداد: نص http(s) مقصوص أو
 * null. أي قيمة بلا بروتوكول ويب تُرفض — لا يُعرض رابط مشوّه أبداً.
 */
export function resolveProductionUrl(raw: string | undefined): string | null {
  const value = (raw ?? '').trim()
  if (value === '') return null
  if (!value.startsWith('https://') && !value.startsWith('http://')) {
    return null
  }
  return value.replace(/\/+$/, '')
}

/** رابط البرودكشن من نقطة الإعداد الواحدة (متغير بناء — يُضبط عند الإطلاق) */
export function productionUrl(): string | null {
  return resolveProductionUrl(
    import.meta.env.VITE_PRODUCTION_URL as string | undefined,
  )
}

/** بناء الروابط الثلاثة من أصل البيئة الجارية ورابط البرودكشن المضبوط */
export function buildSystemLinks(
  origin: string,
  production: string | null,
): SystemLinks {
  const base = origin.replace(/\/+$/, '')
  return {
    production,
    demo: base,
    booking: `${base}/book`,
  }
}

/** نتيجة فحص حي واحد: يرد أو لا يرد — الفحص لا يرمي أبداً */
export interface HealthProbeResult {
  ok: boolean
  /** زمن الرد بالمللي ثانية (لفحص التطبيق فقط) */
  latencyMs: number | null
}

type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<{ ok: boolean }>

/**
 * فحص «التطبيق بيرد»: GET ‎/api/health بلا تخزين مؤقت. أي فشل
 * (شبكة/حالة غير ناجحة) مصيره المعلن: ok=false — القسم يعرض
 * «لا يرد» ولا يرى المستخدم خطأ خاماً أبداً.
 */
export async function checkAppHealth(
  fetchFn: FetchLike = (input, init) => fetch(input, init),
  now: () => number = () => performance.now(),
): Promise<HealthProbeResult> {
  const started = now()
  try {
    const res = await fetchFn('/api/health', { cache: 'no-store' })
    return { ok: res.ok, latencyMs: Math.max(0, Math.round(now() - started)) }
  } catch {
    // مصير واضح: فشل الشبكة نفسه هو نتيجة الفحص — «لا يرد».
    return { ok: false, latencyMs: Math.max(0, Math.round(now() - started)) }
  }
}

/**
 * فحص «قاعدة البيانات بترد»: نداء platform_overview بحارس الأدمن.
 * أي خطأ (الدالة غائبة قبل بوابة التجميد، أو القاعدة لا ترد)
 * مصيره المعلن: ok=false — نفس دلالة الفحص الحي، لا خطأ خام.
 */
export async function checkDbHealth(
  probe: () => Promise<unknown> = fetchPlatformOverview,
): Promise<HealthProbeResult> {
  try {
    await probe()
    return { ok: true, latencyMs: null }
  } catch {
    // مصير واضح: فشل النداء نفسه هو نتيجة الفحص — «لا يرد».
    return { ok: false, latencyMs: null }
  }
}

/**
 * تحويل قيمة last_backup_at الخام (jsonb) إلى لحظة ISO: نص تاريخ
 * صالح فقط؛ أي شكل آخر (غائب/رقم/نص مشوّه) = null فتُعرض حالة
 * «لسه مش مفعّلة» بدل لحظة مخترعة.
 */
export function parseBackupValue(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  return Number.isNaN(new Date(value).getTime()) ? null : value
}

/** هل الخطأ سببه غياب جدول/علاقة (المهاجرة لم تُطبَّق بعد)؟ */
function isMissingRelation(error: {
  code?: string
  message?: string
} | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (error.message ?? '').includes('does not exist') ||
    (error.message ?? '').includes('schema cache')
  )
}

/**
 * لحظة آخر نسخة ليلية ناجحة من platform_settings — قراءة أدمن فقط
 * بسياسة الجدول نفسها. null عند غياب الصف (الآلية لم تُفعَّل بعد)
 * أو غياب الجدول (0057 غير مطبّقة)؛ أي خطأ آخر يصعد كما هو.
 */
export async function fetchLastBackupAt(): Promise<string | null> {
  const { data, error } = await db()
    .from('platform_settings')
    .select('value')
    .eq('key', LAST_BACKUP_KEY)
    .maybeSingle()
  if (error) {
    if (isMissingRelation(error)) return null
    throw error
  }
  if (!data) return null
  return parseBackupValue(data.value)
}

/**
 * نسخ نص إلى الحافظة: واجهة Clipboard الحديثة أولاً، وبديل مصمم
 * (حقل مؤقت + execCommand) للمتصفحات/السياقات بلا إذن حافظة.
 * يرجع هل تم النسخ فعلاً — الواجهة تعرض «اتنسخ» عند النجاح فقط.
 */
export async function copyTextToClipboard(
  text: string,
  doc: Document = document,
  nav: Navigator = navigator,
): Promise<boolean> {
  if (nav.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text)
      return true
    } catch {
      // رفض الإذن/السياق — المصير المعلن: البديل الكلاسيكي أدناه.
    }
  }
  // البديل المصمم: حقل نص مؤقت خارج الشاشة + أمر النسخ الكلاسيكي.
  try {
    const area = doc.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    doc.body.appendChild(area)
    area.select()
    const copied = doc.execCommand('copy')
    doc.body.removeChild(area)
    return copied
  } catch {
    // مصير واضح: لا وسيلة نسخ متاحة — الواجهة تطلب النسخ اليدوي.
    return false
  }
}
