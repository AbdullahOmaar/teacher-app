import { db } from '../../lib/supabase'
import { isMissingRpcFunction } from '../auth/api'

// ---------------------------------------------------------------------------
// الباقات والاشتراكات كبيانات (مهمة 19 — 0058): قراءة فقط من العميل.
// لا إنفاذ حدود هنا (الخطوة 5) ولا زر ترقية ولا دفع — بطاقة عرض
// «باقتك الحالية» في الإعدادات وحسب. السطح الوحيد هو RPC
// ‏my_subscription(p_teacher_id): لا يقرأ العميل جدولي plans /
// subscriptions مباشرة إطلاقاً (بلا سياسة قراءة للعميل بالتصميم).
// ملاحظة تشغيلية: حتى تُطبَّق 0058 عند بوابة التجميد تفشل الدالة
// (غير موجودة) — مصيرها المعلن: null فتُخفى البطاقة بأدب، بلا قيم
// وهمية ولا باقة افتراضية مخترعة.
// ---------------------------------------------------------------------------

/** حدود باقة — null في أي حد = بلا حد (غير محدود) */
export interface PlanLimits {
  maxStudents: number | null
  maxMessagesMonth: number | null
  maxStorageMb: number | null
  maxTeamMembers: number | null
  maxAiMessagesMonth: number | null
}

/** اشتراك مساحة عمل كما يرجع من my_subscription() */
export interface Subscription {
  teacherId: string
  planSlug: string
  planName: string
  isPilot: boolean
  status: 'active' | 'trial' | 'past_due' | 'cancelled'
  trialEndsAt: string | null
  limits: PlanLimits
}

const LIMIT_KEYS = [
  'max_students',
  'max_messages_month',
  'max_storage_mb',
  'max_team_members',
  'max_ai_messages_month',
] as const

type LimitKey = (typeof LIMIT_KEYS)[number]

/** قيمة حد آمنة من حمولة jsonb غير موثوقة الشكل: عدد صحيح ≥ 0 أو null */
function asLimit(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value)
  }
  return null
}

/**
 * تحويل حمولة limits الخام (jsonb بمفاتيح snake_case) إلى شكل العميل —
 * أي قيمة مشوّهة تسقط إلى null (بلا حد) بدل كسر البطاقة؛ مفاتيح
 * إضافية غير معروفة تُتجاهل.
 */
export function parsePlanLimits(data: unknown): PlanLimits | null {
  if (typeof data !== 'object' || data === null) return null
  const row = data as Record<string, unknown>
  const out = {} as Record<LimitKey, number | null>
  for (const key of LIMIT_KEYS) out[key] = asLimit(row[key])
  return {
    maxStudents: out.max_students,
    maxMessagesMonth: out.max_messages_month,
    maxStorageMb: out.max_storage_mb,
    maxTeamMembers: out.max_team_members,
    maxAiMessagesMonth: out.max_ai_messages_month,
  }
}

const SUBSCRIPTION_STATUSES = ['active', 'trial', 'past_due', 'cancelled'] as const

/**
 * تحويل حمولة my_subscription الخام إلى شكل العميل — null عند غياب
 * الصف أو تشوّهه (فتُخفى البطاقة)؛ حالة غير معروفة تسقط إلى 'trial'.
 */
export function parseSubscription(data: unknown): Subscription | null {
  if (typeof data !== 'object' || data === null) return null
  const row = data as Record<string, unknown>
  if (typeof row.teacher_id !== 'string' || row.teacher_id === '') return null
  if (typeof row.plan_slug !== 'string' || row.plan_slug === '') return null
  const status =
    typeof row.status === 'string' &&
    (SUBSCRIPTION_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as Subscription['status'])
      : 'trial'
  return {
    teacherId: row.teacher_id,
    planSlug: row.plan_slug,
    planName:
      typeof row.plan_name === 'string' && row.plan_name !== ''
        ? row.plan_name
        : row.plan_slug,
    isPilot: row.is_pilot === true,
    status,
    trialEndsAt:
      typeof row.trial_ends_at === 'string' && row.trial_ends_at !== ''
        ? row.trial_ends_at
        : null,
    limits: parsePlanLimits(row.limits) ?? {
      maxStudents: null,
      maxMessagesMonth: null,
      maxStorageMb: null,
      maxTeamMembers: null,
      maxAiMessagesMonth: null,
    },
  }
}

/**
 * اشتراك مساحة العمل الحالية عبر RPC وحده. الدالة غائبة قبل 0058 →
 * null (البطاقة تُخفى)؛ أي خطأ آخر يصعد كما هو.
 */
export async function fetchMySubscription(
  teacherId: string,
): Promise<Subscription | null> {
  const { data, error } = await db().rpc('my_subscription', {
    p_teacher_id: teacherId,
  })
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  return parseSubscription(data)
}
