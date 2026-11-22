import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import { waLink } from '../../lib/format'
import type {
  AssessmentType,
  PaymentMethod,
  ScoreSource,
  StudentAccessTokenRow,
  StudentRow,
} from '../../types/database'
import { generateRawToken, sha256Hex } from '../portal/api'
import {
  buildAttMeta,
  callPushRpc,
  createTokenLink,
  fetchPushStatus,
  fetchTokenRows,
  normalizeOverviewHead,
  num,
  revokeTokenRow,
  tokenStatusOf,
  type RawPortalBrand,
} from '../portal/tokenLifecycle'

// ===========================================================================
// بوابة الطالب — Phase 3 خطوة 5 (migration ‏0011).
//
// دخول الطالب نفسه برابط موقّع خاص به، منفصل تماماً عن رابط ولي الأمر
// (guardian_access_tokens) ورابط الامتحان (online_exam_tokens): جدول
// student_access_tokens يخزن SHA-256 hash فقط + انتهاء 30 يوماً + إلغاء
// صريح، والرابط يحمل التوكن وحده (/student-portal?t=...) والطالب
// يُعرَف من صف التوكن — كنموذج روابط الامتحانات.
//
// جهة المدرس (جلسة مصادقة — سياسة المالك فقط على جدول التوكنات):
// توليد/إعادة توليد (إعادة التوليد تُبطل النشط السابق للطالب نفسه)،
// قائمة الروابط، والإلغاء — من ملف الطالب (StudentPortalLinkSheet).
// الرمز الخام يظهر مرة واحدة عند التوليد ولا يُحفظ في أي مكان.
//
// جهة الطالب (بلا جلسة — anon key + RPC واحدة قراءة فقط):
// student_portal_overview_by_token تتحقق من الهاش وتعيد عرضاً محدود
// الحقول لأربعة محاور فقط: حصصه القادمة، واجباته وحالتها، درجاته
// ونتائج امتحاناته الإلكترونية، ومدفوعاته ورصيده — بالإضافة لهوية
// السنتر البيضاء. لا توجد أي دالة كتابة في هذه البوابة إطلاقاً، ولا
// وصول مباشر لأي جدول من anon، ولا بيانات ولي أمر أو زملاء أو مالية
// مدرس في الرد أبداً.
// ===========================================================================

/** صلاحية رابط بوابة الطالب بالأيام — نفس قرار بوابة ولي الأمر المعتمد */
export const STUDENT_PORTAL_TOKEN_TTL_DAYS = 30

const TOKEN_COLS =
  'id, teacher_id, student_id, expires_at, revoked_at, last_used_at, created_at'

// ---------------------------------------------------------------------------
// جهة المدرس — روابط الطالب
// ---------------------------------------------------------------------------

/** رابط بوابة الطالب العام: /student-portal?t=<rawToken> — الطالب يُعرَف بالتوكن وحده */
export function buildStudentPortalLink(origin: string, rawToken: string): string {
  return `${origin}/student-portal?t=${encodeURIComponent(rawToken)}`
}

export interface CreatedStudentPortalLink {
  /** الرابط الكامل بالرمز الخام — يُعرض للمدرس مرة واحدة ولا يُحفظ */
  link: string
  expiresAt: string
}

/**
 * توليد رابط بوابة طالب جديد: رمز عشوائي في العميل → هاش SHA-256 فقط
 * يُرسل ويُخزّن. أي روابط نشطة سابقة لنفس الطالب تُبطَل أولاً
 * (إعادة التوليد = إبطال القديم، كما في بوابة ولي الأمر والامتحانات).
 */
export async function createStudentPortalLink(
  teacherId: string,
  student: StudentRow,
): Promise<CreatedStudentPortalLink> {
  // دورة الحياة المشتركة (COD-3) — الفرق المحفوظ حرفياً هنا هو باني
  // رابط بوابة الطالب (التوكن وحده، بلا guardian_id).
  const { link, expiresAt } = await createTokenLink({
    table: 'student_access_tokens',
    teacherId,
    studentId: student.id,
    buildLink: (rawToken) => buildStudentPortalLink(window.location.origin, rawToken),
    generateRawToken,
    sha256Hex,
  })
  return { link, expiresAt }
}

/**
 * روابط طالب واحد (لملف الطالب) — بلا عمود الهاش.
 * (COD-3: الجلب/الإلغاء/الحالة عبر دورة الحياة المشتركة في tokenLifecycle)
 */
export async function fetchStudentPortalTokens(
  teacherId: string,
  studentId: string,
): Promise<StudentAccessTokenRow[]> {
  return fetchTokenRows<StudentAccessTokenRow>('student_access_tokens', TOKEN_COLS, teacherId, studentId)
}

