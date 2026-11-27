import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import type { Json } from '../../types/database'

// ---------------------------------------------------------------------------
// التحقق بخطوتين لأدمن المنصة (مهمة 23 — 0067): TOTP عبر Supabase Auth
// المدمج وحده — بلا مزود جديد وبلا تشفير مخترع وبلا تخزين أسرار عندنا.
// عوامل TOTP تعيش في auth.mfa_factors بإدارة GoTrue؛ هنا طبقة عميل
// نحيفة فقط: قراءة الحالة + تسجيل + تحدي/تحقق + إلغاء تسجيل + تدقيق
// (best-effort حتى تطبيق 0066 — انظر logMfaAudit).
// ---------------------------------------------------------------------------

/** مستوى ضمان المصادقة للجلسة الحالية كما يراه GoTrue */
export type MfaAal = 'aal1' | 'aal2'

/** عامل TOTP كما نحتاجه من listFactors — الحد الأدنى فقط */
export interface MfaFactorLike {
  id: string
  status: 'verified' | 'unverified'
}

/** حالة التحقق بخطوتين لحساب الأدمن الحالي */
export interface MfaStatus {
  /** عامل TOTP موثّق واحد على الأقل */
  enrolled: boolean
  /** معرّف العامل الموثّق (للتحدي) أو null */
  factorId: string | null
  /** معرّف عامل بدأ تسجيله ولم يُوثَّق (لاستئنافه أو إعادة إنشائه) */
  unverifiedFactorId: string | null
  /** مستوى ضمان الجلسة الحالية */
  aal: MfaAal | null
  /** صحيح عندما يرد Auth بأن MFA غير مفعّل في إعدادات المشروع */
  unavailable: boolean
}

/** أفعال تدقيق 2FA — نص حر في platform_audit_log (بلا enum مقيّد) */
export type MfaAuditAction =
  | 'mfa_enrolled'
  | 'mfa_challenge_failed'
  | 'mfa_unenrolled'

/** نتيجة تسجيل TOTP — رمز QR كـ data URI جاهز للعرض + السر للنسخ اليدوي */
export interface TotpEnrollment {
  factorId: string
  qrCode: string
  secret: string
  uri: string
}

/** كود TOTP: 6 أرقام بالضبط — فحص نقي للواجهة قبل أي نداء */
export function isTotpCode(value: string): boolean {
  return /^\d{6}$/.test(value)
}

/** رسالة خطأ Auth تعني أن MFA غير مفعّل في إعدادات المشروع */
export function isMfaUnavailableError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''
  return /mfa/i.test(message) && /disabled|not enabled|not supported/i.test(message)
}

function parseAal(value: unknown): MfaAal | null {
  return value === 'aal1' || value === 'aal2' ? value : null
}

/** تحويل حمولة listFactors الخام إلى عوامل TOTP بالحد الأدنى — أي شكل غريب يسقط إلى [] */
export function parseMfaFactors(data: unknown): MfaFactorLike[] {
  const row = (data ?? {}) as Record<string, unknown>
  const totp = row.totp
  if (!Array.isArray(totp)) return []
  const out: MfaFactorLike[] = []
  for (const item of totp) {
    const f = item as Record<string, unknown>
    if (typeof f.id !== 'string' || f.id.length === 0) continue
    if (f.status !== 'verified' && f.status !== 'unverified') continue
    out.push({ id: f.id, status: f.status })
  }
  return out
}

/**
 * قرار حالة 2FA النقي القابل للاختبار: عامل موثّق واحد يكفي
 * (أول موثّق هو عامل التحدي)؛ عامل غير موثّق يُحفظ لاستئنافه.
 */
export function resolveMfaStatus(
  totpFactors: MfaFactorLike[],
  aal: MfaAal | null,
): MfaStatus {
  const verified = totpFactors.find((f) => f.status === 'verified') ?? null
  const unverified =
    totpFactors.find((f) => f.status === 'unverified') ?? null
  return {
    enrolled: verified !== null,
    factorId: verified?.id ?? null,
    unverifiedFactorId: unverified?.id ?? null,
    aal,
    unavailable: false,
  }
}

