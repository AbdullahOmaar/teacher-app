import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import { waLink } from '../../lib/format'
import {
  GUARDIAN_SECTION_KEYS,
  buildAttMeta,
  callPushRpc,
  createTokenLink,
  fetchPushStatus,
  fetchTokenRows,
  normalizeOverviewHead,
  normalizeSections,
  num,
  revokeTokenRow,
  tokenStatusOf,
  type GuardianSectionKey,
  type RawPortalBrand,
} from './tokenLifecycle'
import type {
  GroupSlot,
  GuardianAccessTokenRow,
  GuardianRow,
  PaymentMethod,
  PaymentProofStatus,
  StudentRow,
} from '../../types/database'

// ---------------------------------------------------------------------------
// بوابة ولي الأمر بالروابط الموقّعة — الخطوة 9 (المواصفات §3.17،
// وخطة Phase 1 خطوة 9، وقرار المستخدم المعتمد: رابط موقّع يُرسل
// بالواتساب، صلاحية 30 يوماً، يُخزّن hash فقط).
//
// نموذج المخطط (0001_init.sql) كما هو حرفياً:
// • guardians + guardian_students: ولي الأمر يُعرَّف برقمه
//   (unique teacher_id+phone) ويُربط بالطالب.
// • guardian_access_tokens: القاعدة تخزن token_hash فقط
//   (SHA-256 hex للرمز العشوائي) + expires_at + revoked_at.
// • القراءة للبوابة عبر RPC ‏portal_overview_by_token(p_token,
//   p_student_id) فقط — security definer تطابق هاش الرمز الخام،
//   تتحقق من الصلاحية وعدم الإلغاء ومن ربط الطالب بوليّ صاحب الرمز،
//   وتسجّل last_used_at، وتعيد حقول العرض المحدودة جاهزة.
//   لا توجد أي سياسة RLS لولي الأمر على جداول الأعمال، فلا وصول
//   anon مباشر لأي جدول — والبانٍ الداخلي portal_build_overview
//   أُغلق أمام anon/authenticated بـ migration ‏0002 (كان مكشوفاً
//   بمنح صريح من Supabase رغم revoke الموجودة في 0001).
// • نفس الـ migration أصلحت portal_overview_by_token: كانت
//   search_path=public فقط بينما digest() من pgcrypto في schema
//   ‏extensions، فأي استدعاء كان يفشل وقت التشغيل (42883).
//
// الرمز الخام: يُولّد في العميل بـ Web Crypto (32 بايت عشوائياً،
// base64url)، يُهشّ بـ SHA-256 قبل الإرسال، ولا يُحفظ في القاعدة
// ولا في أي log — يظهر للمدرس مرة واحدة وقت التوليد داخل رابط
// البوابة، والتوليد إضافي: لا يُبطل أي رابط نشط سابق للطالب
// (إصلاح 2026-11-28 — الرابط يموت بانتهائه أو بإلغاء صريح فقط).
// ---------------------------------------------------------------------------

/** صلاحية رابط البوابة بالأيام — قرار المستخدم المعتمد عند الإطلاق */
export const PORTAL_TOKEN_TTL_DAYS = 30

const TOKEN_COLS =
  'id, teacher_id, guardian_id, student_id, expires_at, revoked_at, last_used_at, created_at'
const GUARDIAN_COLS =
  'id, teacher_id, user_id, display_name, phone, created_at, updated_at, whatsapp_opt_out'
/** قائمة الأعمدة قبل مهاجرة 0073 — تُستخدم عند كشف غياب عمود whatsapp_opt_out (نمط #27) */
const GUARDIAN_COLS_LEGACY =
  'id, teacher_id, user_id, display_name, phone, created_at, updated_at'
const GUARDIAN_EMBED_COLS =
  'guardian_id, guardians(id, teacher_id, user_id, display_name, phone, created_at, updated_at, whatsapp_opt_out)'
/** نفس التضمين بقائمة ما قبل 0073 (بلا whatsapp_opt_out) */
const GUARDIAN_EMBED_COLS_LEGACY =
  'guardian_id, guardians(id, teacher_id, user_id, display_name, phone, created_at, updated_at)'

/**
 * قراءة متسامحة لعمود whatsapp_opt_out (مهاجرة 0073، بوابة التجميد —
 * نمط #27): على قاعدة بلا المهاجرة يرفض PostgREST الـ select بـ
 * PGRST204 فينهار توليد رابط البوابة كله — نرجع لقائمة الأعمدة
 * القديمة ونكمل الصف بالافتراضي (لا انسحاب = false كما في المهاجرة).
 */
export function isMissingWhatsappOptOutColumn(error: {
  code?: string
  message?: string
} | null): boolean {
  if (!error) return false
  return error.code === 'PGRST204' || (error.message ?? '').includes('whatsapp_opt_out')
}

