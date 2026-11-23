import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import { waLink } from '../../lib/format'
import {
  GUARDIAN_SECTION_KEYS,
  STUDENT_SECTION_KEYS,
  clampTtlDays,
  type GuardianSectionKey,
  type StudentSectionKey,
} from './tokenLifecycle'
import type { TeacherSettingsRow } from '../../types/database'

// ===========================================================================
// حسابات دخول البوابات الحقيقية (3A-385 — هجرات 0040/0041/0042).
//
// نموذج الأمان كما صُمم خادمياً ولا يضعفه العميل:
// • كلمة السر لا تُهشّ إلا في القاعدة (bcrypt داخل RPC) — العميل
//   يرسلها نصاً عبر اتصال Supabase المشفّر إلى الـ RPC فقط، ولا
//   يحفظها في أي تخزين أو كاش.
// • توكن الجلسة الخام (90 يوماً) يُحفظ في localStorage لهذا المتصفح
//   فقط — القاعدة فيها SHA-256 hash فقط، وإبطاله من المدرس أو خروج
//   صاحبه يقتله خادمياً فوراً. التوكن الخام للرابط لا يُحفظ هنا
//   إطلاقاً (يبقى في الرابط وحالة الصفحة كما كان دائماً).
// • اسم الدخول يُشتق خادمياً (هاتف ولي الأمر المطبّع / كود الطالب
//   العام) — دوال التطبيع هنا للعرض والتحقق المبكر فقط، والخادم هو
//   الحَكَم عند أي اختلاف.
// ===========================================================================

export type PortalAccountRole = 'guardian' | 'student'

export interface PortalSessionStudent {
  id: string
  name: string
  code: string
}

export interface PortalLoginResult {
  session_token: string
  role: PortalAccountRole
  username: string
  teacher_id: string
  student_id: string | null
  students: PortalSessionStudent[]
}

export type PortalSessionInfo = Omit<PortalLoginResult, 'session_token'>

// ---------------------------------------------------------------------------
// دوال نقية — تطبيع اسم الدخول وتحقق كلمة السر (مرآة لقواعد الخادم)
// ---------------------------------------------------------------------------

/**
 * تطبيع هاتف لصيغة اسم الدخول المحلية — مرآة حرفية لـ portal_norm_phone
 * في 0041: أرقام فقط، والبادئة الدولية المصرية (0020 أو 20 مع 12 رقماً)
 * ترجع للصيغة المحلية التي تبدأ بـ 0.
 */
export function normalizePhoneDigits(phone: string): string {
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('0020')) d = `0${d.slice(4)}`
  else if (d.startsWith('20') && d.length === 12) d = `0${d.slice(2)}`
  return d
}

/** تطبيع كود طالب لاسم دخول: قصّ + أحرف كبيرة (أكواد public_code لاتينية) */
export function normalizeStudentCode(code: string): string {
  return code.trim().toUpperCase()
}

/** مشكلة كلمة سر البوابة أو null — نفس حدود الخادم في 0041 (6..72 حرفاً) */
export function portalPasswordProblem(password: string): 'too-short' | 'too-long' | null {
  if (password.length < 6) return 'too-short'
  if (password.length > 72) return 'too-long'
  return null
}

// ---------------------------------------------------------------------------
// جهة البوابة العامة — الدخول والجلسات (anon + RPC فقط)
// ---------------------------------------------------------------------------

/** دخول باسم مستخدم وكلمة سر ← جلسة جديدة. أخطاء الخادم العامة تُرجم في الواجهة */
export async function portalLogin(username: string, password: string): Promise<PortalLoginResult> {
  const { data, error } = await db().rpc('portal_login', {
    p_username: username,
    p_password: password,
  })
  if (error) throw error
  // فشل الاعتماد يعود داخل النطاق {error} لا كاستثناء (0043 — حتى
  // يصمد تحديث عدّاد المحاولات)؛ نحوّله هنا لاستثناء بنفس الرسالة
  // العامة حتى تتعامل الواجهة مع كل الفشل بشكل واحد.
  const res = data as unknown as PortalLoginResult & { error?: string }
  if (res && typeof res === 'object' && typeof res.error === 'string') {
    throw new Error(res.error)
  }
  return res
}

/** طلاب جلسة قائمة — لإعادة فتح البوابة على جهاز سجّل دخوله من قبل */
export async function portalSessionStudents(sessionToken: string): Promise<PortalSessionInfo> {
  const { data, error } = await db().rpc('portal_session_students', {
    p_session_token: sessionToken,
  })
  if (error) throw error
  return data as unknown as PortalSessionInfo
}

/**
 * خروج: إبطال الجلسة خادمياً. أفضل جهد مقصود — فشل الشبكة لا يمنع
 * مسح التوكن محلياً (ينتهي وحده بعد 90 يوماً كحد أقصى).
 */
export async function portalLogout(sessionToken: string): Promise<void> {
  try {
    await db().rpc('portal_logout', { p_session_token: sessionToken })
  } catch {
    // مقصود: الخروج المحلي يتم على أي حال — انظر التعليق أعلاه
  }
}

