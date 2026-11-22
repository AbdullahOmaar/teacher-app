import { db } from '../../lib/supabase'
import { brandLogoUrl, isValidAccent } from '../../lib/brand'
import type { Database } from '../../types/database'

// ===========================================================================
// دورة حياة توكنات الروابط الموقّعة — وحدة مشتركة بين بوابة ولي الأمر
// (portal/api.ts) وبوابة الطالب (student-portal/api.ts) — COD-3 / 3A-362.
//
// البوابتان تتشاركان الشكل نفسه حرفياً: رمز خام ← هاش SHA-256 ← انتهاء
// 30 يوماً ← إبطال النشط السابق ← إدراج؛ جلب/إلغاء بنفس الاستعلامات؛
// قراءة بالرمز عبر RPC؛ وPush بنفس الشكل مع اختلاف أسماء الـ RPC فقط.
// الفروق الحقيقية (اسم الجدول، أعمدة الإدراج الزائدة مثل guardian_id،
// باني الرابط، أسماء RPC) تُمرَّر هنا كبرمترات — صفر تغيير سلوكي:
// أسماء الجداول والأعمدة وقيم الانتهاء وأسماء الـ RPC وسلاسل الروابط
// الناتجة تبقى مطابقة بايتاً لما كانت عليه في كل بوابة.
//
// generateRawToken/sha256Hex تبقيان في portal/api.ts كما هما (مصدرهما
// الأصلي) وتُمرَّران هنا كدوال محقونة حتى لا تنشأ تبعية دائرية.
// ===========================================================================

/** صلاحية رابط البوابة بالأيام — قرار المستخدم المعتمد عند الإطلاق (مشترك) */
export const TOKEN_TTL_DAYS = 30

/** جداول التوكنات القابلة للتوحيد هنا — توكنات الامتحانات/التسجيل خارج النطاق */
export type TokenTable = 'guardian_access_tokens' | 'student_access_tokens'

/** صف توكن بالحد الأدنى المشترك بين الجدولين (للعرض وحساب الحالة) */
export interface TokenRowLike {
  revoked_at: string | null
  expires_at: string
}

/** حالة رابط للعرض: ملغي صراحة، أو منتهٍ بمرور وقته، أو نشط */
export function tokenStatusOf(row: TokenRowLike): 'active' | 'expired' | 'revoked' {
  if (row.revoked_at) return 'revoked'
  if (new Date(row.expires_at).getTime() <= Date.now()) return 'expired'
  return 'active'
}

/** تحويل قيمة رقمية قادمة من RPC (نص أو رقم) لرقم آمن — 0 عند الفساد */
export function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------------------
// تطبيع الهوية البيضاء — كانت كتلة متطابقة بايتاً داخل
// fetchPortalOverview وfetchStudentPortalOverview.
// ---------------------------------------------------------------------------

/** قسم brand الخام كما يأتي داخل حمولة الـ RPC (كل الحقول اختيارية) */
export interface RawPortalBrand {
  name?: string | null
  teacher_name?: string | null
  logo_path?: string | null
  accent?: string | null
  show_mascot?: boolean | null
}

/** الهوية البيضاء بعد التطبيع — شكل موحّد للبوابتين */
export interface NormalizedPortalBrand {
  /** اسم السنتر التجاري، وإلا اسم المدرس، وإلا null (العنوان الافتراضي) */
  name: string | null
  /** رابط الشعار العام أو null */
  logo_url: string | null
  /** لون اللهجة #RRGGBB (حروف صغيرة) أو null */
  accent: string | null
  /**
   * إظهار دُفّي عند مدرس السنتر (0029): لا يُخفى إلا بقيمة false
   * صريحة — الغياب/القيم الشاذة تسقط للافتراضي true كما في 0028.
   */
  show_mascot: boolean
}

/**
 * تطبيع قسم الهوية البيضاء من حمولة الـ RPC: الاسم التجاري يتقدم اسم
 * المدرس، والشعار يُبنى رابطه العام من مساره، واللهجة تُمرَّر بعد
 * التحقق من صيغتها — غياب قسم brand كله (نسخة RPC أقدم) يسقط
 * للافتراضي بلا كسر.
 */
export function normalizePortalBrand(raw: RawPortalBrand | null | undefined): NormalizedPortalBrand {
  return {
    name: raw?.name?.trim() || raw?.teacher_name?.trim() || null,
    logo_url: brandLogoUrl(raw?.logo_path),
    accent: isValidAccent(raw?.accent) ? raw.accent.toLowerCase() : null,
    show_mascot: raw?.show_mascot !== false,
  }
}

// ---------------------------------------------------------------------------
// جهة المدرس — إنشاء/جلب/إلغاء
// ---------------------------------------------------------------------------

export interface CreateTokenLinkDeps {
  /** مولّد الرمز الخام وهاشّه — محقونتان من portal/api.ts (مصدرهما الأصلي) */
  generateRawToken: () => string
  sha256Hex: (text: string) => Promise<string>
}

export interface CreateTokenLinkInput extends CreateTokenLinkDeps {
  table: TokenTable
  teacherId: string
  studentId: string
  /** أعمدة إدراج إضافية خاصة بالبوابة (مثل guardian_id لبوابة ولي الأمر) */
  extraInsert?: Record<string, string>
  /** باني الرابط العام الخاص بالبوابة — يستلم الرمز الخام ويعيد الرابط الكامل */
  buildLink: (rawToken: string) => string
}

/**
 * توليد رابط جديد: رمز عشوائي في العميل → هاش SHA-256 فقط يُرسل
 * ويُخزّن، وأي روابط نشطة سابقة لنفس الطالب تُبطَل أولاً (إعادة
 * التوليد = إبطال القديم). يعيد الرابط الكامل وتاريخ الانتهاء.
 */