/** إكمال صف ولي أمر قديم (بلا whatsapp_opt_out) بالافتراضي false */
export function withWhatsappOptOutDefault(
  row: Omit<GuardianRow, 'whatsapp_opt_out'> & { whatsapp_opt_out?: boolean },
): GuardianRow {
  return { ...row, whatsapp_opt_out: row.whatsapp_opt_out ?? false }
}

// ---------------------------------------------------------------------------
// توليد الرمز وهاشّه (Web Crypto — في المتصفح فقط، بلا أي إرسال للخام)
// ---------------------------------------------------------------------------

/** رمز عشوائي آمن: 32 بايت من crypto.getRandomValues بصيغة base64url */
export function generateRawToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** SHA-256 hex — نفس صيغة token_hash في المخطط ونفس حساب الـ RPC */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * رابط البوابة العام: /portal?student=<uuid>&t=<rawToken>
 * (المسار الحالي /portal بلا معالم، فالتوكن ومعرّف الطالب في
 * الاستعلام — والـ RPC تحتاج الاثنين معاً. الصفحة تقبل أيضاً
 * /portal/<uuid>?t= و?t= باسم token= للمرونة.)
 */
export function buildPortalLink(origin: string, studentId: string, rawToken: string): string {
  return `${origin}/portal?student=${encodeURIComponent(studentId)}&t=${encodeURIComponent(rawToken)}`
}

/** بيانات ولي الأمر الفعّالة من حقول الطالب (ترتيب وحدة الحضور نفسه) */
export function effectiveGuardianFromStudent(student: Pick<StudentRow, 'name' | 'guardian_name' | 'guardian_phone' | 'phone'>): {
  name: string
  phone: string | null
} {
  return {
    // غياب الاسم: «ولي أمر {اسم الطالب الأول}» لا التسمية الحرفية —
    // حتى لا يعرض شيت البوابة «ولي الأمر: ولي الأمر» (L2)
    name: student.guardian_name?.trim()
      ? student.guardian_name.trim()
      : t('portal.apiGuardianFallback', { first: student.name.trim().split(/\s+/)[0] ?? '' }).trim(),
    phone: student.guardian_phone?.trim() || student.phone?.trim() || null,
  }
}

/** رسالة واتساب إرسال رابط البوابة — بنفس أسلوب رسائل §5.6 (لا نص حرفي لها في المرجع) */
export function portalLinkWaUrl(
  student: Pick<StudentRow, 'name' | 'guardian_name' | 'guardian_phone' | 'phone'>,
  link: string,
  days: number,
): string | null {
  const { name: guardianName, phone } = effectiveGuardianFromStudent(student)
  const base = waLink(phone)
  if (!base) return null
  const msg = t('portal.apiPortalLinkWa', {
    guardian: guardianName,
    name: student.name,
    link,
    days,
  })
  return `${base}?text=${encodeURIComponent(msg)}`
}

// ---------------------------------------------------------------------------
// جهة المدرس (جلسة مصادقة — سياسات المالك على الجداول الثلاثة)
// ---------------------------------------------------------------------------

/**
 * ضمان وجود ولي أمر مرتبط بالطالب: المرتبط أصلاً في guardian_students
 * أولاً (أولوية وحدة الحضور نفسها)، وإلا يُنشأ من حقول ملف الطالب
 * (guardian_phone ثم phone — وبلا أي رقم لا يمكن إنشاء ولي أمر
 * لأن guardians.phone أساس الربط في المخطط).
 */
/** ولي الأمر المرتبط بالطالب عبر guardian_students (قراءة متسامحة 0073) */
async function fetchLinkedGuardian(
  teacherId: string,
  studentId: string,
): Promise<GuardianRow | null> {
  const supa = db()
  const { data, error } = await supa
    .from('guardian_students')
    .select(GUARDIAN_EMBED_COLS)
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
    .limit(1)
    .maybeSingle()
  if (error) {
    if (isMissingWhatsappOptOutColumn(error)) {
      const retry = await supa
        .from('guardian_students')
        .select(GUARDIAN_EMBED_COLS_LEGACY)
        .eq('teacher_id', teacherId)
        .eq('student_id', studentId)
        .limit(1)
        .maybeSingle()
      if (retry.error) throw retry.error
      return retry.data?.guardians ? withWhatsappOptOutDefault(retry.data.guardians) : null
    }
    throw error
  }
  return data?.guardians ? withWhatsappOptOutDefault(data.guardians) : null
}