/** إلغاء رابط (revoked_at) — لا حذف: سجل التوكن يبقى للتدقيق */
export async function revokeStudentPortalToken(
  teacherId: string,
  tokenId: string,
): Promise<void> {
  return revokeTokenRow('student_access_tokens', teacherId, tokenId)
}

/** حالة رابط للعرض: ملغي صراحة، أو منتهٍ بمرور وقته، أو نشط */
export function studentTokenStatus(
  t: StudentAccessTokenRow,
): 'active' | 'expired' | 'revoked' {
  return tokenStatusOf(t)
}

/**
 * رسالة واتساب إرسال رابط بوابة الطالب — تُرسل لرقم الطالب نفسه إن وُجد،
 * وإلا لرقم ولي أمره (الطالب يوصلها لابنه/بنته)؛ بلا أي رقم ترجع null.
 */
export function studentPortalLinkWaUrl(student: StudentRow, link: string): string | null {
  const phone = student.phone?.trim() || student.guardian_phone?.trim() || null
  const base = waLink(phone)
  if (!base) return null
  const msg = t('studentPortal.apiStudentLinkWa', {
    name: student.name,
    link,
    days: STUDENT_PORTAL_TOKEN_TTL_DAYS,
  })
  return `${base}?text=${encodeURIComponent(msg)}`
}

// ---------------------------------------------------------------------------
// جهة الطالب العامة (بلا جلسة — anon key + RPC مقيدة الحقول فقط)
// ---------------------------------------------------------------------------

export interface StudentPortalBrand {
  name: string | null
  logo_url: string | null
  accent: string | null
  /**
   * إظهار دُفّي عند مدرس السنتر (0029 — خطة الهوية P-10): من
   * teacher_settings.show_mascot داخل حمولة الـ RPC الخادمية نفسها؛
   * غيابه (RPC أقدم) = true بالافتراضي «يظهر» كما في 0028.
   */
  show_mascot: boolean
}

export interface StudentPortalGroup {
  name: string
  days: number[]
  start_time: string
  room: string | null
  links: string[]
}

export interface StudentPortalSession {
  date: string
  start_time: string
  duration_minutes: number
  kind: string // 'regular' | 'extra' | 'moved'
  group_name: string
  room: string | null
}

export interface StudentPortalHomework {
  date: string
  group_name: string
  status: string // 'p' | 'a' | 'l' | 'm'
  homework_done: boolean
}

export interface StudentPortalGrade {
  title: string
  type: AssessmentType
  date: string
  score: number
  max_score: number
  pass_score: number
  source: ScoreSource
}

export interface StudentPortalExamResult {
  title: string
  attempt_no: number
  score: number
  max_score: number
  pct: number
  submitted_at: string
  score_posted: boolean
}

export interface StudentPortalInvoice {
  period_month: string
  group_name: string
  total: number
  paid: number
  balance: number
  is_paid: boolean
}

export interface StudentPortalPayment {
  amount: number
  method: PaymentMethod
  paid_on: string
  receipt_no: string
}

/** عرض بوابة الطالب كما يعيده student_portal_build_overview حرفياً — حقول محدودة بالتصميم */
export interface StudentPortalOverview {
  student: { name: string; code: string; grade: string | null }
  brand: StudentPortalBrand
  attendance_rate: number | null
  balance: number
  groups: StudentPortalGroup[]
  upcoming_sessions: StudentPortalSession[]
  homework: StudentPortalHomework[]
  homework_summary: { marked: number; submitted: number }
  grades: StudentPortalGrade[]
  exam_results: StudentPortalExamResult[]
  invoices: StudentPortalInvoice[]
  recent_payments: StudentPortalPayment[]
}

