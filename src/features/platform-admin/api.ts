import { db } from '../../lib/supabase'

// ---------------------------------------------------------------------------
// أساس أدمن المنصة (مهمة 17 — 0055): نوع مستخدم مستقل تماماً عن المدرس.
// جدول platform_admins بلا أي سياسة قراءة للعميل بالتصميم (قائمته سرّية
// حتى من المتصفح)، ففحص «هل أنا أدمن؟» يتم عبر RPC ‏my_platform_admin
// وحده، وأرقام اللوحة عبر platform_overview — تجميعات فقط بحارس خادمي
// يرفض غير الأدمن؛ لا يقرأ العميل هنا أي صف مدرس تشغيلي إطلاقاً.
// ملاحظة تشغيلية: حتى تُطبَّق 0055 عند بوابة التجميد تفشل هذه النداءات
// (الدوال غير موجودة) — مصيرها المعلن: بوابة الحراسة تعرض «غير متاح»
// وحالة خطأ صريحة في الصفحة، بلا قيم وهمية ولا دخول افتراضي.
// ---------------------------------------------------------------------------

/** أرقام المنصة التجميعية كما ترجع من platform_overview() */
export interface PlatformOverview {
  teachersTotal: number
  teachersActivated: number
  studentsTotal: number
}

/** قيمة عددية آمنة من حمولة jsonb غير موثوقة الشكل: رقم صحيح ≥ 0 أو 0 */
function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
}

/**
 * تحويل حمولة platform_overview الخام (jsonb بمفاتيح snake_case) إلى
 * شكل العميل — أي قيمة غائبة/مشوّهة تسقط إلى 0 بدل كسر الصفحة.
 */
export function parsePlatformOverview(data: unknown): PlatformOverview {
  const row = (data ?? {}) as Record<string, unknown>
  return {
    teachersTotal: asCount(row.teachers_total),
    teachersActivated: asCount(row.teachers_activated),
    studentsTotal: asCount(row.students_total),
  }
}

/** هل الحساب الحالي أدمن منصة؟ عبر RPC الفحص وحده (لا قراءة جدول) */
export async function fetchIsPlatformAdmin(): Promise<boolean> {
  const { data, error } = await db().rpc('my_platform_admin')
  if (error) throw error
  return data === true
}

/** أرقام المنصة التجميعية — الخادم يرفض النداء لغير الأدمن أصلاً */
export async function fetchPlatformOverview(): Promise<PlatformOverview> {
  const { data, error } = await db().rpc('platform_overview')
  if (error) throw error
  return parsePlatformOverview(data)
}
