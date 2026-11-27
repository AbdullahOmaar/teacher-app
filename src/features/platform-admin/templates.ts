import { db } from '../../lib/supabase'
import { isMissingRpcFunction } from '../auth/api'
import {
  CONFIRMATION_CHANNELS,
  FEATURE_KEYS,
  LIMIT_KEYS,
  SETTING_KEYS,
  type FeatureKey,
  type LimitKey,
  type SettingKey,
} from './entitlements'

// ---------------------------------------------------------------------------
// قوالب الأدوار الجاهزة (مهمة 18 — 0063): حزمة استحقاقات جاهزة يطبّقها
// الأدمن على حساب فيكتب تجاوزاً فردياً واحداً لكل إدخال فيها — عبر
// set_account_override نفسه (لا مسار كتابة ثانٍ). القالب نقطة بداية
// لا قفل: تجاوز يدوي لاحق لنفس المفتاح يفوز عليه.
// قاعدة التسامح (دروس الخطوات 1–4): أي جدول/دالة غائب قبل تطبيق
// مهاجراته عند بوابة التجميد يرجع null هنا فتعرض الأقسام حالة
// «قريباً» المصممة — لا خطأ خام أبداً (قاعدة مالك 2026-11-26).
// ---------------------------------------------------------------------------

/** حمولة قالب كما تُخزَّن في role_templates.entitlements
 * (نوع لا واجهة: الواجهة بلا فهرس ضمني فلا تُسند إلى Json عند
 * تمريرها RPC — والـ type alias يأخذ الفهرس الضمني تلقائياً) */
export type TemplateEntitlements = {
  features: Partial<Record<FeatureKey, boolean>>
  limits: Partial<Record<LimitKey, number | null>>
  settings: Partial<Record<SettingKey, string>>
}

/** قالب دور كما يصل للوحة */
export interface RoleTemplate {
  id: string
  slug: string
  name: string
  description: string
  entitlements: TemplateEntitlements
  isActive: boolean
  createdAt: string
  updatedAt: string
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

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isValidSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)
}

/**
 * بناء حمولة قالب من خرائط خام — المفاتيح والقيم غير المعروفة
 * تُسقط بصمت (نفس فلسفة التسامح في دمج الاستحقاقات): قالب لا
 * يحمل إلا مفاتيح صالحة بقيم صالحة.
 */
export function buildTemplateEntitlements(input: {
  features: Partial<Record<string, boolean>>
  limits: Partial<Record<string, number | null>>
  settings: Partial<Record<string, string>>
}): TemplateEntitlements {
  const features: Partial<Record<FeatureKey, boolean>> = {}
  for (const key of FEATURE_KEYS) {
    if (typeof input.features[key] === 'boolean') {
      features[key] = input.features[key] as boolean
    }
  }
  const limits: Partial<Record<LimitKey, number | null>> = {}
  for (const key of LIMIT_KEYS) {
    const v = input.limits[key]
    if (
      v === null ||
      (typeof v === 'number' && Number.isInteger(v) && v >= 0)
    ) {
      limits[key] = v
    }
  }
  const settings: Partial<Record<SettingKey, string>> = {}
  for (const key of SETTING_KEYS) {
    const v = input.settings[key]
    if (
      typeof v === 'string' &&
      (CONFIRMATION_CHANNELS as readonly string[]).includes(v)
    ) {
      settings[key] = v
    }
  }
  return { features, limits, settings }
}

/** هل حمولة القالب فارغة (بلا أي إدخال)؟ — الخادم يرفضها صراحة */
export function isTemplateEntitlementsEmpty(
  entitlements: TemplateEntitlements,
): boolean {
  return (
    Object.keys(entitlements.features).length === 0 &&
    Object.keys(entitlements.limits).length === 0 &&
    Object.keys(entitlements.settings).length === 0
  )
}

