import { db } from '../../lib/supabase'
import { isMissingRpcFunction } from '../auth/api'
import type { OverrideInput } from './entitlements'

// ---------------------------------------------------------------------------
// لوحة أدمن المنصة (مهمة 17 — 0061، الخطوة 7 + سجل التدقيق 0063،
// الخطوة 6): سطح القراءة والأفعال الذي تقف عليه الواجهة. القراءات
// التجميعية عبر RPCs بحارس أدمن خادمي (platform_workspaces /
// platform_indicators) — لا يقرأ العميل أي صف مدرس تشغيلي؛ والأفعال
// عبر RPCs الأدمن (تفعيل الحساب / تعيين الباقة من 0061، والتجاوزات
// من 0059 كما هي بلا تكرار)، وقائمة السماح وقلب قفل التسجيل عبر
// RPCs موثّقة من 0063 (platform_allowlist_add/remove و
// platform_set_registration_open — الكتابة المباشرة للجدول من
// العميل متوقفة منذ 0063 حتى يُوثَّق كل فعل)، وقراءة سجل التدقيق
// عبر platform_audit_log_list (0063).
//
// قاعدة التسامح (دروس الخطوات 1–4): أي دالة/جدول غائب قبل تطبيق
// مهاجراته عند بوابة التجميد يرجع null هنا فتُعرض حالة «قريباً»
// مصممة في القسم المقابل — لا خطأ خام أبداً (قاعدة مالك 2026-11-26:
// أي خاصية غير مُطلقة تعرض حالة مصممة لا خطأ). أي خطأ آخر يصعد.
// أفعال الكتابة بلا رجوع متسامح عمداً: فعل بلا دالة موثّقة خير أن
// يفشل بخطأ مصمم من أن يمرّ بلا أثر تدقيق.
// ---------------------------------------------------------------------------

/** باقات المنصة الأربع (ثابتة بقيد plans.slug في 0058) */
export const PLAN_SLUGS = ['trial', 'basic', 'pro', 'pilot'] as const

export type PlanSlug = (typeof PLAN_SLUGS)[number]

/** مؤشرات المنصة كما ترجع من platform_indicators() */
export interface PlatformIndicators {
  teachersTotal: number
  teachersActivated: number
  teachersNew7d: number
  teachersNew30d: number
  studentsTotal: number
  subscriptionsByPlan: Record<PlanSlug, number>
  /**
   * الإيراد المتوقع — null دائماً في هذه الخطوة: لا أسعار معتمدة
   * (قرار مالك م1)؛ الواجهة تعرض «—». المحلّل يفرض null مهما رجع
   * من الخادم حتى لا يتسلل رقم مخترع قبل اعتماد الأسعار.
   */
  expectedRevenue: null
}

/** مساحة عمل واحدة كما ترجع من platform_workspaces() */
export interface PlatformWorkspace {
  teacherId: string
  displayName: string
  ownerEmail: string
  createdAt: string
  accountActivated: boolean
  planSlug: string | null
  subscriptionStatus: string | null
  trialEndsAt: string | null
  studentsCount: number
  lastActivityAt: string | null
}

/**
 * هل التجاوز نشط الآن؟ دائم (بلا انتهاء) أو انتهاؤه في المستقبل —
 * المنتهي تاريخ صامت لا أثر له (نفس دلالة effective_entitlements).
 * المعامل now قابل للحقن لاختبار الانتهاء حتمياً.
 */
export function isOverrideActive(
  row: { expiresAt: string | null },
  now: Date = new Date(),
): boolean {
  return row.expiresAt === null || new Date(row.expiresAt).getTime() > now.getTime()
}

/** صف قائمة سماح (0057) */
export interface AllowlistEntry {
  id: string
  email: string | null
  phone: string | null
  note: string | null
  createdAt: string
}

/** تجاوز قائم لحساب (قراءة الأدمن من account_overrides — 0059) */
export interface AccountOverrideRow extends OverrideInput {
  id: string
  reason: string
  createdAt: string
}

/** سطر تدقيق واحد كما يرجع من platform_audit_log_list (0063) */
export interface AuditLogRow {
  id: string
  adminUserId: string | null
  adminLabel: string | null
  action: string
  targetTeacherId: string | null
  targetLabel: string | null
  details: Record<string, unknown>
  createdAt: string
}

/** نتيجة قراءة سجل التدقيق — عدّ إجمالي + صفوف الصفحة الحالية */
export interface AuditLogPage {
  total: number
  rows: AuditLogRow[]
}

