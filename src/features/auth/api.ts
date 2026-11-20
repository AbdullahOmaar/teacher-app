import { supabase } from '../../lib/supabase'
import type { TeacherMemberRow, TeacherRow, TeacherSettingsRow } from '../../types/database'

function db() {
  if (!supabase) throw new Error('Supabase غير مربوط — راجع إعدادات .env')
  return supabase
}

/** ترجمة أخطاء Supabase Auth الشائعة لرسائل عربية واضحة */
export function translateAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
  if (m.includes('already registered') || m.includes('already exists'))
    return 'الحساب ده مسجل بالفعل — جرّب تسجيل الدخول.'
  if (m.includes('email not confirmed'))
    return 'البريد لسه مش متأكد — افتح رسالة التأكيد في بريدك الأول وبعدين سجّل دخول.'
  if (m.includes('password should be at least')) return 'كلمة المرور قصيرة — لازم 6 أحرف على الأقل.'
  if (m.includes('weak password') || m.includes('password is too weak'))
    return 'كلمة المرور ضعيفة — اختر كلمة أقوى (أحرف وأرقام).'
  if (m.includes('invalid email') || m.includes('unable to validate email'))
    return 'صيغة البريد الإلكتروني غير صحيحة.'
  if (m.includes('rate limit') || m.includes('too many requests'))
    return 'محاولات كتير في وقت قصير — استنى دقيقة وجرّب تاني.'
  if (m.includes('network') || m.includes('fetch'))
    return 'مشكلة في الاتصال بالإنترنت — اتأكد من الشبكة وجرّب تاني.'
  return message
}

/** ترجمة أخطاء قاعدة البيانات (قيود/RLS) لرسائل عربية */
export function translateDbError(error: { code?: string; message?: string }): string {
  const code = error.code ?? ''
  const msg = error.message ?? ''
  if (code === '23505') return 'العنصر ده موجود بالفعل.'
  if (code === '23503')
    return 'البيانات المرتبطة غير موجودة — اتأكد إن الحساب المطلوب مسجل فعلاً.'
  if (code === '42501' || msg.toLowerCase().includes('row-level security'))
    return 'صلاحياتك لا تسمح بالعملية دي.'
  return msg || 'حصل خطأ غير متوقع.'
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
    throw new Error('الحساب ده مسجل بالفعل — جرّب تسجيل الدخول.')
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

// ---------------------------------------------------------------------------
// Onboarding — إنشاء صف المدرس + إعداداته الافتراضية
// المخطط 0001_init.sql لا يحتوي أي trigger على auth.users ينشئ صف teachers،
// فالإنشاء يتم من العميل: insert بمعرّف المستخدم الحالي فقط، وهو ما تسمح
// به سياسات RLS حرفياً (teachers_self_insert: id = auth.uid()،
// وsettings_owner_all: teacher_id = auth.uid()). الدالة آمنة التكرار.
// ---------------------------------------------------------------------------

const TEACHER_COLS = 'id, display_name, avatar_url, phone, created_at, updated_at'
const SETTINGS_COLS =
  'teacher_id, whatsapp_template, center_share_percent, reminder_minutes, theme, last_export_at, created_at, updated_at'
const MEMBER_COLS = 'id, teacher_id, user_id, role, permissions, status, created_at, updated_at'

export async function fetchOwnTeacher(userId: string): Promise<TeacherRow | null> {
  const { data, error } = await db()
    .from('teachers')
    .select(TEACHER_COLS)
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as TeacherRow | null) ?? null
}

