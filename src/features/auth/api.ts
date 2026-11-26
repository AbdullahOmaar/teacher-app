import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import type { Tables, TeacherMemberRow, TeacherRow, TeacherSettingsRow } from '../../types/database'
import { logActivity } from '../activity/api'

/**
 * هل رسالة الخادم من فئة «عميل قديم»؟ (3A-903): رفض بسبب مفتاح API —
 * مفتاح تراثي معطّل (صيغة GoTrue عند تعطيل المفاتيح القديمة:
 * «Legacy API keys are disabled»)، أو مفتاح غير صالح/ملغي، أو غياب
 * المفتاح من الطلب أصلاً. كلها تعني شيئاً واحداً للمستخدم: النسخة
 * التي بين يديه أقدم من هجرة المفاتيح، وحلّها التحديث لا إعادة المحاولة.
 */
export function isStaleClientError(message: string): boolean {
  const m = message.toLowerCase()
  if (m.includes('legacy api keys')) return true
  if (m.includes('no api key found')) return true
  const mentionsKey = m.includes('api key') || m.includes('apikey')
  const rejected = m.includes('invalid') || m.includes('disabled') || m.includes('revoked')
  return mentionsKey && rejected
}

/** ترجمة أخطاء Supabase Auth الشائعة لرسائل عربية واضحة */
export function translateAuthError(message: string): string {
  const m = message.toLowerCase()
  // فئة «عميل قديم» أولاً (3A-903 — تصعيد المالك 2026-11-26 ~18:27):
  // الخادم يرد بنص إنجليزي خام، وقاعدة المالك (18:06) أن لا نص خام
  // يصل للمستخدم أبداً — الرسالة المصممة تسمّي المشكلة وحلّها.
  if (isStaleClientError(m))
    return `${t('auth.errStaleVersion')} ${t('auth.errStaleVersionHint')}`
  if (m.includes('invalid login credentials')) return t('auth.authApiInvalidCredentials')
  if (m.includes('already registered') || m.includes('already exists'))
    return t('auth.authApiAlreadyRegistered')
  if (m.includes('email not confirmed'))
    return t('auth.errEmailNotConfirmed')
  // أخطاء مسار الهاتف/OTP (P5-3): صيغة الرقم، فشل الإرسال عبر الـ Hook،
  // وكود منتهٍ أو غير صحيح عند التحقق
  if (m.includes('invalid phone number') || m.includes('phone number format'))
    return t('auth.errInvalidPhone')
  if (m.includes('expired or is invalid')) return t('auth.errOtpInvalid')
  if (m.includes('token has expired') || m.includes('otp expired'))
    return t('auth.errOtpExpired')
  if (m.includes('sending') && m.includes('sms')) return t('auth.errOtpSendFailed')
  // رقم غير مربوط بأي حساب (shouldCreateUser=false في نموذج 0026):
  // لا حسابات تُنشأ من مسار الهاتف إطلاقاً
  if (m.includes('signups not allowed')) return t('auth.errPhoneNotLinked')
  if (m.includes('password should be at least')) return t('auth.passwordTooShort')
  if (m.includes('for security purposes'))
    return t('auth.authApiSecurityWait') // حد تكرار البريد (60 ثانية)
  if (m.includes('weak password') || m.includes('password is too weak'))
    return t('auth.authApiWeakPassword')
  if (m.includes('invalid email') || m.includes('unable to validate email'))
    return t('auth.authApiInvalidEmail')
  if (m.includes('rate limit') || m.includes('too many requests'))
    return t('auth.authApiRateLimited')
  if (m.includes('network') || m.includes('fetch'))
    return t('auth.authApiNetworkError')
  // احتياطي آمن (قاعدة المالك 2026-11-26 ~18:06 + 3A-903): خطأ غير
  // معروف يرجع لرسالة عامة مهذبة — نص الخادم الخام لا يصل للمستخدم
  // أبداً، أياً كانت صيغته.
  return t('auth.authApiUnexpected')
}

/** ترجمة أخطاء قاعدة البيانات (قيود/RLS) لرسائل عربية */
export function translateDbError(error: { code?: string; message?: string }): string {
  const code = error.code ?? ''
  const msg = error.message ?? ''
  if (code === '23505') return t('auth.authApiDbDuplicate')
  if (code === '23503')
    return t('auth.authApiDbMissingRelated')
  if (code === '42501' || msg.toLowerCase().includes('row-level security'))
    return t('auth.authApiDbForbidden')
  // نفس قاعدة عدم النص الخام (3A-903): كود/رسالة غير معروفين يرجعان
  // للعام المهذب — رسالة PostgREST الخام لا تظهر للمستخدم أبداً.
  return t('auth.authApiDbUnexpected')
}