function parseEntitlementsSection(
  data: unknown,
): TemplateEntitlements {
  const empty: TemplateEntitlements = { features: {}, limits: {}, settings: {} }
  if (typeof data !== 'object' || data === null) return empty
  const row = data as Record<string, unknown>
  return buildTemplateEntitlements({
    features: (row.features ?? {}) as Partial<Record<string, boolean>>,
    limits: (row.limits ?? {}) as Partial<Record<string, number | null>>,
    settings: (row.settings ?? {}) as Partial<Record<string, string>>,
  })
}

/** تحويل صف role_templates الخام إلى شكل العميل — null عند التشوّه */
export function parseRoleTemplate(data: unknown): RoleTemplate | null {
  if (typeof data !== 'object' || data === null) return null
  const row = data as Record<string, unknown>
  if (typeof row.id !== 'string' || row.id === '') return null
  if (typeof row.slug !== 'string' || !isValidSlug(row.slug)) return null
  if (typeof row.name !== 'string' || row.name.trim() === '') return null
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: asText(row.description),
    entitlements: parseEntitlementsSection(row.entitlements),
    isActive: row.is_active === true,
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at),
  }
}

/**
 * قوالب الأدوار — قراءة الأدمن المباشرة من الجدول (سياسة 0063
 * للأدمن فقط؛ المدرس لا يرى هذا الجدول إطلاقاً). null عند غياب
 * 0063 (قسم «قريباً»).
 */
export async function fetchRoleTemplates(): Promise<RoleTemplate[] | null> {
  const { data, error } = await db()
    .from('role_templates')
    .select('id, slug, name, description, entitlements, is_active, created_at, updated_at')
    .order('created_at', { ascending: true })
  if (error) {
    if (isMissingRelation(error)) return null
    throw error
  }
  return (data ?? [])
    .map(parseRoleTemplate)
    .filter((r): r is RoleTemplate => r !== null)
}

/** إنشاء قالب (RPC 0063) — يرجع معرّف القالب */
export async function createRoleTemplate(input: {
  slug: string
  name: string
  description: string
  entitlements: TemplateEntitlements
}): Promise<string> {
  const { data, error } = await db().rpc('create_role_template', {
    p_slug: input.slug,
    p_name: input.name,
    p_description: input.description,
    p_entitlements: input.entitlements,
  })
  if (error) throw error
  if (typeof data !== 'string' || data === '') {
    throw new Error('create_role_template returned no id')
  }
  return data
}

/** تعديل قالب (RPC 0063) — استبدال كامل للاسم/الوصف/الحمولة/التفعيل */
export async function updateRoleTemplate(input: {
  templateId: string
  name: string
  description: string
  entitlements: TemplateEntitlements
  isActive: boolean
}): Promise<string> {
  const { data, error } = await db().rpc('update_role_template', {
    p_template_id: input.templateId,
    p_name: input.name,
    p_description: input.description,
    p_entitlements: input.entitlements,
    p_is_active: input.isActive,
  })
  if (error) throw error
  if (typeof data !== 'string' || data === '') {
    throw new Error('update_role_template returned no id')
  }
  return data
}

/**
 * تطبيق قالب على حساب (RPC 0063) — يرجع معرّفات التجاوزات المكتوبة.
 * غياب الدالة قبل 0063 يُرجع null فيعرض القسم «قريباً»؛ أي خطأ آخر
 * يصعد كما هو.
 */
export async function applyRoleTemplate(input: {
  templateId: string
  teacherId: string
  reason: string
  expiresAt: string | null
}): Promise<string[] | null> {
  const { data, error } = await db().rpc('apply_role_template', {
    p_template_id: input.templateId,
    p_teacher_id: input.teacherId,
    p_reason: input.reason,
    ...(input.expiresAt ? { p_expires_at: input.expiresAt } : {}),
  })
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  if (!Array.isArray(data)) return []
  return data.filter((x): x is string => typeof x === 'string')
}
