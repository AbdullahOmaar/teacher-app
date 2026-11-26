import { db } from '../../lib/supabase'
import { isMissingRpcFunction } from '../auth/api'

// ---------------------------------------------------------------------------
// عدّادات الاستخدام وإنفاذ الحدود (مهمة 19 — 0062، الخطوة 5 من خطة
// الأدمن): قراءة الملخص عبر RPC ‏usage_summary وحده + فحص مفتاح واحد
// عبر ‏check_usage_limit — لا قراءة مباشرة لجدول usage_counters
// إطلاقاً (بلا سياسة قراءة للعميل بالتصميم: المالك يرى ملخصه عبر
// الدالة فقط). حتى تُطبَّق 0062 عند بوابة تجميد فيز 2 ترجع الدوال
// ‏null (الملخص يُخفى، والفحص المسبق يُتخطى) — والإنفاذ الخادمي
// (تريجر الطلاب) لا يوجد أصلاً قبل التطبيق. لا قيم مخترعة.
// ---------------------------------------------------------------------------

/** مفتاح حد من مفاتيح الباقة — نفس مفاتيح 0058/0059 */
export const USAGE_KEYS = [
  'max_students',
  'max_messages_month',
  'max_storage_mb',
  'max_team_members',
  'max_ai_messages_month',
] as const

export type UsageKey = (typeof USAGE_KEYS)[number]

/** استخدام مفتاح واحد: حد/مستخدم/متبقٍ — null في الحد = بلا حد */
export interface UsageEntry {
  limit: number | null
  used: number
  remaining: number | null
  atLimit: boolean
}

/** ملخص استخدام مساحة عمل كما يرجع من usage_summary() */
export interface UsageSummary {
  teacherId: string
  /** أول يوم في شهر العدّ (ISO date) */
  periodMonth: string
  students: UsageEntry
  messagesMonth: UsageEntry
  storageMb: UsageEntry
  teamMembers: UsageEntry
  aiMessagesMonth: UsageEntry
}

/** نتيجة فحص مفتاح واحد كما ترجع من check_usage_limit() */
export interface UsageCheck {
  key: UsageKey
  allowed: boolean
  limit: number | null
  used: number
  remaining: number | null
}

function asNonNegativeInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value)
  }
  return 0
}

function asLimit(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value)
  }
  return null
}

/**
 * تحويل مدخل استخدام خام إلى شكل العميل — أي قيمة مشوّهة تسقط إلى
 * ‏used=0 وlimit=null (بلا حد) بدل كسر العرض؛ at_limit تُشتق من
 * الحد والاستخدام لا تُؤخذ من الحمولة.
 */
export function parseUsageEntry(data: unknown): UsageEntry {
  if (typeof data !== 'object' || data === null) {
    return { limit: null, used: 0, remaining: null, atLimit: false }
  }
  const row = data as Record<string, unknown>
  const limit = asLimit(row.limit)
  const used = asNonNegativeInt(row.used)
  return {
    limit,
    used,
    remaining: limit === null ? null : Math.max(limit - used, 0),
    atLimit: limit !== null && used >= limit,
  }
}

const USAGE_FIELDS = [
  'students',
  'messages_month',
  'storage_mb',
  'team_members',
  'ai_messages_month',
] as const

/**
 * تحويل حمولة usage_summary الخام إلى شكل العميل — null عند غياب
 * الصف أو تشوّهه (فيُخفى العرض)؛ المدخلات الغائبة تسقط إلى بلا حد.
 */
export function parseUsageSummary(data: unknown): UsageSummary | null {
  if (typeof data !== 'object' || data === null) return null
  const row = data as Record<string, unknown>
  if (typeof row.teacher_id !== 'string' || row.teacher_id === '') return null
  const entries: Record<(typeof USAGE_FIELDS)[number], UsageEntry> = {
    students: parseUsageEntry(row.students),
    messages_month: parseUsageEntry(row.messages_month),
    storage_mb: parseUsageEntry(row.storage_mb),
    team_members: parseUsageEntry(row.team_members),
    ai_messages_month: parseUsageEntry(row.ai_messages_month),
  }
  return {
    teacherId: row.teacher_id,
    periodMonth:
      typeof row.period_month === 'string' && row.period_month !== ''
        ? row.period_month
        : '',
    students: entries.students,
    messagesMonth: entries.messages_month,
    storageMb: entries.storage_mb,
    teamMembers: entries.team_members,
    aiMessagesMonth: entries.ai_messages_month,
  }
}

/** مدخل مفتاح الاستخدام المقابل لكل مفتاح حد */
export function usageEntryFor(
  summary: UsageSummary,
  key: UsageKey,
): UsageEntry {
  switch (key) {
    case 'max_students':
      return summary.students
    case 'max_messages_month':
      return summary.messagesMonth
    case 'max_storage_mb':
      return summary.storageMb
    case 'max_team_members':
      return summary.teamMembers
    case 'max_ai_messages_month':
      return summary.aiMessagesMonth
  }
}

function isUsageKey(key: string): key is UsageKey {
  return (USAGE_KEYS as readonly string[]).includes(key)
}

export function parseUsageCheck(data: unknown): UsageCheck | null {
  if (typeof data !== 'object' || data === null) return null
  const row = data as Record<string, unknown>
  if (typeof row.key !== 'string' || !isUsageKey(row.key)) return null
  const entry = parseUsageEntry(row)
  return {
    key: row.key,
    // قيمة allowed من الخادم أولاً؛ وإن غابت تُشتق من الحد والاستخدام.
    allowed:
      typeof row.allowed === 'boolean' ? row.allowed : !entry.atLimit,
    limit: entry.limit,
    used: entry.used,
    remaining: entry.remaining,
  }
}

/**
 * ملخص استخدام مساحة العمل عبر RPC وحده. الدالة غائبة قبل 0062 →
 * ‏null (العرض يُخفى)؛ أي خطأ آخر يصعد كما هو.
 */
export async function fetchUsageSummary(
  teacherId: string,
): Promise<UsageSummary | null> {
  const { data, error } = await db().rpc('usage_summary', {
    p_teacher_id: teacherId,
  })
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  return parseUsageSummary(data)
}

/**
 * فحص مفتاح واحد قبل الكتابة. الدالة غائبة قبل 0062 → ‏null
 * (الفحص المسبق يُتخطى — والتريجر الخادمي يحرس بعد التطبيق)؛
 * أي خطأ آخر يصعد كما هو.
 */
export async function checkUsageLimit(
  teacherId: string,
  key: UsageKey,
): Promise<UsageCheck | null> {
  const { data, error } = await db().rpc('check_usage_limit', {
    p_teacher_id: teacherId,
    p_key: key,
  })
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  return parseUsageCheck(data)
}
