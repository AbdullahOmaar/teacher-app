import { db } from '../../lib/supabase'
import { isMissingRpcFunction } from '../auth/api'
import { parsePlanLimits, type PlanLimits } from './subscription'

// ---------------------------------------------------------------------------
// التجاوزات الفردية لكل حساب (مهمة 18 — 0059): الحلّ الفعّال = حدود
// باقة الاشتراك ⊕ التجاوزات النشطة وحدها. المدرس يرى الأثر فقط عبر
// ‏effective_entitlements() — لا يقرأ جدول account_overrides ولا
// يعدّله إطلاقاً (جوهر توجيه مالك ٢). لا واجهة أدمن هنا (الخطوة 7)
// ولا إنفاذ حدود (الخطوة 5): هذا الملف قراءة + دالة دمج خالصة.
// حتى تُطبَّق 0059 عند بوابة تجميد فيز 2 ترجع الدالة null فيُخفى
// سطر التجاوز في البطاقة — لا قيم مخترعة.
// ---------------------------------------------------------------------------

/** مفتاح حد من مفاتيح الباقة */
export const LIMIT_KEYS = [
  'max_students',
  'max_messages_month',
  'max_storage_mb',
  'max_team_members',
  'max_ai_messages_month',
] as const

export type LimitKey = (typeof LIMIT_KEYS)[number]

/** مفتاح خاصية يضبطه التجاوز الفردي */
export const FEATURE_KEYS = [
  'whatsapp_auto',
  'ai_assistant',
  'team_accounts',
  'online_payments',
  'verification_required',
  'verification_channel_email',
  'verification_channel_whatsapp',
  'verification_channel_sms',
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]

/** قناة تأكيد (3A-905): المجموعة المفعّلة = اتحاد المفاتيح البوليانية */
export const VERIFICATION_CHANNELS = ['email', 'whatsapp', 'sms'] as const

export type VerificationChannel = (typeof VERIFICATION_CHANNELS)[number]

/** مفتاح الخاصية البوليانية المقابل لكل قناة تأكيد */
export const VERIFICATION_CHANNEL_KEYS: Record<
  VerificationChannel,
  FeatureKey
> = {
  email: 'verification_channel_email',
  whatsapp: 'verification_channel_whatsapp',
  sms: 'verification_channel_sms',
} as const

/** إعدادات التأكيد الفعّالة كما تشتق من خريطة الخصائص */
export interface VerificationSettings {
  /** التأكيد مطلوب (إلزامي عند التفعيل، بلا تخطٍ) — false = النظام مقفول */
  required: boolean
  /** القنوات المفعّلة — فارغة = لا قناة، أي النظام مقفول عملياً */
  channels: VerificationChannel[]
}

/**
 * اشتقاق خالص لإعدادات التأكيد من خريطة الخصائص الفعّالة: مفتاح
 * غائب أو false = مطفأ؛ قناة مفعّلة = مفتاحها البولياني true.
 * الافتراضي بلا أي تجاوز: required=false وقنوات فارغة (مقفول).
 */
export function resolveVerificationSettings(
  features: Partial<Record<FeatureKey, boolean>>,
): VerificationSettings {
  return {
    required: features.verification_required === true,
    channels: VERIFICATION_CHANNELS.filter(
      (channel) => features[VERIFICATION_CHANNEL_KEYS[channel]] === true,
    ),
  }
}

/** تجاوز واحد كما يصل لدالة الدمج الخالصة (من أي مصدر) */
export interface OverrideInput {
  kind: 'feature' | 'limit'
  key: string
  /** الخاصية: بوليان؛ الحد: عدد صحيح ≥ 0 أو null = بلا حد */
  value: boolean | number | null
  /** تاريخ الانتهاء — null = دائم؛ المنتهي يُتجاهل في الدمج */
  expiresAt: string | null
}

/** الاستحقاقات الفعّالة كما ترجع من effective_entitlements() */
export interface EffectiveEntitlements {
  teacherId: string
  planSlug: string
  status: 'active' | 'trial' | 'past_due' | 'cancelled'
  trialEndsAt: string | null
  limits: PlanLimits
  features: Partial<Record<FeatureKey, boolean>>
  /** إعدادات التأكيد المشتقة من الخصائص (3A-905) — افتراضياً مقفولة */
  verification: VerificationSettings
  overridesApplied: string[]
}