/** ولي أمر السنتر برقمه (قراءة متسامحة 0073) */
async function fetchGuardianByPhone(
  teacherId: string,
  phone: string,
): Promise<GuardianRow | null> {
  const supa = db()
  const { data, error } = await supa
    .from('guardians')
    .select(GUARDIAN_COLS)
    .eq('teacher_id', teacherId)
    .eq('phone', phone)
    .maybeSingle()
  if (error) {
    if (isMissingWhatsappOptOutColumn(error)) {
      const retry = await supa
        .from('guardians')
        .select(GUARDIAN_COLS_LEGACY)
        .eq('teacher_id', teacherId)
        .eq('phone', phone)
        .maybeSingle()
      if (retry.error) throw retry.error
      return retry.data ? withWhatsappOptOutDefault(retry.data) : null
    }
    throw error
  }
  return data ? withWhatsappOptOutDefault(data) : null
}

/** إنشاء ولي أمر جديد (كتابة متسامحة 0073 — نمط #64 في الكتابة) */
async function insertGuardian(
  teacherId: string,
  name: string,
  phone: string,
): Promise<GuardianRow> {
  const supa = db()
  const { data, error } = await supa
    .from('guardians')
    .insert({ teacher_id: teacherId, display_name: name, phone })
    .select(GUARDIAN_COLS)
    .single()
  if (error) {
    if (isMissingWhatsappOptOutColumn(error)) {
      // قاعدة بلا 0073: الـ insert مع الـ returning يفشل كجملة واحدة —
      // لم يُنشأ صف، فنعيد الإنشاء كاملاً بقائمة الأعمدة القديمة.
      const retry = await supa
        .from('guardians')
        .insert({ teacher_id: teacherId, display_name: name, phone })
        .select(GUARDIAN_COLS_LEGACY)
        .single()
      if (retry.error) throw retry.error
      return withWhatsappOptOutDefault(retry.data)
    }
    throw error
  }
  return withWhatsappOptOutDefault(data)
}

async function ensureGuardianAndLink(
  teacherId: string,
  student: StudentRow,
): Promise<GuardianRow> {
  const supa = db()

  const linked = await fetchLinkedGuardian(teacherId, student.id)
  if (linked) return linked

  const { name, phone } = effectiveGuardianFromStudent(student)
  if (!phone) {
    throw new Error(t('portal.apiNoGuardianPhoneError'))
  }

  let guardian = await fetchGuardianByPhone(teacherId, phone)
  if (!guardian) {
    guardian = await insertGuardian(teacherId, name, phone)
  }

  const { error: gsErr } = await supa.from('guardian_students').upsert(
    { teacher_id: teacherId, guardian_id: guardian.id, student_id: student.id },
    { onConflict: 'guardian_id,student_id' },
  )
  if (gsErr) throw gsErr
  return guardian
}

export interface CreatedPortalLink {
  /** الرابط الكامل بالرمز الخام — يُعرض للمدرس مرة واحدة ولا يُحفظ */
  link: string
  expiresAt: string
  guardian: GuardianRow
}

/**
 * توليد رابط بوابة جديد لطالب: رمز عشوائي في العميل → هاش SHA-256
 * فقط يُرسل ويُخزّن. التوليد إضافي — الروابط النشطة السابقة لنفس
 * الطالب تفضل شغالة (دورة الحياة المشتركة في tokenLifecycle).
 */
export async function createPortalLink(
  teacherId: string,
  student: StudentRow,
  ttlDays: number,
): Promise<CreatedPortalLink> {
  const guardian = await ensureGuardianAndLink(teacherId, student)
  // دورة الحياة المشتركة (COD-3): رمز خام ← هاش ← انتهاء بمدة المدرس
  // (3A-385) ← إبطال السابق ← إدراج — والفروق المحفوظة حرفياً هنا هي
  // حلّ ولي الأمر + guardian_id وباني رابط بوابة ولي الأمر.
  const { link, expiresAt } = await createTokenLink({
    table: 'guardian_access_tokens',
    teacherId,
    studentId: student.id,
    ttlDays,
    extraInsert: { guardian_id: guardian.id },
    buildLink: (rawToken) => buildPortalLink(window.location.origin, student.id, rawToken),
    generateRawToken,
    sha256Hex,
  })
  return { link, expiresAt, guardian }
}

/**
 * روابط طالب واحد (لملف الطالب) — بلا عمود الهاش.
 * (COD-3: الجلب/الإلغاء/الحالة عبر دورة الحياة المشتركة في tokenLifecycle)
 */
export async function fetchStudentTokens(
  teacherId: string,
  studentId: string,
): Promise<GuardianAccessTokenRow[]> {
  return fetchTokenRows<GuardianAccessTokenRow>('guardian_access_tokens', TOKEN_COLS, teacherId, studentId)
}