// ---------------------------------------------------------------------------
// Supabase Auth — بريد + كلمة مرور
// ---------------------------------------------------------------------------

export interface SignUpInput {
  email: string
  password: string
  displayName: string
  phone?: string
}

export interface SignUpResult {
  /** true إن وُجدت جلسة فوراً (تأكيد البريد غير مطلوب) */
  hasSession: boolean
  userId: string | null
}

export async function signUpWithEmail(input: SignUpInput): Promise<SignUpResult> {
  const { data, error } = await db().auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      // رابط التأكيد يرجع لصفحة الدخول في نفس الأصل (ضمن uri_allow_list) —
      // منذ 3A-904 قالب التأكيد كود فقط فلا رابط يُرسل أصلاً، ويبقى
      // المعامل لهبوط أي إيميلات أقدم من قلب القوالب
      emailRedirectTo: `${window.location.origin}/login`,
      data: {
        display_name: input.displayName.trim(),
        phone: input.phone?.trim() || null,
      },
    },
  })
  if (error) throw new Error(translateAuthError(error.message))
  // Supabase يرجع مستخدماً بلا جلسة عند تفعيل تأكيد البريد،
  // ويرجع identities فارغة عند تكرار بريد مسجل أصلاً
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    throw new Error(t('auth.authApiAlreadyRegistered'))
  }
  return { hasSession: Boolean(data.session), userId: data.user?.id ?? null }
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await db().auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw new Error(translateAuthError(error.message))
}

/**
 * إعادة إرسال رسالة تأكيد البريد (SEC-1 — مسار إغلاق autoconfirm):
 * لازمة بعد تفعيل تأكيد البريد حتى لا يعلق مستخدم لم تصله الرسالة.
 * حد الإرسال من الخادم: رسالة كل 60 ثانية وحد إرسال البريد العام.
 */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await db().auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: `${window.location.origin}/login` },
  })
  if (error) throw new Error(translateAuthError(error.message))
}

/**
 * طلب استعادة كلمة المرور (SEC-5 جزئي — لم يكن موجوداً أصلاً):
 * يرسل كود استعادة بالبريد (قالب كود فقط منذ 3A-904) يُدخَل في
 * صفحة /reset-password فتنشئ جلسة الاستعادة بالتحقق منه؛ معامل
 * redirectTo يبقى لهبوط روابط الإيميلات الأقدم من قلب القوالب.
 * الرد محايد دائماً من الخادم (لا يكشف تسجيل البريد).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await db().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) throw new Error(translateAuthError(error.message))
}

/**
 * تأكيد بريد التسجيل بكود OTP (3A-904 — قالب التأكيد صار كوداً فقط
 * بلا أي رابط): verifyOtp بنوع signup يفعّل الحساب ويصدر الجلسة
 * فوراً، فيكمل المتصل عقد ما بعد التسجيل (ادعاء دعوات/إنشاء ملف)
 * كما في مسار الجلسة الفورية تماماً. هبوط روابط إيميلات سابقة للقلب
 * يبقى شغالاً بالتوازي (جلسة من مقطع الرابط) حتى تنتهي طبيعياً.
 */
export async function confirmSignUpWithCode(
  email: string,
  token: string,
): Promise<{ userId: string | null }> {
  const { data, error } = await db().auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'signup',
  })
  if (error) throw new Error(translateAuthError(error.message))
  return { userId: data.user?.id ?? null }
}

/**
 * تأكيد كود استعادة كلمة المرور (3A-904): verifyOtp بنوع recovery
 * ينشئ جلسة الاستعادة نفسها التي كان ينشئها رابط البريد، فتعرض
 * صفحة /reset-password نموذج تعيين كلمة جديدة داخل الجلسة.
 */
export async function confirmRecoveryWithCode(email: string, token: string): Promise<void> {
  const { error } = await db().auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'recovery',
  })
  if (error) throw new Error(translateAuthError(error.message))
}

/** لقطة مستخدم Auth التي تحتاجها بطاقة تأكيد البريد في الإعدادات */
export interface AuthUserSnapshot {
  email: string | null
  email_confirmed_at: string | null
}

/**
 * قراءة مستخدم Auth الطازج من الخادم (getUser) — بطاقة تأكيد البريد
 * في الإعدادات لا تثق بنسخة الجلسة المحلية وحدها: التأكيد قد يكون
 * حدث من جهاز/متصفح آخر فتبقى النسخة المحلية «غير مؤكَّد» كذباً.
 * مصير فشل القراءة صريح: null، والمتصل يسقط لنسخة الجلسة.
 */