/** أفعال الأدمن المعروفة في سجل التدقيق (للمرشّح — أي فعل آخر يظهر كما هو) */
export const AUDIT_ACTIONS = [
  'override_set',
  'override_revoked',
  'account_activated',
  'account_deactivated',
  'subscription_plan_changed',
  'allowlist_added',
  'allowlist_removed',
  'registration_open_changed',
] as const

/** حالة قسم في اللوحة — قرار نقي قابل للاختبار بلا تصيير */
export type PanelSectionState = 'loading' | 'coming-soon' | 'error' | 'ready'

/**
 * قرار حالة القسم: التحميل أولاً، ثم «قريباً» عندما تكون بيانات
 * القسم غائبة لأن دالتها/جدولها لم تُطبَّق بعد (null من طبقة
 * البيانات)، ثم الخطأ المصمم، وإلا جاهز. «قريباً» تسبق «خطأ» عمداً:
 * غياب المهاجرة حالة متوقعة حتى بوابة التجميد، لا عطل.
 */
export function panelSectionState(input: {
  pending: boolean
  failed: boolean
  /** البيانات null = الدالة/الجدول غائب (المهاجرة لم تُطبَّق بعد) */
  missing: boolean
}): PanelSectionState {
  if (input.pending) return 'loading'
  if (input.missing) return 'coming-soon'
  if (input.failed) return 'error'
  return 'ready'
}

/**
 * حالة قسم إعدادات واتساب المنصة: لا رقم منصة مسجّلاً بعد (لا مصدر
 * بيانات له أصلاً — الرقم قرار مالك ق4 والعدّادات مع الخطوة 5/T24)
 * فالحالة «قريباً» دائماً في هذه الخطوة. القرار نقي حتى تُبنى
 * القناة لاحقاً فوقه بلا تغيير في الواجهة.
 */
export function whatsappSectionState(input: {
  platformNumberRegistered: boolean
}): PanelSectionState {
  return input.platformNumberRegistered ? 'ready' : 'coming-soon'
}

/** قيمة عددية آمنة من حمولة jsonb غير موثوقة الشكل: رقم صحيح ≥ 0 أو 0 */
function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
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
 * تحويل حمولة platform_indicators الخام إلى شكل العميل — مفاتيح
 * الباقات الأربع ثابتة (غياب أي مفتاح = 0)، والإيراد null قسراً.
 */
export function parsePlatformIndicators(data: unknown): PlatformIndicators {
  const row = (data ?? {}) as Record<string, unknown>
  const byPlan = (row.subscriptions_by_plan ?? {}) as Record<string, unknown>
  return {
    teachersTotal: asCount(row.teachers_total),
    teachersActivated: asCount(row.teachers_activated),
    teachersNew7d: asCount(row.teachers_new_7d),
    teachersNew30d: asCount(row.teachers_new_30d),
    studentsTotal: asCount(row.students_total),
    subscriptionsByPlan: {
      trial: asCount(byPlan.trial),
      basic: asCount(byPlan.basic),
      pro: asCount(byPlan.pro),
      pilot: asCount(byPlan.pilot),
    },
    expectedRevenue: null,
  }
}

/**
 * تحويل حمولة platform_workspaces الخام (مصفوفة jsonb) إلى شكل
 * العميل — صف بلا teacher_id يُتخطى، وأي قيمة مشوّهة تسقط لقيمة
 * آمنة بدل كسر الجدول كله.
 */
export function parsePlatformWorkspaces(data: unknown): PlatformWorkspace[] {
  if (!Array.isArray(data)) return []
  const out: PlatformWorkspace[] = []
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue
    const row = item as Record<string, unknown>
    if (typeof row.teacher_id !== 'string' || row.teacher_id === '') continue
    out.push({
      teacherId: row.teacher_id,
      displayName:
        typeof row.display_name === 'string' ? row.display_name : '',
      ownerEmail: typeof row.owner_email === 'string' ? row.owner_email : '',
      createdAt: typeof row.created_at === 'string' ? row.created_at : '',
      accountActivated: row.account_activated === true,
      planSlug: asText(row.plan_slug),
      subscriptionStatus: asText(row.subscription_status),
      trialEndsAt: asText(row.trial_ends_at),
      studentsCount: asCount(row.students_count),
      lastActivityAt: asText(row.last_activity_at),
    })
  }
  return out
}

/** مؤشرات المنصة — null عند غياب 0061 (قسم «قريباً») */
export async function fetchPlatformIndicators(): Promise<PlatformIndicators | null> {
  const { data, error } = await db().rpc('platform_indicators')
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  return parsePlatformIndicators(data)
}