/** كل روابط المدرس (لصفحة إدارة البوابة) — بلا عمود الهاش */
export async function fetchTeacherTokens(
  teacherId: string,
): Promise<GuardianAccessTokenRow[]> {
  return fetchTokenRows<GuardianAccessTokenRow>('guardian_access_tokens', TOKEN_COLS, teacherId)
}

/** إلغاء رابط (revoked_at) — لا حذف: سجل التوكن يبقى للتدقيق */
export async function revokePortalToken(teacherId: string, tokenId: string): Promise<void> {
  return revokeTokenRow('guardian_access_tokens', teacherId, tokenId)
}

/** حالة رابط للعرض: ملغي صراحة، أو منتهٍ بمرور وقته، أو نشط */
export function tokenStatus(t: GuardianAccessTokenRow): 'active' | 'expired' | 'revoked' {
  return tokenStatusOf(t)
}

// ---------------------------------------------------------------------------
// جهة البوابة العامة (بلا جلسة — anon key + RPC مقيدة الحقول فقط)
// ---------------------------------------------------------------------------

interface PortalGroup {
  name: string
  days: number[]
  start_time: string
  /** المواعيد الأسبوعية الكاملة (3A-926) — سطر عرض لكل موعد */
  slots: GroupSlot[]
  room: string | null
  links: string[]
}

interface PortalScore {
  title: string
  date: string
  score: number
  max_score: number
}

interface PortalNote {
  date: string
  text: string
}

interface PortalAttendance {
  date: string
  group_name: string
  status: string // 'p' | 'a' | 'l' | 'm' — من attendance_status في المخطط
}

/** هوية السنتر البيضاء في البوابة (0008) — كل الحقول اختيارية */
export interface PortalBrand {
  /** اسم السنتر التجاري، وإلا اسم المدرس، وإلا null (العنوان الافتراضي) */
  name: string | null
  /** رابط الشعار العام أو null */
  logo_url: string | null
  /** لون اللهجة #RRGGBB أو null */
  accent: string | null
  /**
   * إظهار دُفّي عند مدرس السنتر (0029 — خطة الهوية P-10): يأتي من
   * teacher_settings.show_mascot داخل حمولة الـ RPC الخادمية نفسها؛
   * غيابه (RPC أقدم) = true بالافتراضي «يظهر» كما في 0028.
   */
  show_mascot: boolean
}

/** أقسام بوابة ولي الأمر الظاهرة بقرار المدرس (3A-385) — false = مخفي ولا تصل بياناته أصلاً */
type PortalSections = Record<GuardianSectionKey, boolean>

/** عرض البوابة كما يعيده portal_build_overview حرفياً — حقول محدودة بالتصميم */
export interface PortalOverview {
  student: { name: string; code: string; grade: string | null }
  brand: PortalBrand
  sections: PortalSections
  attendance_rate: number | null
  balance: number
  /** توجد أي فاتورة للطالب أصلاً (0071) — أساس فرق «مسدد» عن «لا فواتير» */
  has_invoices: boolean
  groups: PortalGroup[]
  latest_scores: PortalScore[]
  notes: PortalNote[]
  recent_attendance: PortalAttendance[]
}

/**
 * حالة مال الطالب المعروضة في البوابة (3A-925 بند ٤): مستحقّ إن وُجد رصيد،
 * «مسدد» إن وُجدت فواتير ورصيدها صفر، و«لا فواتير» إن لم توجد أي فاتورة
 * أصلاً — الخلط بين الأخيرتين كان يعرض «مسدد» لطالب لم تُنشأ له فاتورة قط.
 */
export type PortalMoneyState = 'due' | 'paid' | 'none'

export function portalMoneyState(o: { balance: number; has_invoices: boolean }): PortalMoneyState {
  if (o.balance > 0) return 'due'
  return o.has_invoices ? 'paid' : 'none'
}

/** قراءة البوابة بالرمز الخام عبر الـ RPC — المسار الآمن الوحيد للـ anon */
export async function fetchPortalOverview(
  rawToken: string,
  studentId: string,
): Promise<PortalOverview> {
  const { data, error } = await db().rpc('portal_overview_by_token', {
    p_token: rawToken,
    p_student_id: studentId,
  })
  if (error) throw error
  if (!data) throw new Error('invalid or expired token')
  const raw = data as unknown as PortalOverview & {
    brand?: RawPortalBrand | null
    sections?: unknown
  }
  return {
    // رأس العرض المشترك (طالب/هوية/حضور/رصيد/مجموعات) — COD-3:
    // normalizeOverviewHead في tokenLifecycle.
    ...normalizeOverviewHead(raw),
    sections: normalizeSections(raw.sections, GUARDIAN_SECTION_KEYS),
    latest_scores: (raw.latest_scores ?? []).map((s) => ({
      title: s.title,
      date: s.date,
      score: num(s.score),
      max_score: num(s.max_score),
    })),
    notes: raw.notes ?? [],
    recent_attendance: raw.recent_attendance ?? [],
  }
}