export async function fetchAuthUser(): Promise<AuthUserSnapshot | null> {
  const { data, error } = await db().auth.getUser()
  if (error || !data.user) return null
  return {
    email: data.user.email ?? null,
    email_confirmed_at: data.user.email_confirmed_at ?? null,
  }
}

/**
 * هل بريد المستخدم غير مؤكَّد بعد؟ (3A-904): مصدر الحقيقة هو
 * email_confirmed_at عند GoTrue؛ غيابه أو فراغه = لم يُؤكَّد. بلا
 * مستخدم أصلاً = false (لا بطاقة ولا مطالبة). البطاقة في الإعدادات
 * هي مسار إكمال التحقق المطلوب للحسابات غير المؤكَّدة متى كان نظام
 * التأكيد مفعّلاً من إدارة المنصة.
 */
export function isEmailUnconfirmed(
  user: { email_confirmed_at?: string | null } | null | undefined,
): boolean {
  if (!user) return false
  return !user.email_confirmed_at
}

/**
 * قرار شاشة ما بعد التسجيل (3A-904 — نموذج التأكيد بتصحيح المالك
 * 2026-11-26 ~17:19): نظام التأكيد مطفأ افتراضياً فيدخل المسجّل
 * فوراً (جلسة فورية أو دخول فوري ناجح بنفس البيانات) → 'enter'
 * فيكمل عقد ما بعد التسجيل؛ ومتى فعّلته إدارة المنصة يرفض الخادم
 * دخول غير المؤكَّدين فتسقط المحاولة → 'code' وتظهر شاشة إدخال
 * الكود إلزامية بلا أي تخطٍّ. لا طريق مسدود في أي حالة.
 */
export function signUpNextStep(
  hasSession: boolean,
  instantSignInOk: boolean,
): 'enter' | 'code' {
  return hasSession || instantSignInOk ? 'enter' : 'code'
}

// ---------------------------------------------------------------------------
// Supabase Auth — رقم الهاتف + OTP عبر واتساب (P5-3 / 3A-300)
// GoTrue يولّد الكود ويتحقق منه ويصدر الجلسة؛ التوصيل يتم عبر Send SMS
// Hook عندنا (دالة send-whatsapp-otp) بقالب Authentication على واتساب.
//
// النموذج الاختياري per-teacher (قرار 2026-11-21 ~12:25 — التصميم §٢/§٦):
// الإرسال يتم بأصول المدرس نفسه بعد حلّ قناته من user.id، فالدخول
// بالهاتف قناة لحساب قائم ربط رقمه من إعداداته (requestPhoneLink /
// confirmPhoneLink أدناه) وفعّل واتسابه. signInWithOtp برقم غير مربوط
// كان سينشئ حساب هاتف منفصلاً — والـ Hook يرفضه مضبوطاً قبل أي إرسال
// لأن المستخدم المؤقت لا يملك سنتراً ولا إعداداً (لا حسابات شبحية).
// إنشاء الحساب الأول يبقى بالبريد دائماً. الواجهة خلف علم العميل
// VITE_WHATSAPP_OTP_ENABLED — انظر lib/phone.ts والتصميم.
// ---------------------------------------------------------------------------

/**
 * طلب كود تحقق للرقم (E.164) — يُرسل عبر واتساب بقناة الـ Hook.
 * shouldCreateUser=false عمداً في النموذج الاختياري: مسار الهاتف
 * للدخول فقط لحساب قائم ربط رقمه من إعداداته؛ أي رقم غير مربوط
 * يرفضه GoTrue قبل الـ Hook أصلاً، فلا تُنشأ حسابات هاتف شبحية.
 */
export async function requestPhoneOtp(phoneE164: string): Promise<void> {
  const { error } = await db().auth.signInWithOtp({
    phone: phoneE164,
    options: { shouldCreateUser: false },
  })
  if (error) throw new Error(translateAuthError(error.message))
}

/** التحقق من الكود وإصدار الجلسة — يعيد معرّف المستخدم الجديد/القائم */
export async function verifyPhoneOtp(
  phoneE164: string,
  token: string,
): Promise<{ userId: string | null }> {
  const { data, error } = await db().auth.verifyOtp({
    phone: phoneE164,
    token: token.trim(),
    type: 'sms',
  })
  if (error) throw new Error(translateAuthError(error.message))
  return { userId: data.user?.id ?? null }
}

