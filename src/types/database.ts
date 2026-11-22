/**
 * أنواع قاعدة البيانات — COD-1 (دفعة #10، 3A-373).
 *
 * مصدر الحقيقة الآن هو المخطط الحي: `database.generated.ts` مولّد آلياً
 * من قاعدة البيانات الفعلية (scripts/gen_db_types.py — لا يُحرَّر يدوياً).
 * هذا الملف يربط الأنواع المولّدة بالأسماء المستقرة التي يستخدمها الكود
 * (‏*Row والاتحادات) ويضيف ما لا يعرفه المولّد وحده:
 *  - تضييقات موثّقة لأعمدة jsonb/نصية مقيدة بقيود CHECK (شكلها الدقيق
 *    مضمون بقيد المخطط أو بكاتبها الوحيد في الكود).
 *  - حذف أعمدة لا تصل للعميل أبداً بالتصميم (token_hash وأمثاله).
 *  - أنواع الإدخال اليدوية (*Input) وأشكال العرض الخاصة.
 *
 * انحرافات صُحّحت بهذا الربط مقابل الأنواع اليدوية القديمة:
 *  - ‏teacher_settings.mascot_accessory: كان `string | null` والعمود الحي
 *    NOT NULL بقيمة افتراضية 'none' — النوع الآن string حرفياً.
 *  - أعمدة الـ views كانت تُكتب يدوياً بلا null؛ المولّد يراها nullable
 *    (Postgres لا يتتبع عدم خلوّ أعمدة الـ views) — تُصحَّح بمحوّل
 *    NonNullRow لأن تعريفات الـ views نفسها تضمن عدم الخلوّ (أعمدة
 *    مفاتيح غير خالية + COALESCE) — تحقق من pg_get_viewdef 2026-11-22.
 */
import type { Enums, Tables } from './database.generated'

export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums, CompositeTypes } from './database.generated'

/** صف view بلا أي null — انظر ترويسة الملف لضمان تعريف الـ view */
type NonNullRow<T> = { [K in keyof T]: NonNullable<T[K]> }

/** استبدال أنواع حقول مختارة بشكل أدق موثّق (jsonb/قيود CHECK) */
type WithFields<T, F> = Omit<T, keyof F> & F

// ---------------------------------------------------------------------------
// الاتحادات — enums حقيقية في المخطط (تُقرأ من Enums المولّدة)
// ---------------------------------------------------------------------------

export type BillingType = Enums<'billing_type'>
export type MemberRole = Enums<'member_role'>
export type MemberStatus = Enums<'member_status'>
export type AttendanceStatus = Enums<'attendance_status'>
export type SessionKind = Enums<'session_kind'>
export type SessionStatus = Enums<'session_status'>
export type PaymentMethod = Enums<'payment_method'>
export type InvoiceLineType = Enums<'invoice_line_type'>
export type GuardianNotificationKind = Enums<'guardian_notification_kind'>
export type PushSubscriberKind = Enums<'push_subscriber_kind'>
export type PushDeliveryStatus = Enums<'push_delivery_status'>
export type PaymentProofStatus = Enums<'payment_proof_status'>
export type AssessmentType = Enums<'assessment_type'>
export type QuestionType = Enums<'question_type'>
export type OnlineExamStatus = Enums<'online_exam_status'>
export type ExamAttemptStatus = Enums<'exam_attempt_status'>

/** مصدر طلب الانتظار: يدوي من المدرس، أو صفحة الحجز العامة (0019) — قيد CHECK في المخطط */
export type WaitlistSource = 'manual' | 'booking_page'

/** مصدر الدرجة (migration ‏0010): إدخال يدوي أم ترحيل من امتحان إلكتروني — قيد CHECK في المخطط */
export type ScoreSource = 'manual' | 'online_exam'

// ---------------------------------------------------------------------------
// الصفوف — أسماء مستقرة فوق الأنواع المولّدة
// ---------------------------------------------------------------------------

export type TeacherRow = Tables<'teachers'>

/**
 * إعدادات السنتر. ‏theme نص مقيد بقيد CHECK ‏('auto'|'light'|'dark')
 * ويبقى string كما كان (القاموس يتعامل معه كنص).
 * ‏mascot_accessory (0017، موقوف): NOT NULL افتراضي 'none' في المخطط
 * الحي — صُحّح هنا من `string | null` اليدوي الخاطئ (انحراف COD-1).
 * مفتاح دُفّي الفعلي هو show_mascot (0028).
 */