/** رسالة مهذبة لولي الأمر من خطأ الـ RPC — بلا أي تفاصيل داخلية */
export function portalErrorInfo(error: unknown): { title: string; hint: string } {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (msg.includes('invalid or expired')) {
    return {
      title: t('portal.apiErrorExpiredTitle'),
      hint: t('portal.apiErrorExpiredHint'),
    }
  }
  if (msg.includes('not authorized') || msg.includes('token not valid')) {
    return {
      title: t('portal.apiErrorInvalidTitle'),
      hint: t('portal.apiErrorNotLinkedHint'),
    }
  }
  return {
    title: t('portal.apiErrorInvalidTitle'),
    hint: t('portal.apiErrorGenericHint'),
  }
}

// ---------------------------------------------------------------------------
// إثبات الدفع من البوابة — Phase 2 خطوة 7 (migration ‏0005).
//
// البوابة مرتبطة بطبيعتها بطالب واحد (الطالب في الرابط نفسه)، فالإثبات
// يُرفع لهذا الطالب حصراً — لا اختيار طالب هنا لأن الصفحة كلها عنه.
//
// التدفق (لا كتابة مباشرة لأي جدول من anon — نفس نموذج البوابة كله):
// 1) RPC ‏portal_create_payment_proof بالتوكن: تتحقق من التوكن بنفس
//    آلية العرض، تنشئ صف إثبات pending، وتعيد المسار المتوقع للصورة
//    «<teacher_id>/<proof_id>.<ext>» — المسار من الخادم دائماً.
// 2) رفع الصورة نفسها إلى bucket خاص payment-proofs بهذا المسار فقط
//    (سياسة Storage: إدراج فقط لمسارات إثباتات pending قائمة).
// 3) RPC ‏portal_confirm_payment_proof تضبط uploaded_at — قبلها لا
//    يرى المدرس الإثبات أصلاً، فرفع فاشل/منقطع لا يرمي له صفاً يتيماً.
// عند فشل الخطوة 2 نستدعي RPC الحذف (best-effort) لمسح الصف اليتيم؛
// وعند فشل الخطوة 3 وحدها الصورة موجودة والصف بلا تأكيد — الرسالة
// تطلب إعادة الإرسال (إثبات جديد)، والقديم يبقى غير مرئي للمدرس.
// ---------------------------------------------------------------------------

/** طرق إثبات الدفع في البوابة — تحويلات إلكترونية فقط (لا «كاش») */
export const PROOF_METHODS: { code: PaymentMethod; label: string }[] = [
  { code: 'vodafone_cash', label: t('portal.apiProofMethodVodafone') },
  { code: 'instapay', label: t('portal.apiProofMethodInstapay') },
  { code: 'bank_transfer', label: t('portal.apiProofMethodBank') },
]

const PROOF_BUCKET = 'payment-proofs'

/** حد حجم الصورة على الخادم (bucket) — العميل يضغط قبل الرفع لاحترام الحد */
const PROOF_MAX_BYTES = 5 * 1024 * 1024

export interface PortalProof {
  id: string
  amount: number
  method: PaymentMethod
  status: PaymentProofStatus
  rejection_reason: string | null
  created_at: string
  reviewed_at: string | null
}

/** شارات حالة الإثبات في البوابة — بنسخ ألوان الحالات النصية المضمونة التباين */
export const PROOF_STATUS_META: Record<
  PaymentProofStatus,
  { label: string; badge: string }
> = {
  pending: { label: t('portal.apiProofStatusPending'), badge: 'bg-warn-soft text-warn-text border-warn/40' },
  approved: { label: t('portal.apiProofStatusApproved'), badge: 'bg-ok-soft text-ok-text border-ok/30' },
  rejected: { label: t('portal.apiProofStatusRejected'), badge: 'bg-bad-soft text-bad-text border-bad/30' },
}

/** شارة محايدة لأي قيمة حالة/نوع لا يعرفها العميل (نفس شارة بديل الحضور في الصفحة). */
const META_FALLBACK_BADGE = 'bg-soft text-muted border-border'

/**
 * بحث ميتا محروس (3A-909 + 3A-928): لا يعيد undefined أبداً مهما كانت
 * القيمة القادمة من الخادم — مفتاح غير نصي (null/undefined من JSONB)،
 * أو فارغ، أو غير معروف، أو موروث من النموذج الأولي للكائنات
 * ('toString'/'constructor' — البحث الخام كان يعيد دالة فيُقرأ منها
 * badge فارغ) — الكل يتحل لشارة محايدة بتسمية البديل. الفحص بـ
 * Object.hasOwn حتى لا تتسرب مفاتيح Object.prototype.
 */
