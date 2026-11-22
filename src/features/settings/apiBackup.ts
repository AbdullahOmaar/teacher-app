import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import { isValidAccent } from '../../lib/brand'
import type { TeacherSettingsRow } from '../../types/database'
import { SETTINGS_COLS, fetchPaged, todayFileStamp, type PageResult } from './apiShared'
import {
  REMINDER_VALUES,
  isThemeMode,
  isValidDigestTime,
  updateTeacherSettings,
} from './apiSettings'

// ===========================================================================
// النسخ الاحتياطي JSON — تصدير وتحقق واستيراد (الدفعة #7 / 3A-360 —
// COD-2: فُصلت من settings/api.ts بنقل حرفي؛ السطح العام يبقى عبر api.ts).
// ===========================================================================

// ===========================================================================
// النسخة الاحتياطية JSON — نطاقها: كل جداول بيانات المدرس التشغيلية في
// المخطط (28 جدولاً أدناه بترتيب اعتماد الاستيراد) + صف إعداداته.
// (أُضيف at_risk_followups في Phase 5 خطوة 1 كقسم اختياري أخير — نفس
// قاعدة توافق الإصدار 1.)
// (أُضيف push_digest_log في Phase 4 خطوة 3 كقسم اختياري أخير — نفس
// قاعدة توافق الإصدار 1؛ وأعمدة ملخص Push اليومي على teacher_settings
// تنتقل ضمن صف الإعدادات نفسه عبر SETTINGS_COLS.)
// (أُضيف activity_log في Phase 3 خطوة 2 كقسم اختياري أخير — نفس قاعدة
// توافق الإصدار 1: ملف قديم بلا القسم يُستورد بنجاح، والتطبيق القديم
// يتجاهل القسم الجديد.)
// الجدولان الأخيران أُضيفا في Phase 2 (الخطوة 14) بعد اكتشاف الخطوة 13
// أن نطاق النسخة لم يشملهما:
// • daily_closings (migration ‏0004 — إغلاقات الخزنة اليومية): بيانات
//   صرفة، تُصدَّر وتُستورد كاملة بنفس نمط باقي الجداول.
// • payment_proofs (migration ‏0005 — إثباتات الدفع): تُصدَّر صفوف
//   البيانات فقط. صور الإثباتات نفسها تعيش في Supabase Storage
//   (bucket ‏payment-proofs) وليست جزءاً من ملف JSON هذا إطلاقاً —
//   الصفوف المستعادة تحمل storage_path يشير لملف قد لا يوجد بعد
//   الاستيراد على حساب/بيئة جديدة، فتبقى بيانات الإثبات (المبلغ،
//   الطريقة، الحالة، المراجعة) سليمة لكن عرض صورتها قد يتعذّر هناك.
// مُستثنى بوعي وموثّق:
// • teachers (هوية الحساب نفسها — الملف الشخصي يُدار من الإعدادات،
//   والاستيراد يفرض حساب المستورِد الحالي ولا يكتب فوق حساب آخر أبداً)
// • teacher_members (عضويات مرتبطة بحسابات Auth لأشخاص آخرين)
// • guardian_access_tokens + online_exam_tokens + student_access_tokens
//   + enrolment_links (0019 — هاش رابط صفحة الحجز العامة، يُعاد توليده
//   من بطاقة «صفحة الحجز العامة» في الإعدادات)
//   (رموز وصول أمنية — القاعدة تخزن هاشاتها فقط أصلاً، والروابط تُعاد
//   توليدها من شاشات بوابة ولي الأمر / التقييم / ملف الطالب عند الحاجة.
//   جدول بوابة الطالب student_access_tokens أُضيف في migration ‏0011
//   Phase 3 خطوة 5 وهو جدول رموز فقط بلا أي بيانات أعمال، فاستثناؤه
//   لا يغيّر عدد جداول النسخة — يبقى 24 جدولاً كما هو)
// • الـ views الأربع (invoice_balances / student_balances /
//   student_attendance_stats / monthly_profit) محسوبة دائماً لا تُخزَّن.
// الشكل مُصدَّر (version) حتى يرفض التطبيق أي ملف أحدث منه بوضوح.
// إصدار الصيغة بقى 1 رغم التوسيع: الجدولان الجديدان قسمان اختياريان
// بنفس قاعدة الأقسام القائمة (قسم ناقص = فارغ في parseBackupJson)،
// فملف قديم (19 جدولاً) يُستورد بنجاح بعد التوسيع، والتطبيق القديم
// يتجاهل القسمين الجديدين في ملف جديد — توافق في الاتجاهين بلا كسر.
// ===========================================================================

export const BACKUP_FORMAT = 'teacher-app-backup'
export const BACKUP_VERSION = 1

