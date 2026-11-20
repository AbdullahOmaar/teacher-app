/**
 * أنواع صفوف قاعدة البيانات — منقولة حرفياً من supabase/migrations/0001_init.sql
 * (لا أعمدة مخترعة). الأنواع العددية numeric في Postgres تصل من PostgREST
 * كـ number عادةً، ونبقيها number هنا مع التحويل عند الحاجة.
 */

export type BillingType =
  | 'monthly_fixed'
  | 'per_session_prepaid'
  | 'per_session_attended'
  | 'weekly_package'

export type MemberRole = 'owner' | 'assistant'
export type MemberStatus = 'invited' | 'active' | 'suspended'

export interface TeacherRow {
  id: string
  display_name: string
  avatar_url: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

export interface TeacherMemberRow {
  id: string
  teacher_id: string
  user_id: string
  role: MemberRole
  permissions: Record<string, unknown>
  status: MemberStatus
  created_at: string
  updated_at: string
}

export interface GroupRow {
  id: string
  teacher_id: string
  name: string
  billing_type: BillingType
  price: number
  days: number[] // 0 = الأحد ... 6 = السبت (مطابق Date.getDay())
  start_time: string // "HH:MM:SS" من Postgres
  duration_minutes: number
  room: string | null
  capacity: number | null // null = بلا حد
  assistant_name: string | null
  links: string[]
  created_at: string
  updated_at: string
}

export interface StudentRow {
  id: string
  teacher_id: string
  public_code: string // كود عشوائي 8 أحرف يولّده trigger عند الترك فارغاً
  name: string
  grade: string | null
  school: string | null
  paused: boolean
  phone: string | null
  guardian_name: string | null
  guardian_phone: string | null
  level_note: string | null
  created_at: string
  updated_at: string
}

export interface EnrollmentRow {
  id: string
  teacher_id: string
  student_id: string
  group_id: string
  price_override: number | null // null = سعر المجموعة
  prepaid_sessions: number | null
  created_at: string
}

export interface GroupWaitlistRow {
  id: string
  teacher_id: string
  group_id: string
  name: string
  phone: string | null
  note: string | null
  created_at: string
}

export interface StudentNoteRow {
  id: string
  teacher_id: string
  student_id: string
  note_date: string
  text: string
  created_at: string
}

export interface GuardianRow {
  id: string
  teacher_id: string
  user_id: string | null
  display_name: string
  phone: string
  created_at: string
  updated_at: string
}

export interface GuardianStudentRow {
  teacher_id: string
  guardian_id: string
  student_id: string
  relationship: string | null
  created_at: string
}

/** صف من view ‏student_balances — الرصيد محسوب دائماً، لا مخزّن */
export interface StudentBalanceRow {
  teacher_id: string
  student_id: string
  balance: number
}

/** حقول إنشاء/تعديل طالب (public_code يُترك فارغاً عند الإنشاء فيولّده الـ trigger) */
export interface StudentInput {
  name: string
  grade: string | null
  school: string | null
  phone: string | null
  guardian_name: string | null
  guardian_phone: string | null
  level_note: string | null
  paused: boolean
}

export interface GroupInput {
  name: string
  billing_type: BillingType
  price: number
  days: number[]
  start_time: string // "HH:MM"
  duration_minutes: number
  room: string | null
  capacity: number | null
  assistant_name: string | null
  links: string[]
}

export interface EnrollmentInput {
  student_id: string
  group_id: string
  price_override: number | null
  prepaid_sessions: number | null
}

export interface WaitlistInput {
  name: string
  phone: string | null
  note: string | null
}