/**
 * ربط رقم هاتف بالحساب القائم (من إعدادات «واتساب» — تسلسل التهيئة
 * §٦-٩ في التصميم): updateUser يطلب كود تأكيد عبر نفس Send SMS Hook،
 * فيصله الكود من واتسابه المفعّل هو، وبالتأكيد يصير الرقم عامل هوية
 * ثانياً لنفس الحساب — وبعده فقط يعمل الدخول بالهاتف.
 */
export async function requestPhoneLink(phoneE164: string): Promise<void> {
  const { error } = await db().auth.updateUser({ phone: phoneE164 })
  if (error) throw new Error(translateAuthError(error.message))
}

/** تأكيد كود ربط الهاتف (نوع phone_change) — يكمل الربط لنفس الحساب */
export async function confirmPhoneLink(phoneE164: string, code: string): Promise<void> {
  const { error } = await db().auth.verifyOtp({
    phone: phoneE164,
    token: code.trim(),
    type: 'phone_change',
  })
  if (error) throw new Error(translateAuthError(error.message))
}

/** تعيين كلمة مرور جديدة داخل جلسة الاستعادة (أو من داخل الحساب) */
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await db().auth.updateUser({ password: newPassword })
  if (error) throw new Error(translateAuthError(error.message))
}

// ---------------------------------------------------------------------------
// الحساب التجريبي — حساب مدرس مشترك هدفه تجربة التطبيق فوراً بدون تسجيل.
// بياناته معلنة عمداً (زرار ثابت في صفحة الدخول)، وبياناته معزولة بـ RLS
// عن أي مدرس حقيقي. لا تُدخل فيه بيانات حقيقية أبداً.
// ---------------------------------------------------------------------------

export const DEMO_EMAIL = 'demo@teacher-app.com'
const DEMO_PASSWORD = 'Demo123456'

export async function signInDemo(): Promise<void> {
  await signInWithEmail(DEMO_EMAIL, DEMO_PASSWORD)
}

// ---------------------------------------------------------------------------
// Onboarding — إنشاء صف المدرس + إعداداته الافتراضية
// المخطط 0001_init.sql لا يحتوي أي trigger على auth.users ينشئ صف teachers،
// فالإنشاء يتم من العميل: insert بملكية المستخدم الحالي فقط، وهو ما تسمح
// به سياسات RLS حرفياً (teachers_self_insert: owner_user_id = auth.uid()
// منذ 0016، والسنتر الأساسي يحتفظ بـ id = uid، وsettings_owner_all عبر
// is_teacher_owner). الدالة آمنة التكرار.
// ---------------------------------------------------------------------------

export const TEACHER_COLS_BASE =
  'id, owner_user_id, display_name, avatar_url, phone, created_at, updated_at'
export const TEACHER_COLS = `${TEACHER_COLS_BASE}, account_activated`

/**
 * قراءة متسامحة لعمود account_activated (مهاجرة 0055، بوابة التجميد):
 * على قاعدة بلا المهاجرة يرفض PostgREST الـ select بـ PGRST204 —
 * نرجع لقائمة الأعمدة القديمة ونملأ الافتراضي true (نفس افتراضي
 * المهاجرة: كل الحسابات القائمة تبقى مفعّلة). لا إنفاذ للعلم في أي
 * مسار بعد، فالرجوع لا يغيّر أي سلوك — والدخول يبقى شغالاً بلا 0055.
 */
export function isMissingAccountActivatedColumn(error: {
  code?: string
  message?: string
} | null): boolean {
  if (!error) return false
  return error.code === 'PGRST204' || (error.message ?? '').includes('account_activated')
}

export function withAccountActivatedDefault<T extends object>(
  row: T,
): T & { account_activated: boolean } {
  return { ...row, account_activated: true }
}

// ---------------------------------------------------------------------------
// قفل التسجيل + قائمة السماح (مهاجرة 0057، بوابة التجميد):
// البوابة تُستدعى قبل signUp (بلا جلسة — الـ RPC منفَّذ لـ anon عمداً
// ويعيد بوليان فقط)، ونقطة الإنفاذ الحقيقية هي RPC إنشاء الملف
// ‏create_teacher_profile_for_self الذي يتحقق ببريد JWT نفسه.
// دالتا 0057 غائبتان قبل تطبيق المهاجرة: الغياب = الوضع الحالي
// (تسجيل مفتوح) فيُرجع للمسار القديم، لا قفل وهمي ولا كسر دخول.
// ---------------------------------------------------------------------------

/** خطأ «الدالة غير موجودة» من PostgREST (42883) = مهاجرة غير مطبّقة بعد */
export function isMissingRpcFunction(error: {
  code?: string
  message?: string
} | null): boolean {
  if (!error) return false
  return (
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    (error.message ?? '').includes('does not exist')
  )
}