export async function ensureTeacherProfile(
  userId: string,
  displayName: string,
  phone?: string | null,
): Promise<TeacherRow> {
  const client = db()
  const existing = await fetchOwnTeacher(userId)
  if (!existing) {
    const { error } = await client.from('teachers').insert({
      id: userId,
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
  if (!teacher) throw new Error('تعذّر إنشاء ملف المدرس — جرّب تاني.')
  return teacher
}

export async function updateOwnTeacherProfile(
  userId: string,
  input: { display_name: string; phone: string | null; avatar_url?: string | null },
): Promise<void> {
  const patch: { display_name: string; phone: string | null; avatar_url?: string | null } = {
    display_name: input.display_name.trim(),
    phone: input.phone,
  }
  // avatar_url اختياري في النداء: لا يُمسّ إلا عندما يمرّره النموذج صراحة
  if ('avatar_url' in input) patch.avatar_url = input.avatar_url
  const { error } = await db().from('teachers').update(patch).eq('id', userId)
  if (error) throw new Error(translateDbError(error))
}

export async function fetchTeacherSettings(teacherId: string): Promise<TeacherSettingsRow | null> {
  const { data, error } = await db()
    .from('teacher_settings')
    .select(SETTINGS_COLS)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as TeacherSettingsRow | null) ?? null
}

// ---------------------------------------------------------------------------
// عضويات الفريق — teacher_members
//
// ملحوظة مخطط مهمة: الجدول لا يحتوي عمود بريد إلكتروني، وuser_id إلزامي
// ومفتاح خارجي إلى auth.users. لذلك لا يمكن إنشاء «دعوة معلّقة» بالبريد
// وحده قبل أن يكون للمساعد حساب Auth، ولا يستطيع عميل المتصفح (anon key)
// تحويل بريد إلى معرّف مستخدم. آلية الدعوة المنفذة والمتوافقة مع RLS:
// المساعد ينشئ حسابه أولاً، ويشارك «معرّف حسابه» الظاهر في إعداداته،
// والمدرس يضيفه بهذا المعرّف فتُنشأ العضوية فعّالة مباشرة (status=active)
// لأن سياسات المساعد تشترط active ولا توجد سياسة تسمح للمساعد بتفعيل
// عضويته بنفسه. الصلاحيات الافتراضية = مفاتيح المخطط التشغيلية كلها
// مفعّلة وcan_view_money مقفلة (المالية محجوبة عن المساعد في RLS أصلاً).
// ---------------------------------------------------------------------------

export const ASSISTANT_DEFAULT_PERMISSIONS: Record<string, boolean> = {
  can_take_attendance: true,
  can_manage_students: true,
  can_manage_groups: true,
  can_manage_grades: true,
  can_view_money: false,
}

export const PERMISSION_LABELS: Record<string, string> = {
  can_take_attendance: 'تسجيل الحضور',
  can_manage_students: 'إدارة الطلاب',
  can_manage_groups: 'إدارة المجموعات',
  can_manage_grades: 'إدارة الدرجات',
  can_view_money: 'عرض المالية (محفوظة — محجوبة في قاعدة البيانات)',
}

/** عضويات المستخدم الحالي عند مدرسين آخرين (يراها بسياسة members_self_select) */
export async function fetchMyMemberships(userId: string): Promise<TeacherMemberRow[]> {
  const { data, error } = await db()
    .from('teacher_members')
    .select(MEMBER_COLS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as TeacherMemberRow[]
}

/** أعضاء فريق مدرس (يديرهم المالك بسياسة members_owner_all) */
export async function fetchTeamMembers(teacherId: string): Promise<TeacherMemberRow[]> {
  const { data, error } = await db()
    .from('teacher_members')
    .select(MEMBER_COLS)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as TeacherMemberRow[]
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
    if (error.code === '23505') throw new Error('المساعد ده مضاف لفريقك بالفعل.')
    if (error.code === '23503')
      throw new Error('معرّف الحساب ده غير موجود — اتأكد إن المساعد أنشأ حسابه ونسخ المعرّف صح.')
    throw new Error(translateDbError(error))
  }
  return data as unknown as TeacherMemberRow
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
}

export async function removeTeamMember(teacherId: string, memberId: string): Promise<void> {
  const { error } = await db()
    .from('teacher_members')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('id', memberId)
  if (error) throw new Error(translateDbError(error))
}
