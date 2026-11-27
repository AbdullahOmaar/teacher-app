import { fetchEffectiveEntitlements } from '../platform-admin/entitlements'
import type { EffectiveEntitlements } from '../platform-admin/entitlements'

/**
 * حدّ أعضاء الفريق (T21 — 3A-896): الفحص المسبق الودود في العميل،
 * والحارس الصلب هو تريجر 0064 في القاعدة.
 *
 * • الحد الفعّال = max_team_members من effective_entitlements()
 *   (باقة ⊕ تجاوزات — 0059)؛ وكل صف في teacher_members يشغل
 *   مقعداً: فعّال + دعوة معلّقة + موقوف.
 * • غياب الاستحقاقات (0059 غير مطبّقة بعد) أو حدّ null = بلا
 *   حدّ معروف: نرجع null فيُخفى سطر الحد ويُتخطى الفحص المسبق —
 *   لا قيم مخترعة، والتريجر يبقى الضمان عند التطبيق.
 */
export interface TeamLimitState {
  /** المقاعد المشغولة الآن (كل صفوف الفريق) */
  used: number
  /** الحد الفعّال، أو null = بلا حد */
  limit: number | null
  /** true عندما بلغ الاستخدام الحدّ فعلاً */
  atLimit: boolean
}

/** حلّ الحدّ من حمولة الاستحقاقات + عدد المقاعد — خالصة وقابلة للاختبار. */
export function resolveTeamLimitState(
  entitlements: EffectiveEntitlements | null,
  used: number,
): TeamLimitState | null {
  if (!entitlements) return null
  const limit = entitlements.limits.maxTeamMembers ?? null
  if (limit == null) return { used, limit: null, atLimit: false }
  return { used, limit, atLimit: used >= limit }
}

/**
 * حالة حدّ الفريق لمساحة عمل: استحقاقاتها الفعّالة + عدد المقاعد
 * المشغولة. null = الحدّ غير معروف بعد (0059 غير مطبّقة / بلا حدّ
 * في الباقة) — المتصل يخفي سطر الحد ويتخطى الفحص المسبق.
 */
export async function fetchTeamLimitState(
  teacherId: string,
  used: number,
): Promise<TeamLimitState | null> {
  const entitlements = await fetchEffectiveEntitlements(teacherId)
  return resolveTeamLimitState(entitlements, used)
}