/** مساحات العمل — null عند غياب 0061 (قسم «قريباً») */
export async function fetchPlatformWorkspaces(): Promise<PlatformWorkspace[] | null> {
  const { data, error } = await db().rpc('platform_workspaces')
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  return parsePlatformWorkspaces(data)
}

/** تفعيل/إيقاف حساب (0061) — الإيقاف لا يمسّ البيانات، ورجوعه فوري */
export async function setAccountActivated(
  teacherId: string,
  activated: boolean,
  reason: string,
): Promise<void> {
  const { error } = await db().rpc('platform_set_account_activated', {
    p_teacher_id: teacherId,
    p_activated: activated,
    ...(reason.trim() !== '' ? { p_reason: reason.trim() } : {}),
  })
  if (error) throw error
}

/** تعيين باقة اشتراك لحساب (0061) — نهاية تجربة اختيارية بصيغة ISO */
export async function setSubscriptionPlan(
  teacherId: string,
  planSlug: PlanSlug,
  trialEndsAt: string | null,
): Promise<void> {
  const { error } = await db().rpc('platform_set_subscription_plan', {
    p_teacher_id: teacherId,
    p_plan_slug: planSlug,
    ...(trialEndsAt ? { p_trial_ends_at: trialEndsAt } : {}),
  })
  if (error) throw error
}

/** إعداد تجاوز فردي (RPC 0059 كما هو — لا تكرار؛ 0063 تضيف النوع 'setting') */
export async function setAccountOverride(input: {
  teacherId: string
  kind: 'feature' | 'limit' | 'setting'
  key: string
  value: boolean | number | string | null
  reason: string
  expiresAt: string | null
}): Promise<void> {
  const { error } = await db().rpc('set_account_override', {
    p_teacher_id: input.teacherId,
    p_kind: input.kind,
    p_key: input.key,
    p_value: input.value,
    p_reason: input.reason,
    ...(input.expiresAt ? { p_expires_at: input.expiresAt } : {}),
  })
  if (error) throw error
}

/** إلغاء تجاوز (RPC 0059 كما هو — إنهاء لا حذف) */
export async function revokeAccountOverride(overrideId: string): Promise<void> {
  const { error } = await db().rpc('revoke_account_override', {
    p_override_id: overrideId,
  })
  if (error) throw error
}

/** تحويل صف account_overrides الخام إلى شكل العميل — null عند التشوّه */
export function parseAccountOverrideRow(
  data: unknown,
): AccountOverrideRow | null {
  if (typeof data !== 'object' || data === null) return null
  const row = data as Record<string, unknown>
  if (typeof row.id !== 'string' || row.id === '') return null
  if (
    row.kind !== 'feature' &&
    row.kind !== 'limit' &&
    row.kind !== 'setting'
  ) {
    return null
  }
  if (typeof row.key !== 'string' || row.key === '') return null
  const value = row.value
  if (
    value !== null &&
    typeof value !== 'boolean' &&
    typeof value !== 'number' &&
    typeof value !== 'string'
  ) {
    return null
  }
  return {
    id: row.id,
    kind: row.kind,
    key: row.key,
    value,
    reason: typeof row.reason === 'string' ? row.reason : '',
    expiresAt: asText(row.expires_at),
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  }
}

/**
 * تجاوزات حساب بعينه — قراءة الأدمن المباشرة من الجدول (سياسة 0059
 * للأدمن فقط؛ المدرس لا يرى هذا الجدول إطلاقاً). null عند غياب 0059.
 */
export async function fetchAccountOverrides(
  teacherId: string,
): Promise<AccountOverrideRow[] | null> {
  const { data, error } = await db()
    .from('account_overrides')
    .select('id, kind, key, value, reason, expires_at, created_at')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingRelation(error)) return null
    throw error
  }
  return (data ?? [])
    .map(parseAccountOverrideRow)
    .filter((r): r is AccountOverrideRow => r !== null)
}

/** صفوف قائمة السماح — سياسات الأدمن في 0057؛ null عند غيابها */
export async function fetchAllowlist(): Promise<AllowlistEntry[] | null> {
  const { data, error } = await db()
    .from('teacher_allowlist')
    .select('id, email, phone, note, created_at')
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingRelation(error)) return null
    throw error
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    phone: row.phone,
    note: row.note,
    createdAt: row.created_at,
  }))
}