export type TeacherSettingsRow = Tables<'teacher_settings'>

/**
 * إعدادات واتساب الاختيارية لكل سنتر (migration ‏0026 — نموذج 3A-300):
 * حقول Meta غير السرية فقط. التوكن نفسه يعيش في Supabase Vault ولا
 * يقرأه العميل أبداً؛ ‏token_vault_secret_id مؤشر داخلي لا يُختار من
 * العميل أصلاً (انظر WHATSAPP_CONFIG_COLS) — يُحذف من النوع بالتصميم.
 */
export type TeacherWhatsappConfigRow = Omit<Tables<'teacher_whatsapp_config'>, 'token_vault_secret_id'>

/** سجل ملخص Push اليومي (migration ‏0015) */
export type PushDigestLogRow = Tables<'push_digest_log'>

/**
 * عضو فريق السنتر. ‏permissions jsonb شكله Record بتصميم كاتبه الوحيد
 * (خريطة صلاحيات member_has_permission) — تضييق موثّق من Json.
 */
export type TeacherMemberRow = WithFields<
  Tables<'teacher_members'>,
  { permissions: Record<string, unknown> }
>

export type GroupRow = Tables<'groups'>
export type StudentRow = Tables<'students'>
export type EnrollmentRow = Tables<'enrollments'>

/** قائمة الانتظار — ‏source مقيد بقيد CHECK لقيمتي WaitlistSource */
export type GroupWaitlistRow = WithFields<Tables<'group_waitlist'>, { source: WaitlistSource }>

/** رابط الحجز العام للسنتر (0019) — ‏token_hash لا يصل للعميل أبداً */
export type EnrolmentLinkRow = Omit<Tables<'enrolment_links'>, 'token_hash'>

export type StudentNoteRow = Tables<'student_notes'>
export type GuardianRow = Tables<'guardians'>
export type GuardianStudentRow = Tables<'guardian_students'>

/**
 * رابط وصول موقّع لبوابة ولي الأمر. ‏token_hash (SHA-256 hex) موجود في
 * الجدول لكنه لا يُقرأ للعميل أبداً: يُكتب عند الإنشاء فقط — محذوف هنا.
 * ‏student_id قد يكون null في المخطط (= كل أولاد ولي الأمر)؛ روابطنا
 * دائماً لطالب واحد.
 */
export type GuardianAccessTokenRow = Omit<Tables<'guardian_access_tokens'>, 'token_hash'>

/** رابط وصول موقّع لبوابة الطالب (0011) — ‏token_hash محذوف كسابقه */
export type StudentAccessTokenRow = Omit<Tables<'student_access_tokens'>, 'token_hash'>

/** صف من view ‏student_balances — الرصيد محسوب دائماً، لا مخزّن */
export type StudentBalanceRow = NonNullRow<Tables<'student_balances'>>

export type SessionRow = Tables<'sessions'>
export type HolidayRow = Tables<'holidays'>
export type AttendanceRow = Tables<'attendance'>
export type GuardianNotificationRow = Tables<'guardian_notifications'>
export type PushSubscriptionRow = Tables<'push_subscriptions'>
export type PushDeliveryLogRow = Tables<'push_delivery_log'>
export type InvoiceRow = Tables<'invoices'>
export type InvoiceLineRow = Tables<'invoice_lines'>

/** صف من view ‏invoice_balances — الإجمالي/المدفوع/المتبقي محسوب دائماً */
export type InvoiceBalanceRow = NonNullRow<Tables<'invoice_balances'>>

/** إثبات دفع رفعه ولي الأمر من البوابة — جدول payment_proofs (migration ‏0005) */
export type PaymentProofRow = Tables<'payment_proofs'>

export type PaymentRow = Tables<'payments'>

/** تقييم (امتحان/واجب) فوق مجموعة */
export type AssessmentRow = Tables<'assessments'>

/**
 * سؤال بنك أسئلة مرتبط بتقييم. ‏options jsonb: مصفوفة نصوص (حتى 4
 * اختيارات للـ MCQ) أو null — تضييق موثّق من Json.
 */
export type AssessmentQuestionRow = WithFields<
  Tables<'assessment_questions'>,
  { options: string[] | null }
>

/** درجة طالب في تقييم — ‏source مقيد بقيد CHECK لقيمتي ScoreSource */
export type ScoreRow = WithFields<Tables<'scores'>, { source: ScoreSource }>