function metaOf(
  map: Record<string, { label: string; badge: string }>,
  key: unknown,
  fallbackLabel: string,
): { label: string; badge: string } {
  if (typeof key === 'string' && Object.hasOwn(map, key)) return map[key]
  return { label: fallbackLabel, badge: META_FALLBACK_BADGE }
}

/**
 * حسم ميتا حالة إثبات بأمان (3A-909): الحالة تأتي من الخادم عبر JSONB
 * مُلقاة بنوع العميل — أي حالة لا يعرفها العميل (انحراف نسخ بين العميل
 * وقاعدة البيانات) تتحل هنا لشارة محايدة بدل أن ترمي أثناء العرض
 * وتُسقط صفحة البوابة كلها على حدّ الخطأ العام «حصلت مشكلة غير متوقعة».
 */
export function portalProofStatusMeta(status: string): { label: string; badge: string } {
  return metaOf(PROOF_STATUS_META, status, t('portal.apiProofStatusFallback'))
}

export function proofErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (msg.includes('invalid or expired') || msg.includes('not authorized') || msg.includes('token not valid')) {
    return t('portal.apiProofErrorInvalidLink')
  }
  if (msg.includes('section disabled')) {
    return t('portal.apiProofErrorSectionDisabled')
  }
  if (msg.includes('too many pending proofs')) {
    return t('portal.apiProofErrorTooMany')
  }
  if (msg.includes('invalid amount')) return t('portal.apiProofErrorInvalidAmount')
  if (msg.includes('invalid file type')) return t('portal.apiProofErrorInvalidFileType')
  return t('portal.apiProofErrorGeneric')
}

interface PreparedProofImage {
  blob: Blob
  ext: 'jpg' | 'png' | 'webp'
  contentType: string
}

const PROOF_MIME_EXT: Record<string, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * تجهيز صورة الإثبات: الصور الصغيرة (≤ 2MB) تُرفع كما هي، والأكبر
 * تُعاد مقاسها من Canvas لأقصى بُعد 1600px وتُصدَّر JPEG بجودة 0.85
 * (لقطات التحويل نصية فتتحمل JPEG جيداً) حتى تحترم حد الـ bucket ‏5MB.
 * فشل الضغط يرجع للأصل إن كان داخل الحد، وإلا خطأ واضح.
 */
async function prepareProofImage(file: File): Promise<PreparedProofImage> {
  const ext = PROOF_MIME_EXT[file.type]
  if (!ext) throw new Error(t('portal.apiProofErrorInvalidFileType'))
  if (file.size <= 2 * 1024 * 1024) {
    return { blob: file, ext, contentType: file.type }
  }
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas context')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    )
    if (blob && blob.size <= PROOF_MAX_BYTES) {
      return { blob, ext: 'jpg', contentType: 'image/jpeg' }
    }
  } catch {
    // بنكمل للبديل: الأصل داخل الحد أو خطأ واضح
  }
  if (file.size <= PROOF_MAX_BYTES) return { blob: file, ext, contentType: file.type }
  throw new Error(t('portal.apiProofErrorTooLarge'))
}

/** إرسال إثبات دفع كامل: إنشاء بالتوكن ← رفع الصورة ← تأكيد الاكتمال */
export async function submitPaymentProof(
  rawToken: string,
  studentId: string,
  input: { amount: number; method: PaymentMethod },
  file: File,
): Promise<void> {
  if (!(input.amount > 0)) throw new Error(t('portal.apiProofErrorAmountRequired'))
  const prepared = await prepareProofImage(file)
  const supa = db()

  const { data, error } = await supa.rpc('portal_create_payment_proof', {
    p_token: rawToken,
    p_student_id: studentId,
    p_amount: input.amount,
    p_method: input.method,
    p_file_ext: prepared.ext,
  })
  if (error) throw new Error(proofErrorMessage(error))
  const created = data as unknown as { proof_id: string; storage_path: string }

  const { error: upErr } = await supa.storage
    .from(PROOF_BUCKET)
    .upload(created.storage_path, prepared.blob, {
      contentType: prepared.contentType,
      upsert: false,
    })
  if (upErr && !/already exists/i.test(upErr.message)) {
    // تنظيف الصف اليتيم best-effort — فشله لا يخفي خطأ الرفع الأصلي
    await supa
      .rpc('portal_delete_payment_proof', { p_token: rawToken, p_proof_id: created.proof_id })
      .then(() => {}, () => {})
    throw new Error(t('portal.apiProofErrorUploadFailed'))
  }

  const { error: confErr } = await supa.rpc('portal_confirm_payment_proof', {
    p_token: rawToken,
    p_proof_id: created.proof_id,
  })
  if (confErr) {
    throw new Error(
      t('portal.apiProofErrorConfirmFailed'),
    )
  }
}