/**
 * هل التسجيل الذاتي مسموح لهذا البريد/الهاتف؟ (قبل signUp — بلا جلسة)
 * الدالة غائبة قبل 0057 → مسموح (التسجيل المفتوح الحالي).
 * أي خطأ آخر يصعد كما هو (فشل مغلق: لا تسجيل بلا قرار بوابة).
 */
export async function checkSelfRegistrationAllowed(
  email: string,
  phone?: string | null,
): Promise<boolean> {
  const { data, error } = await db().rpc('can_self_register', {
    p_email: email.trim(),
    p_phone: phone?.trim() || '',
  })
  if (error) {
    if (isMissingRpcFunction(error)) return true
    throw new Error(translateDbError(error))
  }
  return data === true
}

/**
 * إنشاء ملف المدرس عبر RPC البوابة (0057): يرجع صف المدرس، أو null
 * عندما تكون الدالة غائبة (قبل تطبيق المهاجرة — فيرجع المتصل للمسار
 * القديم). رفض البوابة ('registration closed') يُترجم لرسالة عربية
 * واضحة؛ أي خطأ آخر يصعد كما هو — لا رجوع صامت للمسار القديم عند
 * رفض صريح، وإلا صار القفل وهماً.
 */
export async function createTeacherProfileViaRpc(
  displayName: string,
  phone?: string | null,
): Promise<TeacherRow | null> {
  const { data, error } = await db().rpc('create_teacher_profile_for_self', {
    p_display_name: displayName.trim(),
    p_phone: phone?.trim() || '',
  })
  if (error) {
    if (isMissingRpcFunction(error)) return null
    if ((error.message ?? '').includes('registration closed')) {
      throw new Error(t('auth.registrationInviteOnly'))
    }
    throw error
  }
  if (!data || typeof data !== 'object') return null
  return data as unknown as TeacherRow
}
const SETTINGS_COLS =
  'teacher_id, whatsapp_template, center_share_percent, reminder_minutes, theme, brand_name, brand_logo_path, brand_accent, push_daily_digest_enabled, push_daily_digest_time, push_daily_digest_last_sent_on, mascot_accessory, show_mascot, portal_link_ttl_days, portal_guardian_show_attendance, portal_guardian_show_scores, portal_guardian_show_notes, portal_guardian_show_money, portal_guardian_show_groups, portal_student_show_schedule, portal_student_show_homework, portal_student_show_grades, portal_student_show_money, last_export_at, created_at, updated_at, print_font'
const MEMBER_COLS =
  'id, teacher_id, user_id, invited_email, role, permissions, status, created_at, updated_at'

/**
 * صف عضو من العميل الم typed: ‏permissions jsonb شكله خريطة صلاحيات
 * بتصميم كاتبه الوحيد — التضييق الموثّق في types/database.ts يتحقق هنا.
 */
export function toMemberRow(r: Tables<'teacher_members'>): TeacherMemberRow {
  return { ...r, permissions: r.permissions as Record<string, unknown> }
}

async function fetchOwnTeacher(userId: string): Promise<TeacherRow | null> {
  const { data, error } = await db()
    .from('teachers')
    .select(TEACHER_COLS)
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    if (isMissingAccountActivatedColumn(error)) {
      const retry = await db()
        .from('teachers')
        .select(TEACHER_COLS_BASE)
        .eq('id', userId)
        .maybeSingle()
      if (retry.error) throw retry.error
      return retry.data ? withAccountActivatedDefault(retry.data) : null
    }
    throw error
  }
  return data ?? null
}

export async function ensureTeacherProfile(
  userId: string,
  displayName: string,
  phone?: string | null,
): Promise<TeacherRow> {
  const client = db()
  // المسار الأول: RPC البوابة (0057) — ينشئ الملف غير مفعّل ويرفض
  // المسجّل المرفوض خادمياً؛ غياب الدالة قبل تطبيق المهاجرة يرجع
  // null فيسقط للمسار القديم أدناه (التسجيل المفتوح الحالي).
  const viaRpc = await createTeacherProfileViaRpc(displayName, phone)
  if (viaRpc) return viaRpc
  const existing = await fetchOwnTeacher(userId)
  if (!existing) {
    const { error } = await client.from('teachers').insert({
      id: userId,
      owner_user_id: userId,
      display_name: displayName.trim(),
      phone: phone?.trim() || null,
    })
    // 23505 = أنشأه طلب متزامن آخر — نتجاهله ونكمل
    if (error && error.code !== '23505') {
      throw new Error(translateDbError(error))
    }
  }
  // صف الإعدادات الافتراضي: بقية الأعمدة لها defaults في المخطط
  const { error: sErr } = await client
    .from('teacher_settings')
    .upsert({ teacher_id: userId }, { onConflict: 'teacher_id', ignoreDuplicates: true })
  if (sErr) throw new Error(translateDbError(sErr))

  const teacher = await fetchOwnTeacher(userId)
  if (!teacher) throw new Error(t('auth.authApiTeacherProfileFailed'))
  return teacher
}