export interface BackupTableSpec {
  key: string
  table: string
  label: string
  /** أعمدة الجدول في المخطط حرفياً — قائمة بيضاء للتصدير والاستيراد معاً */
  columns: string[]
  /** حقول الهوية داخل نطاق المدرس (لكشف الموجود وتخطّيه عند الاستيراد) */
  pk: string[]
}

/** الترتيب = ترتيب الاستيراد الآمن حسب اعتماد المفاتيح الخارجية */
export const BACKUP_TABLES: BackupTableSpec[] = [
  { key: 'groups', table: 'groups', label: t('settings.settingsApiBackupGroups'), pk: ['id'], columns: ['id', 'teacher_id', 'name', 'billing_type', 'price', 'days', 'start_time', 'duration_minutes', 'room', 'capacity', 'assistant_name', 'links', 'archived_at', 'created_at', 'updated_at'] },
  { key: 'students', table: 'students', label: t('settings.settingsApiBackupStudents'), pk: ['id'], columns: ['id', 'teacher_id', 'public_code', 'name', 'grade', 'school', 'paused', 'phone', 'guardian_name', 'guardian_phone', 'level_note', 'created_at', 'updated_at'] },
  { key: 'guardians', table: 'guardians', label: t('settings.settingsApiBackupGuardians'), pk: ['id'], columns: ['id', 'teacher_id', 'user_id', 'display_name', 'phone', 'created_at', 'updated_at'] },
  { key: 'group_waitlist', table: 'group_waitlist', label: t('settings.settingsApiBackupGroupWaitlist'), pk: ['id'], columns: ['id', 'teacher_id', 'group_id', 'name', 'phone', 'note', 'source', 'wants_trial', 'created_at'] },
  { key: 'student_notes', table: 'student_notes', label: t('settings.settingsApiBackupStudentNotes'), pk: ['id'], columns: ['id', 'teacher_id', 'student_id', 'note_date', 'text', 'created_at'] },
  { key: 'enrollments', table: 'enrollments', label: t('settings.settingsApiBackupEnrollments'), pk: ['id'], columns: ['id', 'teacher_id', 'student_id', 'group_id', 'price_override', 'prepaid_sessions', 'created_at'] },
  { key: 'holidays', table: 'holidays', label: t('settings.settingsApiBackupHolidays'), pk: ['id'], columns: ['id', 'teacher_id', 'holiday_date', 'name', 'created_at'] },
  { key: 'recurring_expenses', table: 'recurring_expenses', label: t('settings.settingsApiBackupRecurringExpenses'), pk: ['id'], columns: ['id', 'teacher_id', 'category', 'amount', 'note', 'created_at', 'updated_at'] },
  { key: 'expenses', table: 'expenses', label: t('settings.settingsApiBackupExpenses'), pk: ['id'], columns: ['id', 'teacher_id', 'expense_date', 'category', 'amount', 'note', 'created_at'] },
  { key: 'sessions', table: 'sessions', label: t('settings.settingsApiBackupSessions'), pk: ['id'], columns: ['id', 'teacher_id', 'group_id', 'session_date', 'start_time', 'duration_minutes', 'kind', 'status', 'origin_session_id', 'note', 'created_at', 'updated_at'] },
  { key: 'invoices', table: 'invoices', label: t('settings.settingsApiBackupInvoices'), pk: ['id'], columns: ['id', 'teacher_id', 'student_id', 'group_id', 'period_month', 'created_at'] },
  { key: 'assessments', table: 'assessments', label: t('settings.settingsApiBackupAssessments'), pk: ['id'], columns: ['id', 'teacher_id', 'group_id', 'title', 'type', 'assess_date', 'max_score', 'pass_score', 'created_at', 'updated_at'] },
  { key: 'invoice_lines', table: 'invoice_lines', label: t('settings.settingsApiBackupInvoiceLines'), pk: ['id'], columns: ['id', 'teacher_id', 'invoice_id', 'line_type', 'description', 'amount', 'reason', 'created_at'] },
  { key: 'payments', table: 'payments', label: t('settings.settingsApiBackupPayments'), pk: ['id'], columns: ['id', 'teacher_id', 'invoice_id', 'amount', 'method', 'paid_on', 'receipt_no', 'reverses_payment_id', 'voided', 'created_at'] },
  { key: 'attendance', table: 'attendance', label: t('settings.settingsApiBackupAttendance'), pk: ['session_id', 'student_id'], columns: ['teacher_id', 'session_id', 'student_id', 'status', 'homework_done', 'starred', 'left_at', 'created_at', 'updated_at'] },
  { key: 'assessment_questions', table: 'assessment_questions', label: t('settings.settingsApiBackupAssessmentQuestions'), pk: ['id'], columns: ['id', 'teacher_id', 'assessment_id', 'position', 'type', 'text', 'options', 'correct_answer', 'points', 'created_at'] },
  { key: 'scores', table: 'scores', label: t('settings.settingsApiBackupScores'), pk: ['assessment_id', 'student_id'], columns: ['teacher_id', 'assessment_id', 'student_id', 'score', 'source', 'exam_attempt_id', 'created_at', 'updated_at'] },
  { key: 'guardian_students', table: 'guardian_students', label: t('settings.settingsApiBackupGuardianStudents'), pk: ['guardian_id', 'student_id'], columns: ['teacher_id', 'guardian_id', 'student_id', 'relationship', 'created_at'] },
  { key: 'receipt_counters', table: 'receipt_counters', label: t('settings.settingsApiBackupReceiptCounters'), pk: ['counter_year'], columns: ['teacher_id', 'counter_year', 'last_number'] },
  // Phase 2 (الخطوة 14): الجدولان في آخر الترتيب عمداً — daily_closings
  // بلا أي مفتاح خارجي داخل نطاق النسخة (closed_by يُعاد ربطه بالمستورِد
  // في toInsertRow)، وpayment_proofs يعتمد على guardians/students/
  // invoices/payments وكلها قبله في الترتيب، فالآخر هو الموضع الآمن.
  { key: 'daily_closings', table: 'daily_closings', label: t('settings.settingsApiBackupDailyClosings'), pk: ['id'], columns: ['id', 'teacher_id', 'closing_date', 'expected_cash', 'expected_electronic', 'expenses_total', 'counted_cash', 'counted_electronic', 'note', 'closed_by', 'created_at', 'updated_at'] },
  // صفوف بيانات فقط — الصور في Storage وليست في ملف JSON (انظر الترويسة)
  { key: 'payment_proofs', table: 'payment_proofs', label: t('settings.settingsApiBackupPaymentProofs'), pk: ['id'], columns: ['id', 'teacher_id', 'guardian_id', 'student_id', 'invoice_id', 'amount', 'method', 'storage_path', 'status', 'rejection_reason', 'reviewed_by', 'reviewed_at', 'payment_id', 'uploaded_at', 'created_at', 'updated_at'] },
  // Phase 3 (الخطوة 2): سجل النشاط (migration ‏0009) آخر الترتيب — يعتمد
  // على teachers فقط داخل نطاق النسخة، وactor_id (auth.users) يُعاد ربطه
  // بالمستورِد في toInsertRow كي لا يفشل قيده في بيئة جديدة، وتبقى لقطتا
  // actor_role/actor_name شاهدتين على الفاعل الأصلي كما هما.
  { key: 'activity_log', table: 'activity_log', label: t('settings.settingsApiBackupActivityLog'), pk: ['id'], columns: ['id', 'teacher_id', 'actor_id', 'actor_role', 'actor_name', 'event_type', 'entity_type', 'entity_id', 'entity_label', 'details', 'created_at'] },
  // Phase 3 (الخطوة 4): الامتحانات الإلكترونية (migration ‏0010) آخر
  // الترتيب — online_exams يعتمد على assessments/groups (قبله)،
  // وexam_attempts يعتمد عليه وعلى students (قبله)، فالآخر آمن.
  // روابط الامتحان (online_exam_tokens) مستثناة كروابط البوابة: رموز
  // وصول أمنية تُعاد توليدها من شاشة التقييم عند الحاجة. ودرجات
  // scores تحمل exam_attempt_id يشير لمحاولة تُستورد بعده — يُدخل
  // مؤقتاً بلا الرابط ويُصلَح في المرور الثاني (انظر importBackup).
  { key: 'online_exams', table: 'online_exams', label: t('settings.settingsApiBackupOnlineExams'), pk: ['id'], columns: ['id', 'teacher_id', 'assessment_id', 'group_id', 'status', 'duration_minutes', 'max_attempts', 'starts_at', 'ends_at', 'allow_review', 'shuffle_questions', 'shuffle_options', 'created_at', 'updated_at'] },
  { key: 'exam_attempts', table: 'exam_attempts', label: t('settings.settingsApiBackupExamAttempts'), pk: ['id'], columns: ['id', 'teacher_id', 'exam_id', 'student_id', 'attempt_no', 'status', 'seed', 'presentation', 'answers', 'started_at', 'submitted_at', 'score', 'max_score', 'pct', 'score_posted', 'created_at', 'updated_at'] },
  // Phase 3 (الخطوة 6): تنبيهات وصل/غادر لولي الأمر (migration ‏0012)
  // آخر الترتيب — تعتمد على students/guardians/sessions وكلها قبلها،
  // وقيدها الفريد (session+student+kind) مع تخطّي الموجود بالهوية
  // يجعل إعادة الاستيراد آمنة. guardian_id لقطة مستلم قد تشير لوليّ
  // مُستورد في نفس النسخة (guardians قبلها في الترتيب).
  { key: 'guardian_notifications', table: 'guardian_notifications', label: t('settings.settingsApiBackupGuardianNotifications'), pk: ['id'], columns: ['id', 'teacher_id', 'student_id', 'guardian_id', 'session_id', 'kind', 'event_at', 'read_at', 'created_at'] },
  // Phase 4 (الخطوة 1): اشتراكات Web Push (migration ‏0013) آخر الترتيب —
  // تعتمد على guardians/students وكلاهما قبلها. الاشتراكات مرتبطة
  // بأجهزة المصدر: الصفوف المستعادة قد تشير لمتصفحات لم تعد موجودة،
  // وأول إرسال لها يرد 404/410 فينظّفها مرسِل الـ Push تلقائياً.
  // user_id لاشتراكات teacher يُعاد ربطه بالمستورِد في toInsertRow
  // (مرجع auth.users)، وportal_token_id لقطة بلا قيد فتنتقل كما هي.
  // سجل الإرسال push_delivery_log تشخيصي عابر فلا يدخل النسخة.
  { key: 'push_subscriptions', table: 'push_subscriptions', label: t('settings.settingsApiBackupPushSubscriptions'), pk: ['id'], columns: ['id', 'teacher_id', 'subscriber_kind', 'user_id', 'portal_token_id', 'guardian_id', 'student_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'is_active', 'disabled_at', 'disabled_reason', 'failure_count', 'last_success_at', 'last_failure_at', 'created_at', 'updated_at'] },
  // Phase 4 (الخطوة 3): سجل إرسال الملخص اليومي (migration ‏0015) آخر
  // الترتيب — يعتمد على teachers فقط داخل نطاق النسخة، وقيدُه الفريد
  // (teacher_id, digest_date) مع تخطّي الموجود بالهوية (pk مركّب هنا)
  // يجعل إعادة الاستيراد آمنة ولا تكسر منع تكرار الملخص في نفس اليوم.
  { key: 'push_digest_log', table: 'push_digest_log', label: t('settings.settingsApiBackupPushDigestLog'), pk: ['digest_date'], columns: ['id', 'teacher_id', 'digest_date', 'sessions_count', 'overdue_count', 'overdue_amount', 'sent_at'] },
  // Phase 5 (الخطوة 1): متابعات «معرّضون للفقد» (migration ‏0018) آخر
  // الترتيب — تعتمد على students (قبلها) فقط داخل نطاق النسخة،
  // وfollowed_by مرجع auth.users يُعاد ربطه بالمستورِد في toInsertRow
  // (نفس معالجة activity_log.actor_id) حتى لا يفشل قيده في بيئة جديدة.
  { key: 'at_risk_followups', table: 'at_risk_followups', label: t('settings.settingsApiBackupAtRiskFollowups'), pk: ['id'], columns: ['id', 'teacher_id', 'student_id', 'followed_by', 'followed_at', 'note'] },
]

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exported_at: string
  /** معرّف حساب المصدر — معلوماتي فقط؛ الاستيراد يتجاهله ويفرض الحالي */
  teacher_id: string
  data: {
    teacher_settings: Record<string, unknown> | null
    [table: string]: unknown
  }
}

/** تجميع النسخة الكاملة لنطاق المدرس الحالي من قاعدة البيانات */
export async function fetchBackup(teacherId: string): Promise<BackupFile> {
  const supa = db()
  const data: BackupFile['data'] = { teacher_settings: null }

  const { data: settings, error: sErr } = await supa
    .from('teacher_settings')
    .select(SETTINGS_COLS)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (sErr) throw sErr
  data.teacher_settings = (settings as unknown as Record<string, unknown> | null) ?? null

  for (const spec of BACKUP_TABLES) {
    const cols = spec.columns.join(', ')
    const orderCol = spec.columns.includes('created_at') ? 'created_at' : spec.pk[0]
    data[spec.key] = await fetchPaged<Record<string, unknown>>((from, to) =>
      supa
        .from(spec.table)
        .select(cols)
        .eq('teacher_id', teacherId)
        .order(orderCol, { ascending: true })
        .range(from, to) as unknown as Promise<PageResult<Record<string, unknown>>>,
    )
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    teacher_id: teacherId,
    data,
  }
}

export interface BackupDownload {
  filename: string
  content: string
  /** إجمالي صفوف الجداول (بلا صف الإعدادات) */
  rowCount: number
  tableCount: number
}

export async function buildBackupDownload(teacherId: string): Promise<BackupDownload> {
  const backup = await fetchBackup(teacherId)
  let rowCount = 0
  for (const spec of BACKUP_TABLES) {
    const rows = backup.data[spec.key]
    if (Array.isArray(rows)) rowCount += rows.length
  }
  return {
    filename: `teacher-backup-${todayFileStamp()}.json`,
    content: JSON.stringify(backup, null, 2),
    rowCount,
    tableCount: BACKUP_TABLES.length,
  }
}

// ---------------------------------------------------------------------------
// التحقق من بنية النسخة قبل أي كتابة (قراءة جافة — لا لمس لقاعدة البيانات)
// ---------------------------------------------------------------------------

export interface BackupValidation {
  ok: boolean
  errors: string[]
  backup?: BackupFile
  /** عدد صفوف كل جدول معروف في الملف — لعرض ملخص ما قبل الاستيراد */
  counts?: Record<string, number>
  hasSettings?: boolean
}

export function parseBackupJson(text: string): BackupValidation {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    return { ok: false, errors: [t('settings.settingsApiBackupNotJson')] }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: [t('settings.settingsApiBackupBadStructure')] }
  }
  const root = obj as Record<string, unknown>

  // نسخ التطبيق المرجعي القديم ({state, extras} في localStorage) شكلها
  // مختلف جذرياً عن المخطط العلائقي — تُرفض برسالة واضحة بدل تخمين تحويل.
  if ('state' in root || 'extras' in root) {
    return {
      ok: false,
      errors: [
        t('settings.settingsApiBackupLegacyFormat'),
      ],
    }
  }
  if (root.format !== BACKUP_FORMAT) {
    return { ok: false, errors: [t('settings.settingsApiBackupUnknownFormat')] }
  }
  const version = root.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, errors: [t('settings.settingsApiBackupVersionMissing')] }
  }
  if (version > BACKUP_VERSION) {
    return {
      ok: false,
      errors: [
        t('settings.settingsApiBackupVersionTooNew', { version, supported: BACKUP_VERSION }),
      ],
    }
  }
  const data = root.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: [t('settings.settingsApiBackupDataMissing')] }
  }
  const dataObj = data as Record<string, unknown>
  const errors: string[] = []
  const counts: Record<string, number> = {}
  for (const spec of BACKUP_TABLES) {
    const v = dataObj[spec.key]
    if (v == null) {
      counts[spec.key] = 0
      continue
    }
    if (!Array.isArray(v)) {
      errors.push(t('settings.settingsApiBackupSectionNotList', { label: spec.label }))
      continue
    }
    if (v.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) {
      errors.push(t('settings.settingsApiBackupSectionBadRows', { label: spec.label }))
      continue
    }
    counts[spec.key] = v.length
  }
  const rawSettings = dataObj.teacher_settings
  let hasSettings = false
  if (rawSettings != null) {
    if (typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
      errors.push(t('settings.settingsApiBackupSettingsInvalid'))
    } else {
      hasSettings = true
    }
  }
  if (errors.length > 0) return { ok: false, errors }

  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0)
  if (totalRows === 0 && !hasSettings) {
    return { ok: false, errors: [t('settings.settingsApiBackupEmpty')] }
  }
  return { ok: true, errors: [], backup: root as unknown as BackupFile, counts, hasSettings }
}

