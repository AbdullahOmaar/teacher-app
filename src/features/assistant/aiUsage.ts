import { db } from '../../lib/supabase'
import { isMissingRpcFunction } from '../auth/api'

// ---------------------------------------------------------------------------
// استخدام الذكاء هذا الشهر (مهمة 22 — حد 0062 ‏max_ai_messages_month):
// قراءة مدخل واحد فقط من RPC ‏usage_summary. حتى تُطبَّق 0062 عند بوابة
// تجميد فيز 2 ترجع الدالة null (السطر يُخفى — بلا قيم مخترعة)؛ أي خطأ
// آخر يصعد كما هو. قارئ صغير مستقل عن usage.ts (خطوة 5) لأن ذاك الملف
// لسه مش في main — يندمجان عند هبوط #45.
// ---------------------------------------------------------------------------

/** استخدام رسائل الذكاء: حد/مستخدم — null في الحد = بلا حد */
export interface AiUsage {
  limit: number | null
  used: number
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
 * ‏used=0 وlimit=null (بلا حد) بدل كسر العرض.
 */
export function parseAiUsageEntry(data: unknown): AiUsage {
  if (typeof data !== 'object' || data === null) return { limit: null, used: 0 }
  const row = data as Record<string, unknown>
  return { limit: asLimit(row.limit), used: asNonNegativeInt(row.used) }
}

/**
 * مدخل رسائل الذكاء من ملخص الاستخدام. الدالة غائبة قبل 0062 →
 * ‏null (السطر يُخفى)؛ أي خطأ آخر يصعد كما هو.
 */
export async function fetchAiUsage(teacherId: string): Promise<AiUsage | null> {
  const { data, error } = await db().rpc('usage_summary', {
    p_teacher_id: teacherId,
  })
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  if (typeof data !== 'object' || data === null) return null
  return parseAiUsageEntry((data as Record<string, unknown>).ai_messages_month)
}