export async function updateOwnTeacherProfile(
  teacherId: string,
  input: { display_name: string; phone: string | null; avatar_url?: string | null },
): Promise<void> {
  const patch: { display_name: string; phone: string | null; avatar_url?: string | null } = {
    display_name: input.display_name.trim(),
    phone: input.phone,
  }
  // avatar_url اختياري في النداء: لا يُمسّ إلا عندما يمرّره النموذج صراحة
  if ('avatar_url' in input) patch.avatar_url = input.avatar_url
  const { error } = await db().from('teachers').update(patch).eq('id', teacherId)
  if (error) throw new Error(translateDbError(error))
}

/**
 * إنشاء سنتر إضافي لنفس الحساب (0016): صف teachers جديد بهوية مستقلة
 * (id افتراضي من القاعدة) وowner_user_id = المستخدم الحالي — سياسة
 * teachers_self_insert تشترط ذلك حرفياً. يُنشأ له صف إعدادات افتراضي
 * فوراً (نفس عقد الـ onboarding) حتى تعمل كل الشاشات عليه مباشرة.
 */
export async function createCentre(userId: string, displayName: string): Promise<TeacherRow> {
  const client = db()
  let { data, error } = await client
    .from('teachers')
    .insert({ owner_user_id: userId, display_name: displayName.trim() })
    .select(TEACHER_COLS)
    .single()
  if (error && isMissingAccountActivatedColumn(error)) {
    // الـ insert مع الـ returning يفشل كجملة واحدة — لم يُنشأ صف،
    // فنعيد الإنشاء كاملاً بقائمة الأعمدة القديمة.
    const retry = await client
      .from('teachers')
      .insert({ owner_user_id: userId, display_name: displayName.trim() })
      .select(TEACHER_COLS_BASE)
      .single()
    if (retry.error) throw new Error(translateDbError(retry.error))
    data = withAccountActivatedDefault(retry.data)
    error = null
  }
  if (error) throw new Error(translateDbError(error))
  if (!data) throw new Error(t('auth.authApiTeacherProfileFailed'))
  const centre = data

  const { error: sErr } = await client
    .from('teacher_settings')
    .upsert({ teacher_id: centre.id }, { onConflict: 'teacher_id', ignoreDuplicates: true })
  if (sErr) throw new Error(translateDbError(sErr))

  return centre
}

export async function fetchTeacherSettings(teacherId: string): Promise<TeacherSettingsRow | null> {
  const { data, error } = await db()
    .from('teacher_settings')
    .select(SETTINGS_COLS)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

// ---------------------------------------------------------------------------
// عضويات الفريق — teacher_members
//
// مساران متوازيان لإضافة مساعد، ولا يكسر أيٌّ منهما الآخر:
//
// أ) بالمعرّف (الأصلي من Phase 1): المساعد ينشئ حسابه أولاً، ويشارك
//    «معرّف حسابه» الظاهر في إعداداته، والمدرس يضيفه بهذا المعرّف
//    فتُنشأ العضوية فعّالة مباشرة (status=active) لأن سياسات المساعد
//    تشترط active.
//
// ب) بالبريد (migration ‏0006): المدرس ينشئ صف «دعوة معلّقة»
//    (invited_email مُطبَّع + user_id خالٍ + status=invited) حتى قبل أن
//    يكون للمساعد حساب. الدعوة المعلّقة لا تمنح أي وصول (سياسات
//    المساعد تشترط user_id = auth.uid() وstatus='active'). عند دخول
//    صاحب البريد — بحساب قائم أو جديد — تدّعي دالة
//    claim_teacher_invites (security definer، تطابق بريد JWT فقط)
//    الدعوة تلقائياً: تربط user_id وتفعّل العضوية. الاستدعاء يحدث
//    مرة واحدة لكل جلسة من مسار حلّ الهوية (useCurrentTeacher) ومن
//    تسجيل حساب جديد (LoginPage) قبل إنشاء ملف مدرس خاص، حتى يهبط
//    المساعد المدعو داخل حساب المدرس مباشرة.
//
// الصلاحيات الافتراضية = مفاتيح المخطط التشغيلية كلها مفعّلة
// وcan_view_money مقفلة (المالية محجوبة عن المساعد في RLS أصلاً).
// ---------------------------------------------------------------------------

export const ASSISTANT_DEFAULT_PERMISSIONS: Record<string, boolean> = {
  can_take_attendance: true,
  can_manage_students: true,
  can_manage_groups: true,
  can_manage_grades: true,
  can_view_money: false,
}

export const PERMISSION_LABELS: Record<string, string> = {
  can_take_attendance: t('auth.authPermAttendance'),
  can_manage_students: t('auth.authPermStudents'),
  can_manage_groups: t('auth.authPermGroups'),
  can_manage_grades: t('auth.authPermGrades'),
  can_view_money: t('auth.authPermMoney'),
}


/** أعضاء فريق مدرس (يديرهم المالك بسياسة members_owner_all) */
export async function fetchTeamMembers(teacherId: string): Promise<TeacherMemberRow[]> {
  const { data, error } = await db()
    .from('teacher_members')
    .select(MEMBER_COLS)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toMemberRow)
}