/**
 * إضافة صف سماح (بريد و/أو هاتف — واحد منهما على الأقل) — عبر RPC
 * 0063 الموثّق وحده: الكتابة المباشرة للجدول من العميل متوقفة منذ
 * 0063 حتى يكتب كل فعل سطر allowlist_added في سجل التدقيق. بلا
 * رجوع متسامح عمداً: غياب الدالة يفشل بخطأ مصمم لا بإضافة بلا أثر.
 */
export async function addAllowlistEntry(input: {
  email: string
  phone: string
  note: string
}): Promise<void> {
  const { error } = await db().rpc('platform_allowlist_add', {
    p_email: input.email.trim() === '' ? null : input.email.trim(),
    p_phone: input.phone.trim() === '' ? null : input.phone.trim(),
    ...(input.note.trim() !== '' ? { p_note: input.note.trim() } : {}),
  })
  if (error) throw error
}

/**
 * حذف صف سماح عبر RPC 0063 الموثّق وحده (سطر allowlist_removed) —
 * لا سياسة UPDATE في 0057، والتعديل حذف + إدراج كما كان.
 */
export async function removeAllowlistEntry(id: string): Promise<void> {
  const { error } = await db().rpc('platform_allowlist_remove', {
    p_allowlist_id: id,
  })
  if (error) throw error
}

/**
 * قلب قفل التسجيل عبر RPC 0063 الموثّق (سطر registration_open_changed)
 * — أول مسار موثّق لهذا الفعل؛ قبله كان القلب فعل service role /
 * SQL بلا أثر. بلا رجوع متسامح: غياب الدالة يفشل بخطأ مصمم.
 */
export async function setRegistrationOpen(open: boolean): Promise<void> {
  const { error } = await db().rpc('platform_set_registration_open', {
    p_open: open,
  })
  if (error) throw error
}

/** تحويل سطر تدقيق خام إلى شكل العميل — null عند التشوّه */
export function parseAuditLogRow(data: unknown): AuditLogRow | null {
  if (typeof data !== 'object' || data === null) return null
  const row = data as Record<string, unknown>
  if (typeof row.id !== 'string' || row.id === '') return null
  if (typeof row.action !== 'string' || row.action === '') return null
  if (typeof row.created_at !== 'string' || row.created_at === '') return null
  return {
    id: row.id,
    adminUserId: asText(row.admin_user_id),
    adminLabel: asText(row.admin_label),
    action: row.action,
    targetTeacherId: asText(row.target_teacher_id),
    targetLabel: asText(row.target_label),
    details:
      typeof row.details === 'object' && row.details !== null
        ? (row.details as Record<string, unknown>)
        : {},
    createdAt: row.created_at,
  }
}

/**
 * تحويل حمولة platform_audit_log_list الخام إلى صفحة — صف مشوّه
 * يُتخطى، والعدّ الإجمالي يُقرأ آمناً (غيابه = عدد الصفوف الظاهرة).
 */
export function parseAuditLogPage(data: unknown): AuditLogPage {
  const row = (data ?? {}) as Record<string, unknown>
  const rows = Array.isArray(row.rows)
    ? row.rows
        .map(parseAuditLogRow)
        .filter((r): r is AuditLogRow => r !== null)
    : []
  return {
    total: asCount(row.total) === 0 ? rows.length : asCount(row.total),
    rows,
  }
}

/**
 * قراءة سجل التدقيق — null عند غياب 0063 (قسم «قريباً»)؛ أي خطأ
 * آخر يصعد. المرشّحان اختياريان (حساب/فعل) والترقيم بالصفحة.
 */
export async function fetchAuditLog(input: {
  limit: number
  offset: number
  teacherId?: string | null
  action?: string | null
}): Promise<AuditLogPage | null> {
  const { data, error } = await db().rpc('platform_audit_log_list', {
    p_limit: input.limit,
    p_offset: input.offset,
    ...(input.teacherId ? { p_teacher_id: input.teacherId } : {}),
    ...(input.action ? { p_action: input.action } : {}),
  })
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  return parseAuditLogPage(data)
}

/**
 * قيمة registration_open الحالية — قراءة الأدمن من platform_settings
 * (0057) **للعرض فقط**: قلب القفل يبقى فعل service role / SQL حتى
 * خطوة لاحقة، فلا كتابة هنا إطلاقاً. null عند غياب الجدول/المفتاح.
 */
export async function fetchRegistrationOpen(): Promise<boolean | null> {
  const { data, error } = await db()
    .from('platform_settings')
    .select('value')
    .eq('key', 'registration_open')
    .maybeSingle()
  if (error) {
    if (isMissingRelation(error)) return null
    throw error
  }
  if (!data) return null
  return data.value === true
}
