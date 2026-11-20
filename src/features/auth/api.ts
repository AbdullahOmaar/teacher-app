import { supabase } from '../../lib/supabase'
import type { TeacherMemberRow, TeacherRow, TeacherSettingsRow } from '../../types/database'
import { logActivity } from '../activity/api'

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
// الحساب التجريبي — حساب مدرس مشترك هدفه تجربة التطبيق فوراً بدون تسجيل.
// بياناته معلنة عمداً (زرار ثابت في صفحة الدخول)، وبياناته معزولة بـ RLS
// عن أي مدرس حقيقي. لا تُدخل فيه بيانات حقيقية أبداً.
// ---------------------------------------------------------------------------

export const DEMO_EMAIL = 'demo@teacher-app.com'
export const DEMO_PASSWORD = 'Demo123456'

export async function signInDemo(): Promise<void> {
  await signInWithEmail(DEMO_EMAIL, DEMO_PASSWORD)
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
  'teacher_id, whatsapp_template, center_share_percent, reminder_minutes, theme, brand_name, brand_logo_path, brand_accent, push_daily_digest_enabled, push_daily_digest_time, push_daily_digest_last_sent_on, last_export_at, created_at, updated_at'
const MEMBER_COLS =
  'id, teacher_id, user_id, invited_email, role, permissions, status, created_at, updated_at'

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
  const row = data as unknown as TeacherMemberRow
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
    throw new Error('صيغة البريد الإلكتروني غير صحيحة — اتأكد من البريد وحاول تاني.')
  }

  const { data: existing, error: exErr } = await db()
    .from('teacher_members')
    .select(MEMBER_COLS)
    .eq('teacher_id', teacherId)
    .eq('invited_email', email)
  if (exErr) throw new Error(translateDbError(exErr))
  const rows = (existing ?? []) as unknown as TeacherMemberRow[]
  if (rows.some((r) => r.user_id != null)) {
    throw new Error('المساعد ده عضو في فريقك بالفعل بالبريد ده.')
  }
  if (rows.some((r) => r.user_id == null && r.status === 'invited')) {
    throw new Error(
      'في دعوة معلّقة بالفعل للبريد ده — هتلاقيها في قائمة الدعوات المعلّقة تحت، وتقدر تلغيها وتدعو من جديد.',
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
      throw new Error('في دعوة معلّقة بالفعل للبريد ده عندك.')
    }
    throw new Error(translateDbError(error))
  }
  const row = data as unknown as TeacherMemberRow
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
  const beforeRow = (before as unknown as TeacherMemberRow | null) ?? null
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
  const beforeRow = (before as unknown as TeacherMemberRow | null) ?? null
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