/** قراءة بوابة الطالب بالرمز الخام عبر الـ RPC — المسار الآمن الوحيد للـ anon */
export async function fetchStudentPortalOverview(
  rawToken: string,
): Promise<StudentPortalOverview> {
  const { data, error } = await db().rpc('student_portal_overview_by_token', {
    p_token: rawToken,
  })
  if (error) throw error
  if (!data) throw new Error('invalid or expired token')
  const raw = data as unknown as StudentPortalOverview & {
    brand?: RawPortalBrand | null
    homework_summary?: { marked?: number | string; submitted?: number | string } | null
  }
  return {
    // رأس العرض المشترك (طالب/هوية/حضور/رصيد/مجموعات) — COD-3:
    // normalizeOverviewHead في tokenLifecycle.
    ...normalizeOverviewHead(raw),
    upcoming_sessions: (raw.upcoming_sessions ?? []).map((s) => ({
      ...s,
      duration_minutes: Number(s.duration_minutes) || 0,
    })),
    homework: raw.homework ?? [],
    homework_summary: {
      marked: num(raw.homework_summary?.marked),
      submitted: num(raw.homework_summary?.submitted),
    },
    grades: (raw.grades ?? []).map((g) => ({
      ...g,
      score: num(g.score),
      max_score: num(g.max_score),
      pass_score: num(g.pass_score),
    })),
    exam_results: (raw.exam_results ?? []).map((r) => ({
      ...r,
      attempt_no: Number(r.attempt_no) || 0,
      score: num(r.score),
      max_score: num(r.max_score),
      pct: num(r.pct),
    })),
    invoices: (raw.invoices ?? []).map((i) => ({
      ...i,
      total: num(i.total),
      paid: num(i.paid),
      balance: num(i.balance),
    })),
    recent_payments: (raw.recent_payments ?? []).map((p) => ({
      ...p,
      amount: num(p.amount),
    })),
  }
}

/** رسالة مهذبة للطالب من خطأ الـ RPC — بلا أي تفاصيل داخلية */
export function studentPortalErrorInfo(error: unknown): { title: string; hint: string } {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (msg.includes('invalid or expired')) {
    return {
      title: t('studentPortal.apiErrorExpiredTitle'),
      hint: t('studentPortal.apiErrorExpiredHint'),
    }
  }
  return {
    title: t('studentPortal.apiErrorInvalidTitle'),
    hint: t('studentPortal.apiErrorGenericHint'),
  }
}

// ---------------------------------------------------------------------------
// إشعارات Push الفورية من بوابة الطالب — Phase 4 خطوة 2 (migration ‏0014).
//
// نفس نموذج بوابة ولي الأمر: المتصفح يشترك عند خدمة الـ Push عبر
// lib/push، والحفظ/الإيقاف/الحالة عبر RPC بـ security definer تتحقق من
// توكن الطالب بـ student_portal_resolve_token وتربط الاشتراك بالطالب
// وبصف التوكن (portal_token_id). لا وصول مباشر لأي جدول من anon.
// ---------------------------------------------------------------------------

function pushErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (msg.includes('invalid or expired')) {
    return t('studentPortal.apiPushErrorInvalidLink')
  }
  if (msg.includes('invalid subscription')) {
    return t('studentPortal.apiPushErrorInvalidSub')
  }
  return t('studentPortal.apiPushErrorGeneric')
}

// (COD-3: استدعاءات الـ RPC الثلاثة عبر tokenLifecycle مع تمرير أسماء
// student_portal_push_* كما هي حرفياً؛ مترجم الأخطاء خاص بهذه البوابة.)

/** حالة اشتراك هذا المتصفح لبوابة الطالب (نشط؟) */
export async function fetchStudentPushStatus(
  rawToken: string,
  endpoint: string,
): Promise<boolean> {
  return fetchPushStatus(
    'student_portal_push_status',
    { p_token: rawToken, p_endpoint: endpoint },
    pushErrorMessage,
  )
}

/** تسجيل اشتراك Push هذا المتصفح للطالب صاحب الرابط */
export async function subscribeStudentPush(
  rawToken: string,
  sub: { endpoint: string; p256dh: string; auth: string; userAgent: string },
): Promise<void> {
  return callPushRpc(
    'student_portal_push_subscribe',
    {
      p_token: rawToken,
      p_endpoint: sub.endpoint,
      p_p256dh: sub.p256dh,
      p_auth: sub.auth,
      p_user_agent: sub.userAgent,
    },
    pushErrorMessage,
  )
}

/** إيقاف اشتراك Push هذا المتصفح من البوابة — يعطّل الصف خادمياً */
export async function unsubscribeStudentPush(rawToken: string, endpoint: string): Promise<void> {
  return callPushRpc(
    'student_portal_push_unsubscribe',
    { p_token: rawToken, p_endpoint: endpoint },
    pushErrorMessage,
  )
}

/** حالات الحضور في سجل الواجبات — الشارات مشتركة (buildAttMeta)، والتسميات بمفاتيح بوابة الطالب */
export const STUDENT_PORTAL_ATT_META: Record<string, { label: string; badge: string }> = buildAttMeta({
  p: t('studentPortal.apiAttPresent'),
  a: t('studentPortal.apiAttAbsent'),
  l: t('studentPortal.apiAttLate'),
  m: t('studentPortal.apiAttMakeup'),
})