export async function createTokenLink(input: CreateTokenLinkInput): Promise<{ link: string; expiresAt: string }> {
  const supa = db()
  const rawToken = input.generateRawToken()
  const tokenHash = await input.sha256Hex(rawToken)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { error: revokeErr } = await supa
    .from(input.table)
    .update({ revoked_at: new Date().toISOString() })
    .eq('teacher_id', input.teacherId)
    .eq('student_id', input.studentId)
    .is('revoked_at', null)
  if (revokeErr) throw revokeErr

  const { error: insErr } = await supa.from(input.table).insert({
    teacher_id: input.teacherId,
    student_id: input.studentId,
    ...(input.extraInsert ?? {}),
    token_hash: tokenHash,
    expires_at: expiresAt,
  })
  if (insErr) throw insErr

  return { link: input.buildLink(rawToken), expiresAt }
}

/** جلب صفوف توكنات (طالب واحد عند تمرير studentId، وإلا كل روابط المدرس) — بلا عمود الهاش */
export async function fetchTokenRows<Row>(
  table: TokenTable,
  cols: string,
  teacherId: string,
  studentId?: string,
): Promise<Row[]> {
  let query = db().from(table).select(cols).eq('teacher_id', teacherId)
  if (studentId !== undefined) query = query.eq('student_id', studentId)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Row[]
}

/** إلغاء رابط (revoked_at) — لا حذف: سجل التوكن يبقى للتدقيق */
export async function revokeTokenRow(table: TokenTable, teacherId: string, tokenId: string): Promise<void> {
  const { error } = await db()
    .from(table)
    .update({ revoked_at: new Date().toISOString() })
    .eq('teacher_id', teacherId)
    .eq('id', tokenId)
    .is('revoked_at', null)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Push — نفس الشكل في البوابتين، أسماء الـ RPC تُمرَّر كبرمترات
// (portal_push_* مقابل student_portal_push_*).
// ---------------------------------------------------------------------------

export type PushRpcName =
  | 'portal_push_status'
  | 'portal_push_subscribe'
  | 'portal_push_unsubscribe'
  | 'student_portal_push_status'
  | 'student_portal_push_subscribe'
  | 'student_portal_push_unsubscribe'

/** وسيطات RPC باسمها المولّد من المخطط الحي (COD-1) — كل بوابة تُدقَّق وسيطاتها */
type PushRpcArgs<N extends PushRpcName> = Database['public']['Functions'][N]['Args']

/** حالة اشتراك Push لهذا المتصفح (نشط؟) عبر RPC الحالة الخاصة بالبوابة */
export async function fetchPushStatus<N extends PushRpcName>(
  rpc: N,
  params: PushRpcArgs<N>,
  mapError: (error: unknown) => string,
): Promise<boolean> {
  const { data, error } = await db().rpc(rpc, params)
  if (error) throw new Error(mapError(error))
  return Boolean((data as unknown as { subscribed?: boolean })?.subscribed)
}

/** تسجيل/إيقاف اشتراك Push عبر RPC البوابة — أي خطأ يُترجم بمترجم البوابة */
export async function callPushRpc<N extends PushRpcName>(
  rpc: N,
  params: PushRpcArgs<N>,
  mapError: (error: unknown) => string,
): Promise<void> {
  const { error } = await db().rpc(rpc, params)
  if (error) throw new Error(mapError(error))
}

// ---------------------------------------------------------------------------
// شارات الحضور — الشارات (badge) متطابقة بايتاً في البوابتين، ومفاتيح
// i18n (ومِن ثم التسميات المترجمة) تختلف فتُمرَّر كمفاتيح/تسميات.
// ---------------------------------------------------------------------------

export interface AttMetaLabels {
  p: string
  a: string
  l: string
  m: string
}

/** بناء خريطة شارات الحضور الأربع من تسميات البوابة المستدعية */
export function buildAttMeta(labels: AttMetaLabels): Record<string, { label: string; badge: string }> {
  return {
    p: { label: labels.p, badge: 'bg-ok/10 text-ok border-ok/30' },
    a: { label: labels.a, badge: 'bg-bad/10 text-bad border-bad/30' },
    l: { label: labels.l, badge: 'bg-warn/15 text-warn border-warn/40' },
    m: { label: labels.m, badge: 'bg-soft text-primary border-primary/30' },
  }
}

// ---------------------------------------------------------------------------
// رأس تطبيع العرض المشترك بين fetchPortalOverview و
// fetchStudentPortalOverview: الطالب + الهوية + نسبة الحضور + الرصيد +
// المجموعات — متطابقة بايتاً في البوابتين، وباقي أقسام العرض خاصة بكل
// بوابة فتبقى في مكانها.
// ---------------------------------------------------------------------------

export interface PortalGroupLike {
  name: string
  days: number[]
  start_time: string
  room: string | null
  links: string[]
}

export interface OverviewHeadRaw {
  student: { name: string; code: string; grade: string | null }
  brand?: RawPortalBrand | null
  attendance_rate?: unknown
  balance?: unknown
  groups?: PortalGroupLike[] | null
}

export function normalizeOverviewHead(raw: OverviewHeadRaw) {
  return {
    student: raw.student,
    brand: normalizePortalBrand(raw.brand),
    attendance_rate: raw.attendance_rate == null ? null : num(raw.attendance_rate),
    balance: num(raw.balance),
    groups: (raw.groups ?? []).map((g) => ({
      name: g.name,
      days: (g.days ?? []).map((d) => Number(d)),
      start_time: g.start_time,
      room: g.room ?? null,
      links: g.links ?? [],
    })),
  }
}