// ---------------------------------------------------------------------------
// الاستيراد الآمن — سلوك التعارض الموثّق (المواصفات تصف استعادة النسخة
// القديمة كاستبدال كامل بعد تأكيد؛ في النسخة السحابية متعددة الحسابات
// الاستبدال الكامل خطر على بيانات حية، فالمنفّذ هنا هو الأسلوب الأأمن
// كما وجّه التكليف عند صمت المواصفات):
// • الدمج بالإضافة فقط: لا حذف ولا تحديث لأي صف قائم أبداً.
// • كل صف يُفرض عليه teacher_id = حساب المدرس الحالي — لا كتابة فوق
//   حساب آخر مهما كان محتوى الملف، ومعرّف مصدر النسخة يُتجاهل.
// • الصف الموجود بنفس الهوية (المفتاح الأساسي داخل نطاق المدرس)
//   يُتخطى ويُحصى في التقرير — فاستيراد نفس النسخة مرتين آمن تماماً.
// • الصف الذي يفشل (تعارض فريد آخر أو مرجع مفقود) يُتخطى وحده ولا
//   يُوقف بقية الاستيراد، ويظهر في التقرير بعدّاده ورسالة عيّنة.
// • guardians.user_id يُصفَّر دائماً: ربط حساب ولي الأمر لا ينتقل بين
//   الحسابات (يبقى الربط بالطالب عبر guardian_students والهاتف).
// • مرجعا auth.users في جدولي Phase 2 (daily_closings.closed_by و
//   payment_proofs.reviewed_by) يُعاد ربطهما بحساب المستورِد الحالي:
//   حساب المُغلِق/المُراجِع الأصلي قد لا يوجد في بيئة الاستيراد فيفشل
//   قيد المفتاح الخارجي، وفي هذا التطبيق المالك هو من يغلق ويراجع
//   دائماً (سياسات RLS للمالك فقط) فإعادة الربط أمينة دلالياً.
// • payment_proofs تُستعاد صفوفها كما هي (بما فيها storage_path) لكن
//   ملفات الصور ليست في النسخة أصلاً — انظر قيد الترويسة أعلاه.
// • إعدادات المدرس هي الاستثناء الوحيد للتحديث: تُدمج في صف إعدادات
//   الحساب الحالي (قالب واتساب/نسبة سنتر/تذكير/ثيم بعد التحقق منها)،
//   وlast_export_at لا يُمسّ من الملف أبداً.
// • الهوية البيضاء (Phase 3 خطوة 1، migration ‏0008): لا جدول جديد —
//   أعمدة brand_* على teacher_settings نفسه، فتُصدَّر تلقائياً ضمن صف
//   الإعدادات عبر SETTINGS_COLS وتُدمج عند الاستيراد (الاسم واللهجة)،
//   ومسار الشعار لا ينتقل بين الحسابات (الملف في Storage حساب المصدر).
// • المرجعان الذاتيان (sessions.origin_session_id و
//   payments.reverses_payment_id) يُصلَحان في مرور ثانٍ بعد إدراج الكل.
// ---------------------------------------------------------------------------