/**
 * حالة 2FA الحالية: عوامل الحساب + مستوى ضمان الجلسة. خطأ «MFA غير
 * مفعّل» يرجع حالة unavailable بدل الرمي (لتعرض البوابة حالة مصممة)؛
 * أي خطأ آخر يُرمى (لتعرض البوابة إعادة المحاولة).
 */
export async function fetchMfaStatus(): Promise<MfaStatus> {
  const client = db()
  const { data: sessionData, error: sessionError } =
    await client.auth.getSession()
  const session = sessionData?.session ?? null
  if (sessionError) throw sessionError
  if (!session) throw new Error(t('platformAdmin.mfaSessionMissing'))
  const { data, error } = await client.auth.mfa.listFactors()
  if (error) {
    if (isMfaUnavailableError(error)) {
      return {
        enrolled: false,
        factorId: null,
        unverifiedFactorId: null,
        aal: null,
        unavailable: true,
      }
    }
    throw error
  }
  const aalResult = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalResult.error) throw aalResult.error
  return resolveMfaStatus(
    parseMfaFactors(data),
    parseAal(aalResult.data?.currentLevel ?? null),
  )
}

/**
 * بدء تسجيل TOTP: ينشئ عاملاً غير موثّق ويرجع رمز QR + السر.
 * السر يظهر مرة واحدة هنا — لا يُخزَّن عندنا إطلاقاً.
 */
export async function enrollTotp(): Promise<TotpEnrollment> {
  const { data, error } = await db().auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: t('platformAdmin.mfaFactorName'),
  })
  if (error) throw error
  const totp = data?.totp
  if (
    !data?.id ||
    !totp ||
    typeof totp.qr_code !== 'string' ||
    totp.qr_code.length === 0 ||
    typeof totp.secret !== 'string' ||
    totp.secret.length === 0 ||
    typeof totp.uri !== 'string'
  ) {
    throw new Error(t('platformAdmin.mfaEnrollBadResponse'))
  }
  return {
    factorId: data.id,
    qrCode: totp.qr_code,
    secret: totp.secret,
    uri: totp.uri,
  }
}

/**
 * تحدي + تحقق في خطوة واحدة (كافٍ لـ TOTP): الكود الصحيح يرفع
 * الجلسة إلى aal2 ويسجّل خروج باقي الجلسات (سلوك GoTrue الموثق).
 */
export async function verifyTotpCode(
  factorId: string,
  code: string,
): Promise<void> {
  const { error } = await db().auth.mfa.challengeAndVerify({
    factorId,
    code,
  })
  if (error) throw error
}

/** إلغاء تسجيل عامل TOTP — يتطلب جلسة aal2 (سلوك GoTrue) */
export async function unenrollTotp(factorId: string): Promise<void> {
  const { error } = await db().auth.mfa.unenroll({ factorId })
  if (error) throw error
}

/**
 * تدقيق 2FA عبر log_platform_audit() (0066) — best-effort عمداً:
 * الدالة غائبة حتى تطبيق 0066 عند بوابة التجميد، والتدقيق لا يجوز
 * أن يكسر مسار مصادقة ناجحاً أصلاً. الفشل يُبتلع بمصير موثق هنا
 * (لا إعادة رمي ولا رسالة للمستخدم)؛ نتيجة المصادقة نفسها هي
 * مصدر الحقيقة، والسجل يلحق بها عند توفره.
 */
export async function logMfaAudit(
  action: MfaAuditAction,
  details?: Record<string, Json>,
): Promise<void> {
  try {
    const { error } = await db().rpc('log_platform_audit', {
      p_action: action,
      p_target_teacher_id: null,
      p_details: details ?? {},
    })
    if (error) throw error
  } catch {
    // مقصود: التدقيق best-effort حتى 0066 — انظر التعليق أعلاه.
  }
}
