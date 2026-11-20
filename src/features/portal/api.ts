import { supabase } from '../../lib/supabase'
import { brandLogoUrl, isValidAccent } from '../../lib/brand'
import { waLink } from '../../lib/format'
import type {
  GuardianAccessTokenRow,
  GuardianRow,
  PaymentMethod,
  PaymentProofStatus,
  StudentRow,
} from '../../types/database'

function db() {
  if (!supabase) throw new Error('Supabase غير مربوط — راجع إعدادات .env')
  return supabase
}

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
// البوابة، وإعادة التوليد تُبطل الروابط النشطة السابقة للطالب.
// ---------------------------------------------------------------------------

/** صلاحية رابط البوابة بالأيام — قرار المستخدم المعتمد عند الإطلاق */
export const PORTAL_TOKEN_TTL_DAYS = 30

const TOKEN_COLS =
  'id, teacher_id, guardian_id, student_id, expires_at, revoked_at, last_used_at, created_at'
const GUARDIAN_COLS = 'id, teacher_id, user_id, display_name, phone, created_at, updated_at'

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
export function effectiveGuardianFromStudent(student: Pick<StudentRow, 'guardian_name' | 'guardian_phone' | 'phone'>): {
  name: string
  phone: string | null
} {
  return {
    name: student.guardian_name?.trim() ? student.guardian_name.trim() : 'ولي الأمر',
    phone: student.guardian_phone?.trim() || student.phone?.trim() || null,
  }
}