/** إنشاء كلمة سر لولي الأمر من داخل بوابته عند الوصول برابط صالح */
export async function portalClaimGuardian(
  rawToken: string,
  studentId: string,
  password: string,
): Promise<{ username: string }> {
  const { data, error } = await db().rpc('portal_account_claim_guardian', {
    p_token: rawToken,
    p_student_id: studentId,
    p_password: password,
  })
  if (error) throw error
  return data as unknown as { username: string }
}

/** إنشاء كلمة سر للطالب من داخل بوابته عند الوصول برابط صالح */
export async function portalClaimStudent(
  rawToken: string,
  password: string,
): Promise<{ username: string }> {
  const { data, error } = await db().rpc('portal_account_claim_student', {
    p_token: rawToken,
    p_password: password,
  })
  if (error) throw error
  return data as unknown as { username: string }
}

/** تغيير كلمة السر بجلسة قائمة (يتحقق من القديمة ويبطل باقي الجلسات) */
export async function portalChangePassword(
  sessionToken: string,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  const { error } = await db().rpc('portal_account_change_password', {
    p_session_token: sessionToken,
    p_old_password: oldPassword,
    p_new_password: newPassword,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// تخزين توكن الجلسة على هذا المتصفح (localStorage) — منفصل لكل بوابة
// ---------------------------------------------------------------------------

const SESSION_KEYS: Record<PortalAccountRole, string> = {
  guardian: 'portal.session.guardian',
  student: 'portal.session.student',
}

export function loadPortalSessionToken(role: PortalAccountRole): string | null {
  try {
    return window.localStorage.getItem(SESSION_KEYS[role])
  } catch {
    // وضع تصفح خاص/متصفح يمنع التخزين: البوابة تعمل بالرابط فقط
    return null
  }
}

export function savePortalSessionToken(role: PortalAccountRole, token: string): void {
  try {
    window.localStorage.setItem(SESSION_KEYS[role], token)
  } catch {
    // مقصود: فشل الحفظ يعني إعادة الدخول في الزيارة القادمة فقط
  }
}

export function clearPortalSessionToken(role: PortalAccountRole): void {
  try {
    window.localStorage.removeItem(SESSION_KEYS[role])
  } catch {
    // مقصود: لا شيء يُمسح إن منع المتصفح الوصول للتخزين أصلاً
  }
}

// ---------------------------------------------------------------------------
// جهة المدرس — إدارة الحسابات (جلسة مصادقة؛ RLS مالك فقط على الجدول،
// وكلمة السر لا تُقرأ أبداً: قائمة الأعمدة بلا password_hash عمداً)
// ---------------------------------------------------------------------------

export interface PortalAccountRow {
  id: string
  teacher_id: string
  student_id: string | null
  guardian_id: string | null
  role: PortalAccountRole
  username: string
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

const ACCOUNT_COLS =
  'id, teacher_id, student_id, guardian_id, role, username, is_active, last_login_at, created_at'

/** كل حسابات بوابات المدرس (بلا أي عمود سرّي — انظر الترويسة) */
export async function fetchPortalAccounts(teacherId: string): Promise<PortalAccountRow[]> {
  const { data, error } = await db()
    .from('portal_accounts')
    .select(ACCOUNT_COLS)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as PortalAccountRow[]
}

/** ولي أمر الطالب المرتبط (أول ارتباط) — لعرض/إدارة حسابه من شيت الطالب */
export async function fetchGuardianIdForStudent(
  teacherId: string,
  studentId: string,
): Promise<string | null> {
  const { data, error } = await db()
    .from('guardian_students')
    .select('guardian_id')
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.guardian_id ?? null
}

/** إنشاء حساب أو إعادة ضبط كلمة سره — اسم الدخول يُشتق خادمياً ويعود في الرد */
export async function upsertPortalAccount(
  teacherId: string,
  role: PortalAccountRole,
  targetId: string,
  password: string,
): Promise<{ account_id: string; username: string; role: PortalAccountRole }> {
  const { data, error } = await db().rpc('portal_account_upsert', {
    p_teacher_id: teacherId,
    p_role: role,
    p_target_id: targetId,
    p_password: password,
  })
  if (error) throw error
  return data as unknown as { account_id: string; username: string; role: PortalAccountRole }
}

/** تفعيل/تعطيل حساب — التعطيل يبطل جلساته خادمياً فوراً */
export async function setPortalAccountActive(accountId: string, active: boolean): Promise<void> {
  const { error } = await db().rpc('portal_account_set_active', {
    p_account_id: accountId,
    p_active: active,
  })
  if (error) throw error
}

/** إبطال كل جلسات حساب (خروج من كل الأجهزة) دون لمس كلمة السر */
export async function revokePortalAccountSessions(accountId: string): Promise<void> {
  const { error } = await db().rpc('portal_account_revoke_sessions', {
    p_account_id: accountId,
  })
  if (error) throw error
}

/**
 * رسالة واتساب ببيانات الدخول بعد تعيينها مباشرة — كلمة السر هنا هي
 * التي كتبها المدرس للتو في النموذج (لا تُقرأ من أي مكان ولا تُحفظ).
 */
export function portalCredentialsWaUrl(
  phone: string | null,
  input: { username: string; password: string; role: PortalAccountRole; portalUrl: string },
): string | null {
  const base = waLink(phone)
  if (!base) return null
  const msg = t(
    input.role === 'guardian' ? 'portal.apiCredentialsWaGuardian' : 'portal.apiCredentialsWaStudent',
    { username: input.username, password: input.password, url: input.portalUrl },
  )
  return `${base}?text=${encodeURIComponent(msg)}`
}

// ---------------------------------------------------------------------------
// إعدادات دخول البوابات عند المدرس (teacher_settings — أعمدة 0037):
// مدة الرابط الافتراضية + أقسام كل بوابة الظاهرة.
// ---------------------------------------------------------------------------

export interface PortalAccessSettings {
  ttlDays: number
  guardian: Record<GuardianSectionKey, boolean>
  student: Record<StudentSectionKey, boolean>
}

type SettingsPortalCols = Pick<
  TeacherSettingsRow,
  | 'portal_link_ttl_days'
  | 'portal_guardian_show_attendance'
  | 'portal_guardian_show_scores'
  | 'portal_guardian_show_notes'
  | 'portal_guardian_show_money'
  | 'portal_guardian_show_groups'
  | 'portal_student_show_schedule'
  | 'portal_student_show_homework'
  | 'portal_student_show_grades'
  | 'portal_student_show_money'
>

const ACCESS_COLS =
  'portal_link_ttl_days, portal_guardian_show_attendance, portal_guardian_show_scores, portal_guardian_show_notes, portal_guardian_show_money, portal_guardian_show_groups, portal_student_show_schedule, portal_student_show_homework, portal_student_show_grades, portal_student_show_money'

const GUARDIAN_FLAG_COLS: Record<GuardianSectionKey, keyof SettingsPortalCols> = {
  attendance: 'portal_guardian_show_attendance',
  scores: 'portal_guardian_show_scores',
  notes: 'portal_guardian_show_notes',
  money: 'portal_guardian_show_money',
  groups: 'portal_guardian_show_groups',
}

const STUDENT_FLAG_COLS: Record<StudentSectionKey, keyof SettingsPortalCols> = {
  schedule: 'portal_student_show_schedule',
  homework: 'portal_student_show_homework',
  grades: 'portal_student_show_grades',
  money: 'portal_student_show_money',
}

/** تحويل صف إعدادات (أو غيابه) لشكل الواجهة — الغائب/الشاذ = الافتراضي الآمن (ظاهر/30) */
export function accessSettingsFromRow(row: Partial<SettingsPortalCols> | null): PortalAccessSettings {
  const guardian = {} as Record<GuardianSectionKey, boolean>
  for (const k of GUARDIAN_SECTION_KEYS) guardian[k] = row?.[GUARDIAN_FLAG_COLS[k]] !== false
  const student = {} as Record<StudentSectionKey, boolean>
  for (const k of STUDENT_SECTION_KEYS) student[k] = row?.[STUDENT_FLAG_COLS[k]] !== false
  return { ttlDays: clampTtlDays(row?.portal_link_ttl_days ?? undefined), guardian, student }
}

/** تحويل شكل الواجهة لأعمدة التحديث — المدة تُضبط قبل الحفظ دائماً */
export function accessSettingsToColumns(s: PortalAccessSettings): SettingsPortalCols {
  return {
    portal_link_ttl_days: clampTtlDays(s.ttlDays),
    portal_guardian_show_attendance: s.guardian.attendance,
    portal_guardian_show_scores: s.guardian.scores,
    portal_guardian_show_notes: s.guardian.notes,
    portal_guardian_show_money: s.guardian.money,
    portal_guardian_show_groups: s.guardian.groups,
    portal_student_show_schedule: s.student.schedule,
    portal_student_show_homework: s.student.homework,
    portal_student_show_grades: s.student.grades,
    portal_student_show_money: s.student.money,
  }
}

/** قراءة إعدادات دخول البوابات للمدرس الحالي (صف إعداداته الوحيد) */
export async function fetchPortalAccessSettings(teacherId: string): Promise<PortalAccessSettings> {
  const { data, error } = await db()
    .from('teacher_settings')
    .select(ACCESS_COLS)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (error) throw error
  return accessSettingsFromRow((data ?? null) as unknown as Partial<SettingsPortalCols> | null)
}

/** حفظ إعدادات دخول البوابات كاملة (نموذج البطاقة يرسل الشكل كله) */
export async function updatePortalAccessSettings(
  teacherId: string,
  settings: PortalAccessSettings,
): Promise<void> {
  const { error } = await db()
    .from('teacher_settings')
    .update(accessSettingsToColumns(settings))
    .eq('teacher_id', teacherId)
  if (error) throw error
}