export async function inviteAssistant(
  teacherId: string,
  assistantUserId: string,
  permissions: Record<string, boolean>,
): Promise<TeacherMemberRow> {
  const { data, error } = await db()
    .from('teacher_members')
    .insert({
      teacher_id: teacherId,
      user_id: assistantUserId.trim(),
      role: 'assistant',
      permissions,
      status: 'active',
    })
    .select(MEMBER_COLS)
    .single()
  if (error) {
    if (error.code === '23505') throw new Error(t('auth.authApiAssistantAlreadyAdded'))
    if (error.code === '23503')
      throw new Error(t('auth.authApiAssistantIdNotFound'))
    throw new Error(translateDbError(error))
  }
  const row = toMemberRow(data)
  // سجل النشاط: إضافة مساعد مباشرة بمعرّف حسابه (عضوية فعّالة فوراً)
  void logActivity(teacherId, {
    event_type: 'member_invited',
    entity_type: 'teacher_member',
    entity_id: row.id,
    entity_label: assistantUserId.trim(),
    details: { invited_via: 'user_id', member_user_id: assistantUserId.trim() },
  })
  return row
}

// ---------------------------------------------------------------------------
// الدعوة بالبريد — صفوف معلّقة (user_id خالٍ) يديرها المالك بسياسة
// members_owner_all القائمة، والادعاء عبر RPC فقط.
// ---------------------------------------------------------------------------

/** صيغة بريد مقبولة — نفس نمط قيد القاعدة في 0006 تقريباً */
export const INVITE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** تطبيع بريد الدعوة كما تفرضه القاعدة: قصّ + أحرف صغيرة */
export function normalizeInviteEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * إنشاء دعوة معلّقة ببريد المساعد. الفحوصات الودودة أولاً (بريد عضو
 * قائم / دعوة معلّقة مكررة) برسائل عربية واضحة، والقيد الفريد الجزئي
 * في القاعدة هو الضمان الأخير ضد السباقات (23505 يُترجم لنفس الرسالة).
 */
export async function inviteAssistantByEmail(
  teacherId: string,
  emailRaw: string,
  permissions: Record<string, boolean>,
): Promise<TeacherMemberRow> {
  const email = normalizeInviteEmail(emailRaw)
  if (!INVITE_EMAIL_RE.test(email)) {
    throw new Error(t('auth.authApiInviteEmailInvalid'))
  }

  const { data: existing, error: exErr } = await db()
    .from('teacher_members')
    .select(MEMBER_COLS)
    .eq('teacher_id', teacherId)
    .eq('invited_email', email)
  if (exErr) throw new Error(translateDbError(exErr))
  const rows = (existing ?? []).map(toMemberRow)
  if (rows.some((r) => r.user_id != null)) {
    throw new Error(t('auth.authApiAssistantAlreadyMember'))
  }
  if (rows.some((r) => r.user_id == null && r.status === 'invited')) {
    throw new Error(
      t('auth.authApiInvitePendingLong'),
    )
  }

  const { data, error } = await db()
    .from('teacher_members')
    .insert({
      teacher_id: teacherId,
      user_id: null,
      invited_email: email,
      role: 'assistant',
      permissions,
      status: 'invited',
    })
    .select(MEMBER_COLS)
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new Error(t('auth.authApiInvitePendingShort'))
    }
    throw new Error(translateDbError(error))
  }
  const row = toMemberRow(data)
  // سجل النشاط: دعوة مساعد بالبريد (معلّقة حتى الادعاء)
  void logActivity(teacherId, {
    event_type: 'member_invited',
    entity_type: 'teacher_member',
    entity_id: row.id,
    entity_label: email,
    details: { invited_via: 'email', invited_email: email },
  })
  return row
}

