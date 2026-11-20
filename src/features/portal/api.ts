import { supabase } from '../../lib/supabase'
import { waLink } from '../../lib/format'
import type {
  GuardianAccessTokenRow,
  GuardianRow,
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

/** عرض البوابة كما يعيده portal_build_overview حرفياً — حقول محدودة بالتصميم */
export interface PortalOverview {
  student: { name: string; code: string; grade: string | null }
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
  const raw = data as unknown as PortalOverview
  return {
    student: raw.student,
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

/** حالات الحضور الأربع في البوابة (§2.4) — الاسم وشارة اللون */
export const PORTAL_ATT_META: Record<string, { label: string; badge: string }> = {
  p: { label: 'حاضر', badge: 'bg-ok/10 text-ok border-ok/30' },
  a: { label: 'غائب', badge: 'bg-bad/10 text-bad border-bad/30' },
  l: { label: 'متأخر', badge: 'bg-warn/15 text-warn border-warn/40' },
  m: { label: 'تعويضية', badge: 'bg-soft text-primary border-primary/30' },
}