const ENTITLEMENT_STATUSES = ['active', 'trial', 'past_due', 'cancelled'] as const

function isLimitKey(key: string): key is LimitKey {
  return (LIMIT_KEYS as readonly string[]).includes(key)
}

function isFeatureKey(key: string): key is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(key)
}

/**
 * دمج خالص: حدود الباقة ⊕ التجاوزات النشطة وحدها — التجاوز يفوز
 * على الباقة دائماً، والمنتهي (expires_at ≤ الآن) يُتجاهل، والمفتاح
 * أو النوع غير المعروف يُتجاهل بلا كسر. المعامل now قابل للحقن
 * لاختبار الانتهاء حتمياً.
 */
export function mergeEntitlements(
  planLimits: PlanLimits,
  overrides: OverrideInput[],
  now: Date = new Date(),
): { limits: PlanLimits; features: Partial<Record<FeatureKey, boolean>>; applied: string[] } {
  const limits: PlanLimits = { ...planLimits }
  const features: Partial<Record<FeatureKey, boolean>> = {}
  const applied: string[] = []

  for (const o of overrides) {
    if (o.expiresAt !== null && new Date(o.expiresAt).getTime() <= now.getTime()) {
      continue
    }
    if (o.kind === 'limit' && isLimitKey(o.key)) {
      const v = o.value
      if (v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
        limits[
          o.key === 'max_students'
            ? 'maxStudents'
            : o.key === 'max_messages_month'
              ? 'maxMessagesMonth'
              : o.key === 'max_storage_mb'
                ? 'maxStorageMb'
                : o.key === 'max_team_members'
                  ? 'maxTeamMembers'
                  : 'maxAiMessagesMonth'
        ] = v === null ? null : Math.floor(v)
        applied.push(`limit:${o.key}`)
      }
    } else if (o.kind === 'feature' && isFeatureKey(o.key)) {
      if (typeof o.value === 'boolean') {
        features[o.key] = o.value
        applied.push(`feature:${o.key}`)
      }
    }
  }

  return { limits, features, applied }
}

function parseFeatures(data: unknown): Partial<Record<FeatureKey, boolean>> {
  const out: Partial<Record<FeatureKey, boolean>> = {}
  if (typeof data !== 'object' || data === null) return out
  const row = data as Record<string, unknown>
  for (const key of FEATURE_KEYS) {
    if (typeof row[key] === 'boolean') out[key] = row[key]
  }
  return out
}

/**
 * تحويل حمولة effective_entitlements الخام إلى شكل العميل — null عند
 * غياب الصف أو تشوّهه (فيُخفى سطر التجاوز)؛ حالة غير معروفة تسقط
 * إلى 'trial'.
 */
export function parseEffectiveEntitlements(
  data: unknown,
): EffectiveEntitlements | null {
  if (typeof data !== 'object' || data === null) return null
  const row = data as Record<string, unknown>
  if (typeof row.teacher_id !== 'string' || row.teacher_id === '') return null
  if (typeof row.plan_slug !== 'string' || row.plan_slug === '') return null
  const limits = parsePlanLimits(row.limits)
  if (!limits) return null
  const status =
    typeof row.status === 'string' &&
    (ENTITLEMENT_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as EffectiveEntitlements['status'])
      : 'trial'
  const applied = Array.isArray(row.overrides_applied)
    ? row.overrides_applied.filter(
        (x): x is string => typeof x === 'string',
      )
    : []
  const features = parseFeatures(row.features)
  return {
    teacherId: row.teacher_id,
    planSlug: row.plan_slug,
    status,
    trialEndsAt:
      typeof row.trial_ends_at === 'string' && row.trial_ends_at !== ''
        ? row.trial_ends_at
        : null,
    limits,
    features,
    verification: resolveVerificationSettings(features),
    overridesApplied: applied,
  }
}

/**
 * الاستحقاقات الفعّالة لمساحة العمل عبر RPC وحده. الدالة غائبة قبل
 * 0059 → null (سطر التجاوز يُخفى)؛ أي خطأ آخر يصعد كما هو.
 */
export async function fetchEffectiveEntitlements(
  teacherId: string,
): Promise<EffectiveEntitlements | null> {
  const { data, error } = await db().rpc('effective_entitlements', {
    p_teacher_id: teacherId,
  })
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  return parseEffectiveEntitlements(data)
}
