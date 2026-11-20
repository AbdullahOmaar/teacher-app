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

export type AttendanceStatus = 'p' | 'a' | 'l' | 'm'
export type SessionKind = 'regular' | 'extra' | 'moved'
export type SessionStatus = 'scheduled' | 'cancelled'
export type PaymentMethod = 'cash' | 'vodafone_cash' | 'instapay' | 'bank_transfer'
export type InvoiceLineType = 'base' | 'discount' | 'adjustment'

export interface TeacherRow {
  id: string
  display_name: string
  avatar_url: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

export interface TeacherSettingsRow {
  teacher_id: string
  whatsapp_template: string
  center_share_percent: number
  reminder_minutes: number
  theme: string // 'auto' | 'light' | 'dark' (check في المخطط)
  last_export_at: string | null
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

/**
 * رابط وصول موقّع لبوابة ولي الأمر — جدول guardian_access_tokens حرفياً.
 * token_hash موجود في الجدول (SHA-256 hex) لكنه لا يُقرأ للعميل أبداً:
 * القائمة هنا بلا عمود الهاش، والهاش يُكتب عند الإنشاء فقط.
 */
export interface GuardianAccessTokenRow {
  id: string
  teacher_id: string
  guardian_id: string
  student_id: string | null // null في المخطط = كل أولاد ولي الأمر؛ روابطنا دائماً لطالب واحد
  expires_at: string
  revoked_at: string | null
  last_used_at: string | null
  created_at: string
}

/** صف من view ‏student_balances — الرصيد محسوب دائماً، لا مخزّن */
export interface StudentBalanceRow {
  teacher_id: string
  student_id: string
  balance: number
}

export interface SessionRow {
  id: string
  teacher_id: string
  group_id: string
  session_date: string // 'YYYY-MM-DD'
  start_time: string // "HH:MM:SS" من Postgres
  duration_minutes: number
  kind: SessionKind
  status: SessionStatus
  origin_session_id: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface HolidayRow {
  id: string
  teacher_id: string
  holiday_date: string // 'YYYY-MM-DD' — صف لكل يوم (قيد فريد teacher_id + holiday_date)
  name: string | null
  created_at: string
}

/** حقول إنشاء حصة إضافية (kind = 'extra') */
export interface ExtraSessionInput {
  group_id: string
  session_date: string // 'YYYY-MM-DD'
  start_time: string // 'HH:MM'
  duration_minutes: number
  note: string | null
}

export interface AttendanceRow {
  teacher_id: string
  session_id: string
  student_id: string
  status: AttendanceStatus | null // null = لم يُسجّل بعد
  homework_done: boolean
  starred: boolean
  created_at: string
  updated_at: string
}

export interface InvoiceRow {
  id: string
  teacher_id: string
  student_id: string
  group_id: string
  period_month: string // أول يوم في الشهر 'YYYY-MM-DD' (قيد المخطط)
  created_at: string
}

export interface InvoiceLineRow {
  id: string
  teacher_id: string
  invoice_id: string
  line_type: InvoiceLineType
  description: string
  amount: number // قد يكون سالباً (خصم / تسوية)
  reason: string | null // سبب الخصم أو التسوية
  created_at: string
}

/** صف من view ‏invoice_balances — الإجمالي/المدفوع/المتبقي محسوب دائماً */
export interface InvoiceBalanceRow {
  invoice_id: string
  teacher_id: string
  student_id: string
  group_id: string
  period_month: string // أول يوم في الشهر 'YYYY-MM-DD'
  total: number
  paid: number
  balance: number
  is_paid: boolean
}

export interface PaymentRow {
  id: string
  teacher_id: string
  invoice_id: string
  amount: number // سالب = دفعة عكسية
  method: PaymentMethod
  paid_on: string // 'YYYY-MM-DD'
  receipt_no: string
  reverses_payment_id: string | null
  voided: boolean
  created_at: string
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

export type AssessmentType = 'exam' | 'homework'
export type QuestionType = 'mcq' | 'essay'

export interface AssessmentRow {
  id: string
  teacher_id: string
  group_id: string
  title: string
  type: AssessmentType
  assess_date: string // 'YYYY-MM-DD'
  max_score: number // > 0 (قيد المخطط)
  pass_score: number // >= 0 (قيد المخطط)
  created_at: string
  updated_at: string
}

/** سؤال بنك أسئلة مرتبط بتقييم — لا جدول بنك مستقل في المخطط (انظر وحدة الدرجات) */
export interface AssessmentQuestionRow {
  id: string
  teacher_id: string
  assessment_id: string
  position: number
  type: QuestionType
  text: string
  options: string[] | null // jsonb — حتى 4 اختيارات للـ MCQ
  correct_answer: string | null
  points: number // >= 0 (قيد المخطط)
  created_at: string
}

/** درجة طالب في تقييم — غياب الصف = لا درجة مسجلة؛ المفتاح (assessment_id, student_id) */
export interface ScoreRow {
  teacher_id: string
  assessment_id: string
  student_id: string
  score: number // >= 0 (قيد المخطط)
  created_at: string
  updated_at: string
}

export interface AssessmentInput {
  group_id: string
  title: string
  type: AssessmentType
  assess_date: string // 'YYYY-MM-DD'
  max_score: number
  pass_score: number
}

export interface QuestionInput {
  type: QuestionType
  text: string
  options: string[] | null
  correct_answer: string | null
  points: number
}

/** مصروف فعلي — جدول expenses في المخطط حرفياً (لا حقل عنوان: الفئة + الملحوظة) */
export interface ExpenseRow {
  id: string
  teacher_id: string
  expense_date: string // 'YYYY-MM-DD'
  category: string // مقيدة بقيد المخطط لقيم EXP_CATS الخمس
  amount: number // > 0 (قيد المخطط)
  note: string | null
  created_at: string
}

/** قالب مصروف شهري ثابت — جدول recurring_expenses (لا عمود تفعيل/يوم في المخطط) */
export interface RecurringExpenseRow {
  id: string
  teacher_id: string
  category: string
  amount: number // > 0 (قيد المخطط)
  note: string | null
  created_at: string
  updated_at: string
}

/** صف من view ‏monthly_profit — ملخص مالي شهري محسوب في قاعدة البيانات دائماً */
export interface MonthlyProfitRow {
  teacher_id: string
  month: string // أول يوم في الشهر 'YYYY-MM-DD'
  collected: number
  expenses: number
  center_share_amount: number
  net_profit: number
}

export interface ExpenseInput {
  expense_date: string // 'YYYY-MM-DD'
  category: string
  amount: number
  note: string | null
}

export interface RecurringExpenseInput {
  category: string
  amount: number
  note: string | null
}

/**
 * إغلاق يومي للخزنة — جدول daily_closings (migration 0004).
 * صف واحد لكل (مدرس، يوم): لقطة المتوقع وقت الإغلاق + المعدود فعلياً.
 * الفرق (معدود − متوقع) مشتق دائماً ولا يُخزّن.
 */
export interface DailyClosingRow {
  id: string
  teacher_id: string
  closing_date: string // 'YYYY-MM-DD'
  expected_cash: number
  expected_electronic: number
  expenses_total: number // لقطة مصروفات اليوم وقت الإغلاق (عرض فقط)
  counted_cash: number // >= 0 (قيد المخطط)
  counted_electronic: number // >= 0 (قيد المخطط)
  note: string | null
  closed_by: string // حساب Auth لمن أغلق — المالك فقط (لا سياسة مالية للمساعد)
  created_at: string
  updated_at: string
}

export interface DailyClosingInput {
  closing_date: string // 'YYYY-MM-DD'
  expected_cash: number
  expected_electronic: number
  expenses_total: number
  counted_cash: number
  counted_electronic: number
  note: string | null
}