export interface TableImportResult {
  key: string
  label: string
  imported: number
  skipped: number
  failed: number
}

export interface ImportReport {
  tables: TableImportResult[]
  totalImported: number
  totalSkipped: number
  totalFailed: number
  settingsUpdated: boolean
  /** عيّنات رسائل أخطاء الصفوف الفاشلة (بحد أقصى 5) */
  errorSamples: string[]
}

function pkKeyOf(spec: BackupTableSpec, row: Record<string, unknown>): string {
  return spec.pk.map((f) => String(row[f] ?? '')).join('|')
}

/** تحويل صف من الملف لصف إدراج: أعمدة القائمة البيضاء فقط + فرض الحساب الحالي */
function toInsertRow(
  spec: BackupTableSpec,
  row: Record<string, unknown>,
  teacherId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of spec.columns) {
    if (col in row) out[col] = row[col]
  }
  out.teacher_id = teacherId
  if (spec.table === 'guardians') out.user_id = null
  // مرجعا auth.users (انظر توثيق الاستيراد أعلاه): يُعاد ربطهما بالمستورِد
  if (spec.table === 'daily_closings') out.closed_by = teacherId
  if (spec.table === 'payment_proofs' && out.reviewed_by != null) {
    out.reviewed_by = teacherId
  }
  // سجل النشاط (0009): actor_id مرجع auth.users، وسياسة إدراجه تشترط
  // actor_id = auth.uid() — فكل صفوف السجل المستوردة تُعاد نسبتها شكلياً
  // للمستورِد (actor_id = حسابه وactor_role = 'owner') حتى يمر الإدراج
  // ولا يفشل القيد في بيئة جديدة، بما فيها صفوف كان فاعلها مساعداً أو
  // حُذف حسابه (actor_id خالٍ أصلاً)؛ اللقطة النصية actor_name تبقى كما
  // هي شاهدة على الفاعل الأصلي، فلا تضيع معلومة «مين عملها فعلاً».
  if (spec.table === 'activity_log') {
    out.actor_id = teacherId
    out.actor_role = 'owner'
  }
  // اشتراكات Push (0013): user_id مرجع auth.users لصاحب المتصفح —
  // اشتراكات teacher المستوردة تُعاد نسبتها لحساب المستورِد (المتصفح
  // الذي سيُعاد التفعيل منه أصلاً)، واشتراكات البوابات user_id فيها
  // خالٍ بطبيعتها فلا تُمسّ.
  if (spec.table === 'push_subscriptions' && out.subscriber_kind === 'teacher') {
    out.user_id = teacherId
  }
  // متابعات «معرّضون للفقد» (0018): followed_by مرجع auth.users وسياسة
  // إدراجه تشترط followed_by = auth.uid() — تُعاد نسبته للمستورِد
  // (نفس معالجة activity_log أعلاه) حتى يمر الإدراج في بيئة جديدة.
  if (spec.table === 'at_risk_followups') {
    out.followed_by = teacherId
  }
  return out
}