/** إلغاء دعوة معلّقة — حذف صفها، بشرط إضافي أنها لم تُدّعَ بعد */
export async function cancelTeamInvite(teacherId: string, inviteId: string): Promise<void> {
  const { data: before } = await db()
    .from('teacher_members')
    .select(MEMBER_COLS)
    .eq('teacher_id', teacherId)
    .eq('id', inviteId)
    .maybeSingle()
  const beforeRow = before ? toMemberRow(before) : null
  const { error } = await db()
    .from('teacher_members')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('id', inviteId)
    .is('user_id', null)
  if (error) throw new Error(translateDbError(error))
  void logActivity(teacherId, {
    event_type: 'member_invite_cancelled',
    entity_type: 'teacher_member',
    entity_id: inviteId,
    entity_label: beforeRow?.invited_email ?? null,
    details: beforeRow?.invited_email ? { invited_email: beforeRow.invited_email } : {},
  })
}

export interface ClaimInvitesResult {
  /** عدد الدعوات التي رُبطت وفُعّلت في هذا الاستدعاء */
  claimed: number
  /** دعوات فائضة حُذفت (عضو قائم أصلاً عند نفس المدرس) */
  skipped_duplicates: number
  teacher_ids: string[]
}

/**
 * ادعاء دعوات البريد المعلّقة للمستخدم الحالي — RPC ‏claim_teacher_invites
 * تطابق بريد JWT وحده (لا معاملات)، فهي آمنة للاستدعاء التلقائي عند كل
 * حلّ هوية. آمنة التكرار: استدعاء بلا دعوات مطابقة يعيد claimed = 0.
 */
export async function claimTeacherInvites(): Promise<ClaimInvitesResult> {
  const { data, error } = await db().rpc('claim_teacher_invites')
  if (error) throw new Error(translateDbError(error))
  const raw = (data ?? {}) as {
    claimed?: unknown
    skipped_duplicates?: unknown
    teacher_ids?: unknown
  }
  const result: ClaimInvitesResult = {
    claimed: Number(raw.claimed) || 0,
    skipped_duplicates: Number(raw.skipped_duplicates) || 0,
    teacher_ids: Array.isArray(raw.teacher_ids)
      ? raw.teacher_ids.filter((t): t is string => typeof t === 'string')
      : [],
  }
  // سجل النشاط: قبول الدعوة حدث عضوية — يُسجَّل في نطاق كل مدرس انضم له
  // المساعد، والفاعل هنا هو المساعد نفسه (جلسته الحالية)، وسياسة الإدراج
  // للمساعد تمر لأنه صار عضواً فعّالاً بفعل الادعاء نفسه.
  if (result.claimed > 0) {
    for (const hostTeacherId of result.teacher_ids) {
      void logActivity(hostTeacherId, {
        event_type: 'member_joined',
        entity_type: 'teacher_member',
        entity_label: null,
        details: { joined_via: 'email_invite_claim' },
      })
    }
  }
  return result
}

export async function updateMemberPermissions(
  teacherId: string,
  memberId: string,
  permissions: Record<string, boolean>,
): Promise<void> {
  const { error } = await db()
    .from('teacher_members')
    .update({ permissions })
    .eq('teacher_id', teacherId)
    .eq('id', memberId)
  if (error) throw new Error(translateDbError(error))
  void logActivity(teacherId, {
    event_type: 'member_permissions_updated',
    entity_type: 'teacher_member',
    entity_id: memberId,
    details: { permissions },
  })
}

export async function removeTeamMember(teacherId: string, memberId: string): Promise<void> {
  const { data: before } = await db()
    .from('teacher_members')
    .select(MEMBER_COLS)
    .eq('teacher_id', teacherId)
    .eq('id', memberId)
    .maybeSingle()
  const beforeRow = before ? toMemberRow(before) : null
  const { error } = await db()
    .from('teacher_members')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('id', memberId)
  if (error) throw new Error(translateDbError(error))
  void logActivity(teacherId, {
    event_type: 'member_removed',
    entity_type: 'teacher_member',
    entity_id: memberId,
    entity_label: beforeRow?.invited_email ?? beforeRow?.user_id ?? null,
    details: {
      ...(beforeRow?.invited_email ? { invited_email: beforeRow.invited_email } : {}),
      ...(beforeRow?.user_id ? { member_user_id: beforeRow.user_id } : {}),
    },
  })
}