/** رسالة واتساب إرسال رابط البوابة — بنفس أسلوب رسائل §5.6 (لا نص حرفي لها في المرجع) */
export function portalLinkWaUrl(
  student: Pick<StudentRow, 'name' | 'guardian_name' | 'guardian_phone' | 'phone'>,
  link: string,
): string | null {
  const { name: guardianName, phone } = effectiveGuardianFromStudent(student)
  const base = waLink(phone)
  if (!base) return null
  const msg =
    `أهلاً ${guardianName}، ده رابط بوابة ولي الأمر لمتابعة الطالب ${student.name} ` +
    `(الحضور والدرجات والموقف المالي): ${link} — الرابط صالح لمدة ${PORTAL_TOKEN_TTL_DAYS} يوم.`
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
export async function ensureGuardianAndLink(
  teacherId: string,
  student: StudentRow,
): Promise<GuardianRow> {
  const supa = db()

  const { data: link, error: linkErr } = await supa
    .from('guardian_students')
    .select('guardian_id, guardians(id, teacher_id, user_id, display_name, phone, created_at, updated_at)')
    .eq('teacher_id', teacherId)
    .eq('student_id', student.id)
    .limit(1)
    .maybeSingle()
  if (linkErr) throw linkErr
  const linked = (link as unknown as { guardians: GuardianRow | null } | null)?.guardians
  if (linked) return linked

  const { name, phone } = effectiveGuardianFromStudent(student)
  if (!phone) {
    throw new Error('الطالب مالوش رقم موبايل لولي الأمر — ضيف الرقم من «تعديل الطالب» الأول')
  }

  const { data: existing, error: exErr } = await supa
    .from('guardians')
    .select(GUARDIAN_COLS)
    .eq('teacher_id', teacherId)
    .eq('phone', phone)
    .maybeSingle()
  if (exErr) throw exErr

  let guardian = (existing as unknown as GuardianRow | null) ?? null
  if (!guardian) {
    const { data: created, error: insErr } = await supa
      .from('guardians')
      .insert({ teacher_id: teacherId, display_name: name, phone })
      .select(GUARDIAN_COLS)
      .single()
    if (insErr) throw insErr
    guardian = created as unknown as GuardianRow
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
 * فقط يُرسل ويُخزّن. أي روابط نشطة سابقة لنفس الطالب تُبطَل أولاً
 * (إعادة التوليد = إبطال القديم، كما هو مطلوب).
 */
export async function createPortalLink(
  teacherId: string,
  student: StudentRow,
): Promise<CreatedPortalLink> {
  const supa = db()
  const guardian = await ensureGuardianAndLink(teacherId, student)

  const rawToken = generateRawToken()
  const tokenHash = await sha256Hex(rawToken)
  const expiresAt = new Date(
    Date.now() + PORTAL_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { error: revokeErr } = await supa
    .from('guardian_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('teacher_id', teacherId)
    .eq('student_id', student.id)
    .is('revoked_at', null)
  if (revokeErr) throw revokeErr

  const { error: insErr } = await supa.from('guardian_access_tokens').insert({
    teacher_id: teacherId,
    guardian_id: guardian.id,
    student_id: student.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  })
  if (insErr) throw insErr

  return {
    link: buildPortalLink(window.location.origin, student.id, rawToken),
    expiresAt,
    guardian,
  }
}

/** روابط طالب واحد (لملف الطالب) — بلا عمود الهاش */
export async function fetchStudentTokens(
  teacherId: string,
  studentId: string,
): Promise<GuardianAccessTokenRow[]> {
  const { data, error } = await db()
    .from('guardian_access_tokens')
    .select(TOKEN_COLS)
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as GuardianAccessTokenRow[]
}

/** كل روابط المدرس (لصفحة إدارة البوابة) — بلا عمود الهاش */
export async function fetchTeacherTokens(
  teacherId: string,
): Promise<GuardianAccessTokenRow[]> {
  const { data, error } = await db()
    .from('guardian_access_tokens')
    .select(TOKEN_COLS)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as GuardianAccessTokenRow[]
}

/** إلغاء رابط (revoked_at) — لا حذف: سجل التوكن يبقى للتدقيق */
export async function revokePortalToken(teacherId: string, tokenId: string): Promise<void> {
  const { error } = await db()
    .from('guardian_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('teacher_id', teacherId)
    .eq('id', tokenId)
    .is('revoked_at', null)
  if (error) throw error
}

/** حالة رابط للعرض: ملغي صراحة، أو منتهٍ بمرور وقته، أو نشط */
export function tokenStatus(t: GuardianAccessTokenRow): 'active' | 'expired' | 'revoked' {
  if (t.revoked_at) return 'revoked'
  if (new Date(t.expires_at).getTime() <= Date.now()) return 'expired'
  return 'active'
}

// ---------------------------------------------------------------------------
// جهة البوابة العامة (بلا جلسة — anon key + RPC مقيدة الحقول فقط)
// ---------------------------------------------------------------------------

export interface PortalGroup {
  name: string
  days: number[]
  start_time: string
  room: string | null
  links: string[]
}

export interface PortalScore {
  title: string
  date: string
  score: number
  max_score: number
}

export interface PortalNote {
  date: string
  text: string
}

export interface PortalAttendance {
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
}

/** عرض البوابة كما يعيده portal_build_overview حرفياً — حقول محدودة بالتصميم */
export interface PortalOverview {
  student: { name: string; code: string; grade: string | null }
  brand: PortalBrand
  attendance_rate: number | null
  balance: number
  groups: PortalGroup[]
  latest_scores: PortalScore[]
  notes: PortalNote[]
  recent_attendance: PortalAttendance[]
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(n) ? n : 0
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
    brand?: {
      name?: string | null
      teacher_name?: string | null
      logo_path?: string | null
      accent?: string | null
    } | null
  }
  return {
    student: raw.student,
    // الهوية البيضاء: الاسم التجاري يتقدم اسم المدرس، والشعار يُبنى رابطه
    // العام من مساره، واللهجة تُمرَّر بعد التحقق من صيغتها — غياب قسم
    // brand كله (نسخة RPC أقدم) يسقط للافتراضي بلا كسر.
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
      title: 'الرابط منتهي أو ملغي',
      hint: 'رابط البوابة ده انتهت صلاحيته (30 يوم) أو المدرس ألغاه. اطلب من المدرس رابط جديد وهيوصلك على واتساب.',
    }
  }
  if (msg.includes('not authorized') || msg.includes('token not valid')) {
    return {
      title: 'الرابط غير صالح',
      hint: 'الرابط ده مش مربوط بالطالب ده. تأكد إنك فتحت الرابط زي ما وصلك بالظبط، أو اطلب من المدرس رابط جديد.',
    }
  }
  return {
    title: 'الرابط غير صالح',
    hint: 'ماقدرناش نفتح البوابة بالرابط ده. تأكد إنك فتحته زي ما وصلك بالظبط، أو اطلب من المدرس رابط جديد.',
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
  { code: 'vodafone_cash', label: 'فودافون كاش' },
  { code: 'instapay', label: 'إنستاباي' },
  { code: 'bank_transfer', label: 'تحويل بنكي' },
]

export const PROOF_BUCKET = 'payment-proofs'

/** حد حجم الصورة على الخادم (bucket) — العميل يضغط قبل الرفع لاحترام الحد */
export const PROOF_MAX_BYTES = 5 * 1024 * 1024

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
  pending: { label: 'قيد مراجعة المدرس', badge: 'bg-warn-soft text-warn-text border-warn/40' },
  approved: { label: 'تم الاعتماد وتسجيل الدفعة', badge: 'bg-ok-soft text-ok-text border-ok/30' },
  rejected: { label: 'مرفوض', badge: 'bg-bad-soft text-bad-text border-bad/30' },
}

function proofErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (msg.includes('invalid or expired') || msg.includes('not authorized') || msg.includes('token not valid')) {
    return 'رابط البوابة منتهي أو مش صالح — اطلب من المدرس رابط جديد قبل ما تبعت الإثبات.'
  }
  if (msg.includes('too many pending proofs')) {
    return 'عندك إثباتات كتير لسه مستنية مراجعة المدرس — استنى مراجعتها قبل ما تبعت إثبات جديد.'
  }
  if (msg.includes('invalid amount')) return 'المبلغ مش صحيح — اكتب مبلغ التحويل زي ما هو في اللقطة.'
  if (msg.includes('invalid file type')) return 'اختار صورة بصيغة JPG أو PNG أو WebP.'
  return 'ماقدرناش نبعت الإثبات — اتأكد من النت وحاول تاني.'
}

export interface PreparedProofImage {
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
export async function prepareProofImage(file: File): Promise<PreparedProofImage> {
  const ext = PROOF_MIME_EXT[file.type]
  if (!ext) throw new Error('اختار صورة بصيغة JPG أو PNG أو WebP.')
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
  throw new Error('الصورة كبيرة أوي (أكتر من 5 ميجا) — جرّب لقطة أصغر أو قلّل جودتها.')
}

/** إرسال إثبات دفع كامل: إنشاء بالتوكن ← رفع الصورة ← تأكيد الاكتمال */
export async function submitPaymentProof(
  rawToken: string,
  studentId: string,
  input: { amount: number; method: PaymentMethod },
  file: File,
): Promise<void> {
  if (!(input.amount > 0)) throw new Error('اكتب مبلغ التحويل زي ما هو في اللقطة.')
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
    throw new Error('ماقدرناش نرفع الصورة — اتأكد من النت وحاول تاني.')
  }

  const { error: confErr } = await supa.rpc('portal_confirm_payment_proof', {
    p_token: rawToken,
    p_proof_id: created.proof_id,
  })
  if (confErr) {
    throw new Error(
      'الصورة اترفعت لكن تأكيد الإرسال فشل — ابعت الإثبات تاني، ولو اتكررت المشكلة كلّم المدرس.',
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
  kind: 'arrived' | 'left'
  event_at: string
  read_at: string | null
  session_date: string
  start_time: string
  group_name: string
}

export interface PortalNotificationsResult {
  notifications: PortalNotification[]
  unread_count: number
}

function notificationErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (msg.includes('invalid or expired') || msg.includes('not authorized') || msg.includes('token not valid')) {
    return 'رابط البوابة منتهي أو مش صالح — اطلب من المدرس رابط جديد.'
  }
  return 'ماقدرناش نحمّل التنبيهات — اتأكد من النت وحاول تاني.'
}

/** تنبيهات وصل/غادر طالب الرابط + عدّاد غير المقروء — عبر RPC بالتوكن فقط */
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
    p_ids: ids ?? null,
  })
  if (error) throw new Error(notificationErrorMessage(error))
  const raw = (data ?? {}) as unknown as { unread_count?: number }
  return Number(raw.unread_count) || 0
}

/** شارات نوع التنبيه في البوابة — وصل/غادر بألوان مضمونة التباين */
export const PORTAL_NOTIF_META: Record<
  PortalNotification['kind'],
  { label: string; badge: string }
> = {
  arrived: { label: 'وصل', badge: 'bg-ok-soft text-ok-text border-ok/30' },
  left: { label: 'غادر', badge: 'bg-soft text-primary border-primary/30' },
}

/** حالات الحضور الأربع في البوابة (§2.4) — الاسم وشارة اللون */
export const PORTAL_ATT_META: Record<string, { label: string; badge: string }> = {
  p: { label: 'حاضر', badge: 'bg-ok/10 text-ok border-ok/30' },
  a: { label: 'غائب', badge: 'bg-bad/10 text-bad border-bad/30' },
  l: { label: 'متأخر', badge: 'bg-warn/15 text-warn border-warn/40' },
  m: { label: 'تعويضية', badge: 'bg-soft text-primary border-primary/30' },
}