export async function importBackup(
  teacherId: string,
  backup: BackupFile,
): Promise<ImportReport> {
  const supa = db()
  // بداية الاستيراد — تُستخدم لتمييز صفوف أنشأها تريجر الوصول أثناء هذا
  // الاستيراد نفسه (انظر معالجة guardian_notifications تحت).
  const importStartedAt = new Date().toISOString()
  const report: ImportReport = {
    tables: [],
    totalImported: 0,
    totalSkipped: 0,
    totalFailed: 0,
    settingsUpdated: false,
    errorSamples: [],
  }
  const noteError = (label: string, err: unknown) => {
    if (report.errorSamples.length >= 5) return
    const msg = err instanceof Error ? err.message : t('settings.settingsApiUnknownError')
    report.errorSamples.push(`${label}: ${msg}`)
  }

  // إعدادات المدرس أولاً (دمج محقّق في صف الحساب الحالي)
  const rawSettings = backup.data.teacher_settings
  if (rawSettings && typeof rawSettings === 'object') {
    try {
      const s = rawSettings as Record<string, unknown>
      const { data: current } = await supa
        .from('teacher_settings')
        .select(SETTINGS_COLS)
        .eq('teacher_id', teacherId)
        .maybeSingle()
      const cur = (current as unknown as TeacherSettingsRow | null) ?? null
      const centerRaw = Number(s.center_share_percent)
      const reminderRaw = Number(s.reminder_minutes)
      await updateTeacherSettings(teacherId, {
        whatsapp_template:
          typeof s.whatsapp_template === 'string' && s.whatsapp_template.trim()
            ? s.whatsapp_template
            : (cur?.whatsapp_template ?? ''),
        center_share_percent:
          Number.isFinite(centerRaw) && centerRaw >= 0 && centerRaw <= 100
            ? centerRaw
            : Number(cur?.center_share_percent) || 0,
        reminder_minutes: REMINDER_VALUES.includes(reminderRaw)
          ? reminderRaw
          : (cur?.reminder_minutes ?? 0),
        theme: isThemeMode(s.theme) ? s.theme : isThemeMode(cur?.theme) ? cur.theme : 'auto',
        // الهوية البيضاء (0008): الاسم واللهجة ينتقلان مع النسخة، أما
        // brand_logo_path فلا — ملف الشعار يعيش في مجلد حساب المصدر في
        // Storage وليس داخل ملف JSON (نفس قيد صور إثباتات الدفع)، فنبقي
        // مسار الحساب الحالي كما هو بدل مسار مدلّي لحساب آخر.
        brand_name:
          typeof s.brand_name === 'string' && s.brand_name.trim()
            ? s.brand_name
            : (cur?.brand_name ?? null),
        brand_logo_path: cur?.brand_logo_path ?? null,
        brand_accent: isValidAccent(s.brand_accent)
          ? s.brand_accent
          : (cur?.brand_accent ?? null),
        // ملخص Push اليومي (0015): التفعيل والوقت ينتقلان مع النسخة ضمن
        // صف الإعدادات (يُصدَّران تلقائياً عبر SETTINGS_COLS)، أما
        // push_daily_digest_last_sent_on فعلامة ادعاء تشغيلية ليوم
        // الإرسال في بيئة المصدر — لا تُستورد أبداً حتى لا يُحرم
        // الحساب المستورِد من ملخص يوم الاستيراد نفسه.
        push_daily_digest_enabled:
          typeof s.push_daily_digest_enabled === 'boolean'
            ? s.push_daily_digest_enabled
            : (cur?.push_daily_digest_enabled ?? true),
        push_daily_digest_time: isValidDigestTime(s.push_daily_digest_time)
          ? s.push_daily_digest_time
          : isValidDigestTime(cur?.push_daily_digest_time?.slice(0, 5))
            ? cur!.push_daily_digest_time.slice(0, 5)
            : '07:30',
      })
      report.settingsUpdated = true
    } catch (err) {
      noteError(t('settings.settingsApiSettingsLabel'), err)
    }
  }

  // المراجع المؤجلة للمرور الثاني: ذاتية (sessions/payments) أو عابرة
  // لجدول لاحق في الترتيب (scores.exam_attempt_id ← exam_attempts)
  const deferred: {
    table: string
    /** الجدول الذي يجب أن يوجد فيه الصف المستهدَف بالقيمة */
    targetTable: string
    label: string
    match: Record<string, unknown>
    field: string
    value: string
  }[] = []

  for (const spec of BACKUP_TABLES) {
    const rows = backup.data[spec.key]
    const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
    const res: TableImportResult = {
      key: spec.key,
      label: spec.label,
      imported: 0,
      skipped: 0,
      failed: 0,
    }
    report.tables.push(res)
    if (list.length === 0) continue

    // هويات الصفوف الموجودة حالياً في نطاق هذا المدرس
    const existingRows = await fetchPaged<Record<string, unknown>>((from, to) =>
      supa
        .from(spec.table)
        .select(spec.pk.join(', '))
        .eq('teacher_id', teacherId)
        .range(from, to) as unknown as Promise<PageResult<Record<string, unknown>>>,
    )
    const existing = new Set(existingRows.map((r) => pkKeyOf(spec, r)))

    // تنبيهات الوصول/المغادرة (0012): إدراج الحضور في هذا الاستيراد نفسه
    // يُطلق تريجراً ينشئ تنبيهات تلقائية بنفس القيد الفريد
    // (session_id, student_id, kind) وبوقت حدث = لحظة الاستيراد وحالة
    // قراءة فارغة — فتصطدم بصفوف النسخة الأصلية (الأقدم والأدق: event_at
    // وread_at الحقيقيان) وتفشل كتكرار. الحل: حذف الصفوف المولّدة أثناء
    // هذا الاستيراد فقط (created_at >= بدايته) لجلسات النسخة، قبل إدراج
    // صفوف النسخة — فتُستعاد التنبيهات الأصلية بأمانتها الكاملة.
    if (spec.table === 'guardian_notifications') {
      const sessionIds = [
        ...new Set(
          list
            .map((r) => r.session_id)
            .filter((v): v is string => typeof v === 'string' && !!v),
        ),
      ]
      if (sessionIds.length > 0) {
        const { error: delErr } = await supa
          .from('guardian_notifications')
          .delete()
          .eq('teacher_id', teacherId)
          .in('session_id', sessionIds)
          .gte('created_at', importStartedAt)
        if (delErr) noteError(spec.label, delErr)
      }
    }

    for (const row of list) {
      const key = pkKeyOf(spec, row)
      if (existing.has(key)) {
        res.skipped += 1
        continue
      }
      const payload = toInsertRow(spec, row, teacherId)
      // مرجع ذاتي قد يشير لصف لم يُدرج بعد داخل نفس النسخة: نُدخل بدونه
      // مؤقتاً ونصلحه في المرور الثاني بدل فشل قيد المفتاح الخارجي.
      if (spec.table === 'sessions') {
        const origin = payload.origin_session_id
        if (typeof origin === 'string' && origin) {
          deferred.push({
            table: 'sessions',
            targetTable: 'sessions',
            label: spec.label,
            match: { id: payload.id },
            field: 'origin_session_id',
            value: origin,
          })
          payload.origin_session_id = null
        }
      }
      if (spec.table === 'payments') {
        const rev = payload.reverses_payment_id
        if (typeof rev === 'string' && rev) {
          deferred.push({
            table: 'payments',
            targetTable: 'payments',
            label: spec.label,
            match: { id: payload.id },
            field: 'reverses_payment_id',
            value: rev,
          })
          payload.reverses_payment_id = null
        }
      }
      // درجة مُرحَّلة من امتحان إلكتروني (0010): محاولتها تُستورد في
      // قسم exam_attempts اللاحق لترتيب scores — نُدخل الدرجة بمصدرها
      // وبلا رابط المحاولة مؤقتاً ونصلح الرابط في المرور الثاني.
      if (spec.table === 'scores') {
        const attId = payload.exam_attempt_id
        if (typeof attId === 'string' && attId) {
          deferred.push({
            table: 'scores',
            targetTable: 'exam_attempts',
            label: spec.label,
            match: {
              assessment_id: payload.assessment_id,
              student_id: payload.student_id,
            },
            field: 'exam_attempt_id',
            value: attId,
          })
          payload.exam_attempt_id = null
        }
      }
      const { error } = await supa.from(spec.table).insert(payload)
      if (error) {
        res.failed += 1
        noteError(spec.label, error)
        continue
      }
      existing.add(key)
      res.imported += 1
    }
    report.totalImported += res.imported
    report.totalSkipped += res.skipped
    report.totalFailed += res.failed
  }

  // المرور الثاني: إصلاح المراجع المؤجلة إن وُجد طرفاها الآن — المطابقة
  // بكل أعمدة match معاً (مفتاح scores مركّب، وباقي الجداول بمعرّفها)
  for (const d of deferred) {
    const { data: target } = await supa
      .from(d.targetTable)
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('id', d.value)
      .maybeSingle()
    if (!target) continue
    let currentQ = supa
      .from(d.table)
      .select(d.field)
      .eq('teacher_id', teacherId)
    for (const [col, val] of Object.entries(d.match)) {
      currentQ = currentQ.eq(col, val as string)
    }
    const { data: current } = await currentQ.maybeSingle()
    const curVal = (current as unknown as Record<string, unknown> | null)?.[d.field]
    if (curVal != null) continue
    let updateQ = supa
      .from(d.table)
      .update({ [d.field]: d.value })
      .eq('teacher_id', teacherId)
    for (const [col, val] of Object.entries(d.match)) {
      updateQ = updateQ.eq(col, val as string)
    }
    const { error } = await updateQ
    if (error) noteError(d.label, error)
  }

  return report
}
