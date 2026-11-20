import { supabase } from '../../lib/supabase'
import { brandLogoUrl, isValidAccent } from '../../lib/brand'
import { waLink } from '../../lib/format'
import type {
  AssessmentType,
  PaymentMethod,
  ScoreSource,
  StudentAccessTokenRow,
  StudentRow,
} from '../../types/database'
import { generateRawToken, sha256Hex } from '../portal/api'

function db() {
  if (!supabase) throw new Error('Supabase غير مربوط — راجع إعدادات .env')
  return supabase
}

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
  const supa = db()
  const rawToken = generateRawToken()
  const tokenHash = await sha256Hex(rawToken)
  const expiresAt = new Date(
    Date.now() + STUDENT_PORTAL_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { error: revokeErr } = await supa
    .from('student_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('teacher_id', teacherId)
    .eq('student_id', student.id)
    .is('revoked_at', null)
  if (revokeErr) throw revokeErr

  const { error: insErr } = await supa.from('student_access_tokens').insert({
    teacher_id: teacherId,
    student_id: student.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  })
  if (insErr) throw insErr

  return { link: buildStudentPortalLink(window.location.origin, rawToken), expiresAt }
}

/** روابط طالب واحد (لملف الطالب) — بلا عمود الهاش */
export async function fetchStudentPortalTokens(
  teacherId: string,
  studentId: string,
): Promise<StudentAccessTokenRow[]> {
  const { data, error } = await db()
    .from('student_access_tokens')
    .select(TOKEN_COLS)
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as StudentAccessTokenRow[]
}

/** إلغاء رابط (revoked_at) — لا حذف: سجل التوكن يبقى للتدقيق */
export async function revokeStudentPortalToken(
  teacherId: string,
  tokenId: string,
): Promise<void> {
  const { error } = await db()
    .from('student_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('teacher_id', teacherId)
    .eq('id', tokenId)
    .is('revoked_at', null)
  if (error) throw error
}

/** حالة رابط للعرض: ملغي صراحة، أو منتهٍ بمرور وقته، أو نشط */
export function studentTokenStatus(
  t: StudentAccessTokenRow,
): 'active' | 'expired' | 'revoked' {
  if (t.revoked_at) return 'revoked'
  if (new Date(t.expires_at).getTime() <= Date.now()) return 'expired'
  return 'active'
}

/**
 * رسالة واتساب إرسال رابط بوابة الطالب — تُرسل لرقم الطالب نفسه إن وُجد،
 * وإلا لرقم ولي أمره (الطالب يوصلها لابنه/بنته)؛ بلا أي رقم ترجع null.
 */
export function studentPortalLinkWaUrl(student: StudentRow, link: string): string | null {
  const phone = student.phone?.trim() || student.guardian_phone?.trim() || null
  const base = waLink(phone)
  if (!base) return null
  const msg =
    `أهلاً ${student.name}، ده رابط بوابة الطالب الخاصة بيك ` +
    `(حصصك الجاية وواجباتك ودرجاتك ومدفوعاتك): ${link} — الرابط صالح لمدة ${STUDENT_PORTAL_TOKEN_TTL_DAYS} يوم.`
  return `${base}?text=${encodeURIComponent(msg)}`
}

// ---------------------------------------------------------------------------
// جهة الطالب العامة (بلا جلسة — anon key + RPC مقيدة الحقول فقط)
// ---------------------------------------------------------------------------

export interface StudentPortalBrand {
  name: string | null
  logo_url: string | null
  accent: string | null
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

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(n) ? n : 0
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
    brand?: {
      name?: string | null
      teacher_name?: string | null
      logo_path?: string | null
      accent?: string | null
    } | null
    homework_summary?: { marked?: number | string; submitted?: number | string } | null
  }
  return {
    student: raw.student,
    // الهوية البيضاء: الاسم التجاري يتقدم اسم المدرس، والشعار يُبنى رابطه
    // العام من مساره، واللهجة تُمرَّر بعد التحقق من صيغتها.
    brand: {
      name: raw.brand?.name?.trim() || raw.brand?.teacher_name?.trim() || null,
      logo_url: brandLogoUrl(raw.brand?.logo_path),
      accent: isValidAccent(raw.brand?.accent) ? raw.brand.accent.toLowerCase() : null,
    },
    attendance_rate: raw.attendance_rate == null ? null : num(raw.attendance_rate),
    balance: num(raw.balance),
    groups: (raw.groups ?? []).map((g) => ({
      name: g.name,
      days: (g.days ?? []).map((d) => Number(d)),
      start_time: g.start_time,
      room: g.room ?? null,
      links: g.links ?? [],
    })),
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
      title: 'الرابط منتهي أو ملغي',
      hint: 'رابط بوابتك انتهت صلاحيته (30 يوم) أو المدرس ألغاه. اطلب من المدرس رابط جديد وهيوصلك على واتساب.',
    }
  }
  return {
    title: 'الرابط غير صالح',
    hint: 'ماقدرناش نفتح البوابة بالرابط ده. تأكد إنك فتحته زي ما وصلك بالظبط، أو اطلب من المدرس رابط جديد.',
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
    return 'رابط بوابتك منتهي أو مش صالح — اطلب من المدرس رابط جديد قبل تفعيل الإشعارات.'
  }
  if (msg.includes('invalid subscription')) {
    return 'المتصفح رجّع اشتراكاً ناقصاً — حدّث الصفحة وحاول تاني.'
  }
  return 'ماقدرناش نغيّر حالة الإشعارات — اتأكد من النت وحاول تاني.'
}

/** حالة اشتراك هذا المتصفح لبوابة الطالب (نشط؟) */
export async function fetchStudentPushStatus(
  rawToken: string,
  endpoint: string,
): Promise<boolean> {
  const { data, error } = await db().rpc('student_portal_push_status', {
    p_token: rawToken,
    p_endpoint: endpoint,
  })
  if (error) throw new Error(pushErrorMessage(error))
  return Boolean((data as unknown as { subscribed?: boolean })?.subscribed)
}

/** تسجيل اشتراك Push هذا المتصفح للطالب صاحب الرابط */
export async function subscribeStudentPush(
  rawToken: string,
  sub: { endpoint: string; p256dh: string; auth: string; userAgent: string },
): Promise<void> {
  const { error } = await db().rpc('student_portal_push_subscribe', {
    p_token: rawToken,
    p_endpoint: sub.endpoint,
    p_p256dh: sub.p256dh,
    p_auth: sub.auth,
    p_user_agent: sub.userAgent,
  })
  if (error) throw new Error(pushErrorMessage(error))
}

/** إيقاف اشتراك Push هذا المتصفح من البوابة — يعطّل الصف خادمياً */
export async function unsubscribeStudentPush(rawToken: string, endpoint: string): Promise<void> {
  const { error } = await db().rpc('student_portal_push_unsubscribe', {
    p_token: rawToken,
    p_endpoint: endpoint,
  })
  if (error) throw new Error(pushErrorMessage(error))
}

/** حالات الحضور في سجل الواجبات — نفس شارات بوابة ولي الأمر */
export const STUDENT_PORTAL_ATT_META: Record<string, { label: string; badge: string }> = {
  p: { label: 'حاضر', badge: 'bg-ok/10 text-ok border-ok/30' },
  a: { label: 'غائب', badge: 'bg-bad/10 text-bad border-bad/30' },
  l: { label: 'متأخر', badge: 'bg-warn/15 text-warn border-warn/40' },
  m: { label: 'تعويضية', badge: 'bg-soft text-primary border-primary/30' },
}