/** إثباتات ولي الأمر لهذا الطالب — عبر RPC بالتوكن فقط، المرفوعة فعلياً فقط */
export async function fetchPortalProofs(
  rawToken: string,
  studentId: string,
): Promise<PortalProof[]> {
  const { data, error } = await db().rpc('portal_list_payment_proofs', {
    p_token: rawToken,
    p_student_id: studentId,
  })
  if (error) throw new Error(proofErrorMessage(error))
  const rows = (data ?? []) as unknown as PortalProof[]
  return rows.map((r) => ({ ...r, amount: num(r.amount) }))
}

// ---------------------------------------------------------------------------
// صندوق تنبيهات الوصول/المغادرة — Phase 3 خطوة 6 (migration ‏0012).
//
// التنبيهات تتولد في القاعدة بـ trigger على attendance عند أول تسجيل
// حضوري («وصل») وعند ضبط انصراف الطالب («غادر») — بلا Push خارجي وبلا
// إرسال تلقائي: البوابة صندوق قراءة داخل رابط ولي الأمر نفسه، وقائمة
// واتساب اليدوية عند المدرس في شاشة الحضور. الوصول هنا عبر RPC بـ
// security definer تتحقق من التوكن بـ portal_validate_token (نفس آلية
// العرض والإثباتات)، والقائمة مقيدة بطالب الرابط حصراً، وتعليم القراءة
// يكتب read_at فقط لصفوف هذا الطالب.
// ---------------------------------------------------------------------------

export interface PortalNotification {
  id: string
  kind: 'arrived' | 'left' | 'absence' | 'invoice_issued'
  event_at: string
  read_at: string | null
  /** أحداث الحصة فقط (وصول/مغادرة/غياب) — null لإشعار الفاتورة (0050) */
  session_date: string | null
  start_time: string | null
  group_name: string | null
  /** إشعار الفاتورة فقط (0050) — الشهر والمبالغ الحية من invoice_balances */
  invoice_period: string | null
  invoice_total: number | null
  invoice_balance: number | null
}

export interface PortalNotificationsResult {
  notifications: PortalNotification[]
  unread_count: number
}

function notificationErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (msg.includes('invalid or expired') || msg.includes('not authorized') || msg.includes('token not valid')) {
    return t('portal.apiNotifErrorInvalidLink')
  }
  return t('portal.apiNotifErrorGeneric')
}

/** تنبيهات طالب الرابط (وصول/مغادرة/غياب/فاتورة — 0050) + عدّاد غير المقروء — عبر RPC بالتوكن فقط */
export async function fetchPortalNotifications(
  rawToken: string,
  studentId: string,
): Promise<PortalNotificationsResult> {
  const { data, error } = await db().rpc('portal_list_guardian_notifications', {
    p_token: rawToken,
    p_student_id: studentId,
  })
  if (error) throw new Error(notificationErrorMessage(error))
  const raw = (data ?? {}) as unknown as Partial<PortalNotificationsResult>
  return {
    notifications: raw.notifications ?? [],
    unread_count: Number(raw.unread_count) || 0,
  }
}

/**
 * تعليم تنبيهات الطالب كمقروءة (الكل عند غياب القائمة) — RPC الكتابة
 * الوحيدة في الصندوق، مقيدة بالتوكن وتكتب read_at فقط. يعيد العدّاد.
 */
export async function markPortalNotificationsRead(
  rawToken: string,
  studentId: string,
  ids?: string[],
): Promise<number> {
  const { data, error } = await db().rpc('portal_mark_notifications_read', {
    p_token: rawToken,
    p_student_id: studentId,
    // وسيط اختياري افتراضيه NULL في المخطط: غيابه ≡ NULL حرفياً (COD-1)
    p_ids: ids ?? undefined,
  })
  if (error) throw new Error(notificationErrorMessage(error))
  const raw = (data ?? {}) as unknown as { unread_count?: number }
  return Number(raw.unread_count) || 0
}

// ---------------------------------------------------------------------------
// إشعارات Push الفورية من البوابة — Phase 4 خطوة 2 (migration ‏0014).
//
// الاشتراك اختياري من نفس جلسة توكن البوابة: المتصفح يشترك عند خدمة
// الـ Push عبر lib/push (subscribeBrowserPush)، والحفظ/الإيقاف/الحالة
// عبر RPC بـ security definer تتحقق من التوكن بـ portal_validate_token
// وتربط الاشتراك بالطالب وبصف التوكن وبوليّ الأمر (portal_token_id +
// guardian_id). لا وصول مباشر لجدول push_subscriptions من anon إطلاقاً.
// الإرسال عند الأحداث خادمي بالكامل (مشغّلات 0014 ← pg_net ← send-push).
// ---------------------------------------------------------------------------

function pushErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (msg.includes('invalid or expired') || msg.includes('not authorized') || msg.includes('token not valid')) {
    return t('portal.apiPushErrorInvalidLink')
  }
  if (msg.includes('invalid subscription')) {
    return t('portal.apiPushErrorInvalidSub')
  }
  return t('portal.apiPushErrorGeneric')
}

// (COD-3: استدعاءات الـ RPC الثلاثة عبر tokenLifecycle مع تمرير أسماء
// portal_push_* كما هي حرفياً؛ مترجم الأخطاء يبقى خاصاً بهذه البوابة.)

/** حالة اشتراك هذا المتصفح لبوابة ولي الأمر (نشط لهذا الطالب؟) */
export async function fetchGuardianPushStatus(
  rawToken: string,
  studentId: string,
  endpoint: string,
): Promise<boolean> {
  return fetchPushStatus(
    'portal_push_status',
    { p_token: rawToken, p_student_id: studentId, p_endpoint: endpoint },
    pushErrorMessage,
  )
}

/** تسجيل اشتراك Push هذا المتصفح لولي أمر طالب الرابط */
export async function subscribeGuardianPush(
  rawToken: string,
  studentId: string,
  sub: { endpoint: string; p256dh: string; auth: string; userAgent: string },
): Promise<void> {
  return callPushRpc(
    'portal_push_subscribe',
    {
      p_token: rawToken,
      p_student_id: studentId,
      p_endpoint: sub.endpoint,
      p_p256dh: sub.p256dh,
      p_auth: sub.auth,
      p_user_agent: sub.userAgent,
    },
    pushErrorMessage,
  )
}

/** إيقاف اشتراك Push هذا المتصفح من البوابة — يعطّل الصف خادمياً */
export async function unsubscribeGuardianPush(
  rawToken: string,
  studentId: string,
  endpoint: string,
): Promise<void> {
  return callPushRpc(
    'portal_push_unsubscribe',
    { p_token: rawToken, p_student_id: studentId, p_endpoint: endpoint },
    pushErrorMessage,
  )
}

/** شارات نوع التنبيه في البوابة — وصل/غادر بألوان مضمونة التباين */
export const PORTAL_NOTIF_META: Record<
  PortalNotification['kind'],
  { label: string; badge: string }
> = {
  arrived: { label: t('portal.apiNotifArrived'), badge: 'bg-ok-soft text-ok-text border-ok/30' },
  left: { label: t('portal.apiNotifLeft'), badge: 'bg-soft text-primary border-primary/30' },
  absence: { label: t('portal.apiNotifAbsence'), badge: 'bg-warn-soft text-warn-text border-warn/30' },
  invoice_issued: { label: t('portal.apiNotifInvoice'), badge: 'bg-soft text-primary border-primary/30' },
}

/**
 * حسم ميتا تنبيه بأمان (3A-909): النوع يأتي من الخادم — قائمة الأنواع
 * الحية أوسع من أي نسخة عميل أقدم (0050 أضاف absence/invoice_issued
 * بينما عميل الإنتاج 36391a49 كان يعرف arrived/left فقط، فكان البحث
 * غير المحروس يرمي أثناء العرض ويُسقط البوابة كلها على حدّ الخطأ
 * العام). أي نوع غير معروف يتحل هنا لشارة «تنبيه» محايدة ولا يرمي أبداً.
 */
export function portalNotifMeta(kind: string): { label: string; badge: string } {
  return metaOf(PORTAL_NOTIF_META, kind, t('portal.apiNotifFallback'))
}

/**
 * حسم ميتا حالة حضور في البوابة (3A-928): كان آخر بحث خام مباشر في
 * خريطة عند صفحة البوابة — صار عبر metaOf المحروس كسائر الميتا، فأي
 * حالة حضور لا يعرفها العميل (أو قيمة فارغة/غير نصية) تتحل لشارة
 * «حضور» المحايدة ولا ترمي أبداً.
 */
export function portalAttMeta(status: string): { label: string; badge: string } {
  return metaOf(PORTAL_ATT_META, status, t('portal.apiAttFallback'))
}

/** حالات الحضور الأربع في البوابة (§2.4) — الشارات مشتركة (buildAttMeta)، والتسميات بمفاتيح هذه البوابة */
export const PORTAL_ATT_META: Record<string, { label: string; badge: string }> = buildAttMeta({
  p: t('portal.apiAttPresent'),
  a: t('portal.apiAttAbsent'),
  l: t('portal.apiAttLate'),
  m: t('portal.apiAttMakeup'),
})