/** امتحان إلكتروني فوق تقييم قائم — جدول online_exams (migration ‏0010) */
export type OnlineExamRow = Tables<'online_exams'>

/** رابط امتحان — جدول online_exam_tokens بلا عمود الهاش (يُكتب عند الإنشاء فقط) */
export type OnlineExamTokenRow = Omit<Tables<'online_exam_tokens'>, 'token_hash'>

/** سؤال كما يراه الطالب في لقطة عرض المحاولة — بلا أي إجابة صحيحة بالتصميم */
export interface ExamPresentationQuestion {
  id: string
  text: string
  points: number
  options: string[]
}

/**
 * محاولة طالب — جدول exam_attempts (migration ‏0010). ‏presentation
 * وanswers jsonb بأشكال دقيقة يكتبها exam_start_attempt ويقرأها مسار
 * الامتحان — تضييق موثّق من Json.
 */
export type ExamAttemptRow = WithFields<
  Tables<'exam_attempts'>,
  { presentation: ExamPresentationQuestion[]; answers: Record<string, string> }
>

/** مصروف فعلي — جدول expenses (الفئة مقيدة بقيد المخطط لقيم EXP_CATS الخمس، وتبقى string) */
export type ExpenseRow = Tables<'expenses'>

/** قالب مصروف شهري ثابت — جدول recurring_expenses */
export type RecurringExpenseRow = Tables<'recurring_expenses'>

/** صف من view ‏monthly_profit — ملخص مالي شهري محسوب في قاعدة البيانات دائماً */
export type MonthlyProfitRow = NonNullRow<Tables<'monthly_profit'>>

/**
 * إغلاق يومي للخزنة — جدول daily_closings (migration 0004).
 * صف واحد لكل (مدرس، يوم): لقطة المتوقع وقت الإغلاق + المعدود فعلياً.
 * الفرق (معدود − متوقع) مشتق دائماً ولا يُخزّن.
 */
export type DailyClosingRow = Tables<'daily_closings'>

// ---------------------------------------------------------------------------
// سجل النشاط — جدول activity_log (migration ‏0009)
// ---------------------------------------------------------------------------

/** أنواع أحداث السجل — قائمة قيد CHECK في المخطط حرفياً */
export type ActivityEventType =
  | 'payment_created'
  | 'payment_voided'
  | 'invoice_created'
  | 'invoices_generated'
  | 'attendance_saved'
  | 'member_invited'
  | 'member_joined'
  | 'member_removed'
  | 'member_invite_cancelled'
  | 'member_permissions_updated'
  | 'proof_approved'
  | 'proof_rejected'
  | 'student_deleted'
  | 'student_archived'
  | 'student_unarchived'
  | 'group_deleted'
  | 'group_archived'
  | 'group_unarchived'
  | 'cashbox_closed'

/** دور الفاعل — قيد CHECK في المخطط */
export type ActivityActorRole = 'owner' | 'assistant'

/**
 * صف سجل نشاط — لقطة الفاعل والكيان وقت الحدث (تبقى بعد حذف الكيان).
 * ‏actor_role وevent_type مقيدان بقيود CHECK، وdetails خريطة حرة.
 */
export type ActivityLogRow = WithFields<
  Tables<'activity_log'>,
  {
    actor_role: ActivityActorRole
    event_type: ActivityEventType
    details: Record<string, unknown>
  }
>

// ---------------------------------------------------------------------------
// متابعات «معرّضون للفقد» — جدول at_risk_followups (migration ‏0018)
// ---------------------------------------------------------------------------

export type AtRiskFollowupRow = Tables<'at_risk_followups'>

// ---------------------------------------------------------------------------
// أنواع الإدخال اليدوية — حمولات كتابة تبنيها الواجهة (ليست صفوفاً)
// ---------------------------------------------------------------------------

/** حقول إنشاء حصة إضافية (kind = 'extra') */
export interface ExtraSessionInput {
  group_id: string
  session_date: string // 'YYYY-MM-DD'
  start_time: string // 'HH:MM'
  duration_minutes: number
  note: string | null
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

export interface OnlineExamInput {
  status: OnlineExamStatus
  duration_minutes: number | null
  max_attempts: number
  starts_at: string | null
  ends_at: string | null
  allow_review: boolean
  shuffle_questions: boolean
  shuffle_options: boolean
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

export interface DailyClosingInput {
  closing_date: string // 'YYYY-MM-DD'
  expected_cash: number
  expected_electronic: number
  expenses_total: number
  counted_cash: number
  counted_electronic: number
  note: string | null
}
