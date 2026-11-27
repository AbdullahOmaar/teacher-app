// ============================================================================
// تطبيق المدرس — Edge Function: assistant-chat (Phase 2 T6 — خطة ب)
// ----------------------------------------------------------------------------
// المساعد المنفّذ بلا إطار (قرار المدير ق1، 2026-11-25 ~01:07 EET):
// كود صريح على بنية التطبيق الحالية، بنمط دوال الواتساب (0045):
// منطق نقي هنا (اعتماديات محقونة) حتى تحاكيه المحاكاة المحلية
// (scripts/simulate-assistant.mjs) بنفس كود الإنتاج؛ مدخل Deno في
// index.ts يمرّر عميل Supabase بتوكن المستدعي فقط.
//
// قواعد حاكمة (وثيقة التجهيز PHASE2-T6-PREP §2):
// • هوية المستدعي دائماً: لا مفتاح إدارة (service) في هذه الدالة إطلاقاً —
//   كل قراءة وكتابة تمر بعميل المستدعي فتخضع لـ RLS كما تخضع الواجهة.
// • المالية للمالك فقط: أدوات المال تتطلب can_view_money عند العضو،
//   وRLS المالك-فقط على invoices/payments خط الدفاع الثاني.
// • لا كتابة قبل التأكيد: الاقتراح يخزّن الحمولة وهاشها خادمياً (0048)،
//   والتأكيد لا يقبل إلا الهاش المطابق، والتنفيذ يقرأ الحمولة المخزّنة.
// • الإيقاف/الإلغاء قبل التنفيذ = صفر كتابات أعمال بنيوياً.
// • لا إجابة بلا تدقيق: فشل كتابة قيد assistant_runs يوقف الرد (500) —
//   الفشل ظاهر لا صامت (نفس قاعدة «لا إرسال بلا سجل» في واتساب).
//
// حالة المزوّد (ق5): **محسوم من المالك 2026-11-25 ~02:16 EET — BYOK.**
// المدرّس يضيف مفتاح مزوّده بنفسه من إعدادات الأدمن؛ لا مفاتيح مركزية
// على حساب المنصة إطلاقاً. المفتاح يُشفَّر خادمياً هنا (AES-GCM بمفتاح
// تشفير من بيئة الدالة — ASSISTANT_KEY_ENCRYPTION_KEY، الاسم فقط) ويُخزَّن
// نصُّه المشفّر في teacher_ai_keys (مهاجرة 0049 — صفر وصول من العميل)،
// ولا يخرج صريحاً لأي عميل بعد حفظه. «المخطط» الافتراضي الآن هو
// ProviderPlanner الحقيقي (OpenAI / Anthropic / Gemini / OpenAI-compatible)
// خلف واجهة AssistantPlanner نفسها، والمخطط الاختباري الحتمي
// DeterministicTestPlanner يبقى للاختبارات والطيار (يُختار بعلم بيئة
// ASSISTANT_PLANNER=test في index.ts — افتراضياً المزوّد الحقيقي).
// أفعال إدارة المفتاح (key_status/key_save/key_delete) ليست خاضعة لعلم
// القتل: تهيئة المفتاح إعداد مالك، لا تشغيل مساعد — كإعدادات واتساب
// التي تُحفَظ حتى والمنصة مطفأة. أفعال المحادثة وحدها خلف العلم.
// ============================================================================

export interface AssistantEnv {
  ASSISTANT_ENABLED?: string
}

export type AssistantRole = 'owner' | 'assistant'

export interface CallerContext {
  role: AssistantRole
  /** صلاحيات العضو من teacher_members.permissions (المالك يتجاوزها كلها) */
  permissions: Record<string, boolean>
}

export interface BalanceRow {
  invoice_id: string
  student_id: string
  group_id: string
  period_month: string
  total: number
  paid: number
  balance: number
}

export interface StudentRow {
  id: string
  name: string
}

export interface AttendanceRow {
  student_id: string
  status: string | null
}

export interface PaymentRow {
  amount: number
  method: string
  paid_on: string
}

export interface SessionRow {
  id: string
  group_id: string
  session_date: string
  start_time: string
  kind: string
  status: string
}

export interface HomeworkMarkRow {
  session_id: string
  student_id: string
  status: string | null
  homework_done: boolean
}

/** صف مفتاح المزوّد كما يرجع من RPC القراءة (0049) — نص مشفّر فقط */
export interface StoredKeyRow {
  provider: string
  model: string | null
  base_url: string | null
  key_ciphertext: string
  key_iv: string
}

export interface ProviderKeyStatus {
  is_set: boolean
  provider?: string
  model?: string | null
  updated_at?: string
}

export interface ProposalReceipt {
  id: string
  payload_hash: string
  expires_at: string
}

export type ConfirmOutcome =
  | { ok: true; teacher_id: string; tool: string; payload: Record<string, unknown> }
  | { ok: false; error: string }

export interface AssistantDeps {
  /** يتحقق من JWT الترويسة ويرجع معرّف المستخدم أو null */
  getUserId: (req: Request) => Promise<string | null>
  /** دور المستدعي وصلاحياته داخل هذا السنتر، أو null إن لم يكن مالكاً/عضواً نشطاً */
  getCallerContext: (teacherId: string, userId: string) => Promise<CallerContext | null>
  /** أرصدة الفواتير من view ‏invoice_balances (security_invoker — RLS فعّال) */
  fetchBalances: (teacherId: string) => Promise<BalanceRow[]>
  fetchStudents: (teacherId: string) => Promise<StudentRow[]>
  /** كل صفوف الحضور للسنتر (أداة الغياب تجمع الكل في هذه الجولة) */
  fetchAttendance: (teacherId: string) => Promise<AttendanceRow[]>
  fetchPayments: (teacherId: string, from: string, to: string) => Promise<PaymentRow[]>
  fetchGroup: (teacherId: string, groupId: string) => Promise<{ id: string; name: string } | null>
  /** تنفيذ add_student بعميل المستدعي: صف طالب + تسجيل في المجموعة */
  insertStudent: (
    teacherId: string,
    payload: AddStudentPayload,
  ) => Promise<{ student_id: string }>
  /** RPC ‏assistant_begin_read — قيد قراءة مجابة أو null عند الفشل */
  beginRead: (
    teacherId: string,
    tool: string,
    request: string,
    result: unknown,
  ) => Promise<string | null>
  /** RPC ‏assistant_create_proposal — إيصال المقترح أو null عند الفشل */
  createProposal: (
    teacherId: string,
    tool: string,
    request: string,
    payload: Record<string, unknown>,
    payloadHash: string,
  ) => Promise<ProposalReceipt | null>
  /** RPC ‏assistant_confirm_proposal — يرجع الحمولة المخزّنة خادمياً */
  confirmProposal: (runId: string, payloadHash: string) => Promise<ConfirmOutcome>
  /** RPC ‏assistant_complete_run */
  completeRun: (
    runId: string,
    success: boolean,
    result: unknown,
    error: string | null,
  ) => Promise<boolean>
  /** RPC ‏assistant_cancel_run */
  cancelRun: (
    runId: string,
    reason: 'cancelled' | 'stopped',
  ) => Promise<{ ok: boolean; error?: string }>
  /** حصص مجموعة (الأحدث أولاً) — لأداة ملخص الواجب */
  fetchGroupSessions: (
    teacherId: string,
    groupId: string,
    limit: number,
  ) => Promise<SessionRow[]>
  /** علامات الواجب/الحضور لحصص معينة */
  fetchHomeworkMarks: (
    teacherId: string,
    sessionIds: string[],
  ) => Promise<HomeworkMarkRow[]>
  /** حصص مجموعة في شهر واحد (YYYY-MM) — لأداة نظرة الحصص */
  fetchSessionsInMonth: (
    teacherId: string,
    groupId: string,
    month: string,
  ) => Promise<SessionRow[]>
  fetchSession: (teacherId: string, sessionId: string) => Promise<SessionRow | null>
  fetchStudentById: (teacherId: string, studentId: string) => Promise<StudentRow | null>
  /**
   * كتابة علامة واجب طالب في حصة بعميل المستدعي — بنفس دلالة مسار حفظ
   * الحضور الموحّد في التطبيق: دمج مع الصف القائم (status/starred
   * محفوظة)، وحذف الصف إن صارت القيمة فارغة تماماً.
   */
  setHomeworkMark: (
    teacherId: string,
    sessionId: string,
    studentId: string,
    done: boolean,
  ) => Promise<void>
  /** RPC ‏generate_group_sessions (0020) بعميل المستدعي — يرجع عدد المنشأة */
  generateGroupSessions: (
    teacherId: string,
    groupId: string,
    monthDate: string,
  ) => Promise<number>
  // --- إدارة مفتاح المزوّد (BYOK — مهاجرة 0049) ---
  /** تشفير المفتاح الصريح خادمياً (AES-GCM) — يرمي عند غياب مفتاح التشفير */
  encryptApiKey: (plaintext: string) => Promise<{ ciphertext: string; iv: string }>
  /** RPC ‏assistant_save_provider_key — يستقبل النص المشفّر فقط */
  saveProviderKey: (
    teacherId: string,
    provider: string,
    model: string | null,
    baseUrl: string | null,
    ciphertext: string,
    iv: string,
  ) => Promise<ProviderKeyStatus | null>
  /** RPC ‏assistant_provider_key_status — metadata فقط */
  providerKeyStatus: (teacherId: string) => Promise<ProviderKeyStatus | null>
  /** RPC ‏assistant_delete_provider_key */
  deleteProviderKey: (teacherId: string) => Promise<boolean>
  /** RPC ‏assistant_read_provider_key — النص المشفّر فقط (للمخطط/الحالة) */
  readProviderKeyRow: (teacherId: string) => Promise<StoredKeyRow | null>
  /**
   * هل مفتاح المنصة المركزي مضبوط (بلا قيمة السر) — اختياري: غيابه =
   * غير مضبوط. يُنفَّذ في index.ts من متغيرات البيئة فقط.
   */
  platformKeyStatus?: () => { configured: boolean; provider: string | null; model: string | null }
  /**
   * فحص حد رسائل الذكاء (0062 ‏check_usage_limit) — اختياري: غيابه أو
   * أي خطأ فيه = بلا حد (يُسمح). الحد قاعدة أعمال لا حدود أمنية،
   * والملكية فُحصت قبل الوصول هنا (نمط الخطوة 5 في واتساب).
   */
  checkAiLimit?: (teacherId: string) => Promise<{
    allowed: boolean
    limit: number | null
    used: number
  } | null>
  now: () => number
}

// ----------------------------------------------------------------------------
// وصلة المخطط (provider seam) — الواجهة التي سيركب عليها مخطط المزوّد بعد ق5
// ----------------------------------------------------------------------------

export type PlannedStep =
  | { type: 'read'; tool: string; args: Record<string, unknown> }
  | { type: 'action'; tool: string; payload: Record<string, unknown> }
  | { type: 'answer'; text: string }

export interface ChatHistoryTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface PlanInput {
  message: string
  teacherId: string
  history: ChatHistoryTurn[]
}

export interface AssistantPlanner {
  plan: (input: PlanInput) => Promise<PlannedStep>
}

/**
 * خطأ مخطط مرمّز: code ثابت تترجمه الواجهة لحالة صادقة (مثلاً
 * no_api_key → «أضف مفتاحك من الإعدادات»)، وhttpStatus يقرّر فئة الرد.
 * الرسالة نفسها آمنة دائماً: لا تحتوي أي مفتاح أو سر (انظر تعقيم
 * أخطاء المزوّد في ProviderPlanner).
 */
export class PlannerError extends Error {
  code: string
  httpStatus: number
  constructor(message: string, code = 'planner_error', httpStatus = 422) {
    super(message)
    this.code = code
    this.httpStatus = httpStatus
  }
}

/**
 * ⚠️ مخطط اختباري حتمي — بديل اختبار (test double)، ليس نموذج ذكاء.
 * يفهم أوامر ثابتة حرفية فقط حتى تُختبر آلة التأكيد والأدوات والتدقيق
 * طرف-لطرف قبل وصول أي مزوّد (ق5). القواعد:
 *   unpaid                      → أداة المتأخرات
 *   absence[:<حد الغياب>]       → أداة الغياب (الحد افتراضياً 3)
 *   collect:<من>:<إلى>          → ملخص تحصيل فترة (YYYY-MM-DD)
 *   add-student:<الاسم>:<groupId> → اقتراح إضافة طالب
 *   homework:<groupId>          → ملخص واجب آخر حصة للمجموعة
 *   sessions:<groupId>:<YYYY-MM> → نظرة حصص المجموعة في شهر
 *   set-homework:<sessionId>:<studentId>:<0|1> → اقتراح تعليم واجب
 *   gen-sessions:<groupId>:<YYYY-MM> → اقتراح توليد حصص شهر
 * أي رسالة أخرى تُرفض صراحةً — لا تخمين ولا فهم لغوي هنا.
 */
export class DeterministicTestPlanner implements AssistantPlanner {
  async plan(input: PlanInput): Promise<PlannedStep> {
    const msg = input.message.trim()
    if (msg === 'unpaid') return { type: 'read', tool: 'unpaid_students', args: {} }
    if (msg === 'absence' || msg.startsWith('absence:')) {
      const raw = msg === 'absence' ? '' : msg.slice('absence:'.length)
      const min = raw === '' ? 3 : Number(raw)
      if (!Number.isInteger(min) || min < 1) {
        throw new PlannerError('absence threshold must be a positive integer')
      }
      return { type: 'read', tool: 'absence_summary', args: { min_absences: min } }
    }
    if (msg.startsWith('collect:')) {
      const parts = msg.split(':')
      if (parts.length !== 3 || !isIsoDate(parts[1]) || !isIsoDate(parts[2])) {
        throw new PlannerError('collect expects collect:<from>:<to> as YYYY-MM-DD')
      }
      return {
        type: 'read',
        tool: 'collection_summary',
        args: { from: parts[1], to: parts[2] },
      }
    }
    if (msg.startsWith('add-student:')) {
      const rest = msg.slice('add-student:'.length)
      const cut = rest.lastIndexOf(':')
      if (cut <= 0 || cut === rest.length - 1) {
        throw new PlannerError('add-student expects add-student:<name>:<groupId>')
      }
      return {
        type: 'action',
        tool: 'add_student',
        payload: { name: rest.slice(0, cut).trim(), group_id: rest.slice(cut + 1).trim() },
      }
    }
    if (msg.startsWith('homework:')) {
      const groupId = msg.slice('homework:'.length).trim()
      if (!groupId) throw new PlannerError('homework expects homework:<groupId>')
      return { type: 'read', tool: 'homework_summary', args: { group_id: groupId } }
    }
    if (msg.startsWith('sessions:')) {
      const parts = msg.split(':')
      if (parts.length !== 3 || !parts[1] || !/^\d{4}-\d{2}$/.test(parts[2])) {
        throw new PlannerError('sessions expects sessions:<groupId>:<YYYY-MM>')
      }
      return {
        type: 'read',
        tool: 'sessions_overview',
        args: { group_id: parts[1], month: parts[2] },
      }
    }
    if (msg.startsWith('set-homework:')) {
      const parts = msg.split(':')
      if (parts.length !== 4 || !parts[1] || !parts[2] || !['0', '1'].includes(parts[3])) {
        throw new PlannerError(
          'set-homework expects set-homework:<sessionId>:<studentId>:<0|1>',
        )
      }
      return {
        type: 'action',
        tool: 'set_homework',
        payload: { session_id: parts[1], student_id: parts[2], done: parts[3] === '1' },
      }
    }
    if (msg.startsWith('gen-sessions:')) {
      const parts = msg.split(':')
      if (parts.length !== 3 || !parts[1] || !/^\d{4}-\d{2}$/.test(parts[2])) {
        throw new PlannerError('gen-sessions expects gen-sessions:<groupId>:<YYYY-MM>')
      }
      return {
        type: 'action',
        tool: 'generate_sessions',
        payload: { group_id: parts[1], month: parts[2] },
      }
    }
    throw new PlannerError(
      'unrecognized command (deterministic test planner — not a model)',
    )
  }
}

// ----------------------------------------------------------------------------
// مخطط المزوّد الحقيقي (ق5 — BYOK): ينادي API المزوّد بمفتاح المدرّس نفسه
// (يُفكّ خادمياً في index.ts ويصل هنا صريحاً في الذاكرة فقط — لا يُسجَّل
// ولا يدخل أي رسالة خطأ؛ انظر sanitizeProviderError).
// البُناة والمحلّلات دوال نقية تُختبر بمحاكاة HTTP، والنداء نفسه عبر
// fetchFn محقون. خطوة واحدة لكل رسالة (نفس دلالة آلة التأكيد): أول
// استدعاء أداة يقرّره النموذج هو الخطوة، وما عداه يُترك للرسالة التالية
// وسياق المحادثة يحمل النتائج.
// ----------------------------------------------------------------------------

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'openai_compatible'

export interface ProviderKeyConfig {
  provider: ProviderId
  model: string | null
  base_url: string | null
  api_key: string
  /** مصدر المفتاح: مفتاح المدرس (BYOK) أو مفتاح المنصة المركزي */
  source?: 'byok' | 'platform'
}

/**
 * حلّ مفتاح المنصة المركزي من متغيرات بيئة الدالة (أسماء فقط — بلا قيم
 * في الكود): ASSISTANT_PLATFORM_API_KEY (+ PROVIDER/MODEL/BASE_URL).
 * دالة نقية تُختبر مباشرة. غياب المفتاح = null (المسار نائم — التفعيل
 * الحي قرار مالك تجاري، لا يُضبط هنا أبداً). مزوّد غير مدعوم = null.
 */
export interface PlatformKeyEnv {
  apiKey?: string
  provider?: string
  model?: string | null
  baseUrl?: string | null
}

export function resolvePlatformKeyConfig(env: PlatformKeyEnv): ProviderKeyConfig | null {
  const apiKey = (env.apiKey ?? '').trim()
  if (!apiKey) return null
  const provider = (env.provider ?? 'openai').trim()
  if (!['openai', 'anthropic', 'gemini', 'openai_compatible'].includes(provider)) {
    return null
  }
  return {
    provider: provider as ProviderId,
    model: env.model ?? null,
    base_url: env.baseUrl ?? null,
    api_key: apiKey,
    source: 'platform',
  }
}

export interface ProviderPlannerDeps {
  /** مفتاح المدرّس مفكوكاً خادمياً، أو null إن لم يُضف مفتاحاً بعد */
  resolveKey: (teacherId: string) => Promise<ProviderKeyConfig | null>
  /** مجموعات السنتر (اسم + معرّف) لسياق النموذج — فشلها لا يقتل النداء */
  loadGroups: (teacherId: string) => Promise<{ id: string; name: string }[]>
  fetchFn?: typeof fetch
  timeoutMs?: number
}

/** نماذج افتراضية موثّقة — المدرّس يستطيع تجاوزها بحقل النموذج الاختياري */
export const PROVIDER_DEFAULT_MODELS: Record<ProviderId, string | null> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5',
  gemini: 'gemini-3.1-flash-lite',
  // للمزوّدات المتوافقة لا افتراضي آمن: اسم النموذج عند المدرّس إلزامي
  openai_compatible: null,
}

interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

const NO_PARAMS: Record<string, unknown> = {
  type: 'object',
  properties: {},
  additionalProperties: false,
}

export const ASSISTANT_TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'unpaid_students',
    description: 'قراءة: الطلاب المتأخرون في الدفع وأرصدتهم المستحقة (للمالك/من له صلاحية المال)',
    parameters: NO_PARAMS,
  },
  {
    name: 'absence_summary',
    description: 'قراءة: ملخص الغياب — الطلاب الذين بلغ غيابهم حداً معيناً',
    parameters: {
      type: 'object',
      properties: {
        min_absences: { type: 'integer', description: 'حد الغياب الأدنى (افتراضي 3)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'collection_summary',
    description: 'قراءة: ملخص التحصيل (المدفوعات الصافية) في فترة تاريخية',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'من تاريخ YYYY-MM-DD' },
        to: { type: 'string', description: 'إلى تاريخ YYYY-MM-DD' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'homework_summary',
    description: 'قراءة: ملخص تسليم الواجب في آخر حصة لمجموعة (الحاضرون/المسلّمون/المتخلفون)',
    parameters: {
      type: 'object',
      properties: { group_id: { type: 'string', description: 'معرّف المجموعة من قائمة السنتر' } },
      required: ['group_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'sessions_overview',
    description: 'قراءة: حصص مجموعة في شهر معين (YYYY-MM)',
    parameters: {
      type: 'object',
      properties: {
        group_id: { type: 'string', description: 'معرّف المجموعة من قائمة السنتر' },
        month: { type: 'string', description: 'الشهر بصيغة YYYY-MM' },
      },
      required: ['group_id', 'month'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_student',
    description: 'إجراء (يُقترح ولا يُنفّذ إلا بعد تأكيد المستخدم): إضافة طالب جديد وتسجيله في مجموعة',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'اسم الطالب' },
        group_id: { type: 'string', description: 'معرّف المجموعة من قائمة السنتر' },
        phone: { type: 'string' },
        guardian_name: { type: 'string' },
        guardian_phone: { type: 'string' },
        grade: { type: 'string', description: 'الصف الدراسي' },
      },
      required: ['name', 'group_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_homework',
    description:
      'إجراء (يُقترح ولا يُنفّذ إلا بعد تأكيد المستخدم): تعليم واجب طالب في حصة كمسلّم أو غير مسلّم',
    parameters: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'معرّف الحصة (يظهر في نتائج الأدوات السابقة)' },
        student_id: { type: 'string', description: 'معرّف الطالب (يظهر في نتائج الأدوات السابقة)' },
        done: { type: 'boolean', description: 'true = سلّم الواجب' },
      },
      required: ['session_id', 'student_id', 'done'],
      additionalProperties: false,
    },
  },
  {
    name: 'generate_sessions',
    description:
      'إجراء (يُقترح ولا يُنفّذ إلا بعد تأكيد المستخدم): توليد حصص مجموعة لشهر (YYYY-MM) حسب جدولها الأسبوعي',
    parameters: {
      type: 'object',
      properties: {
        group_id: { type: 'string', description: 'معرّف المجموعة من قائمة السنتر' },
        month: { type: 'string', description: 'الشهر بصيغة YYYY-MM' },
      },
      required: ['group_id', 'month'],
      additionalProperties: false,
    },
  },
]

export function buildSystemPrompt(groups: { id: string; name: string }[]): string {
  const groupLines = groups.length
    ? groups.map((g) => `- ${g.name} (المعرّف: ${g.id})`).join('\n')
    : '(لا مجموعات ظاهرة)'
  return [
    'أنت المساعد الذكي داخل تطبيق إدارة سنتر دروس خصوصية في مصر. تتكلم العربية دائماً وباختصار ووضوح.',
    'قواعد صارمة:',
    '1) أي رقم أو معلومة عن السنتر (متأخرات، غياب، تحصيل، واجب، حصص) لا تأتي إلا من استدعاء أداة — لا تخترع أرقاماً أو أسماء أبداً.',
    '2) أدوات الإجراء (إضافة طالب، تعليم واجب، توليد حصص) تُقترح فقط: النظام يعرضها على المستخدم ويطلب تأكيده قبل أي تنفيذ — لا تدّعِ أن إجراءً نُفّذ.',
    '3) خطوة واحدة في كل رد: استدعِ أداة واحدة كحد أقصى، أو أجب نصياً.',
    '4) لو كان الطلب خارج أدواتك، اشرح باختصار ما تستطيع فعله بدلاً من التنفيذ.',
    '5) استخدم معرّفات المجموعات من القائمة التالية حرفياً عند الحاجة:',
    groupLines,
  ].join('\n')
}

export interface ProviderRequest {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

function modelFor(cfg: ProviderKeyConfig): string {
  if (cfg.model) return cfg.model
  const fallback = PROVIDER_DEFAULT_MODELS[cfg.provider]
  if (!fallback) {
    throw new PlannerError(
      'a model name is required for this provider (set it in the key settings)',
      'model_required',
      422,
    )
  }
  return fallback
}

/** بناء طلب المزوّد — دالة نقية (تُختبر بمحاكاة HTTP) */
export function buildProviderRequest(
  cfg: ProviderKeyConfig,
  input: PlanInput,
  groups: { id: string; name: string }[],
): ProviderRequest {
  const system = buildSystemPrompt(groups)
  const model = modelFor(cfg)
  const turns = [...input.history, { role: 'user' as const, text: input.message }]
  if (cfg.provider === 'openai' || cfg.provider === 'openai_compatible') {
    const base =
      cfg.provider === 'openai'
        ? 'https://api.openai.com/v1'
        : (cfg.base_url ?? '').replace(/\/+$/, '')
    if (!base) {
      throw new PlannerError('openai_compatible needs a base_url', 'model_required', 422)
    }
    return {
      url: `${base}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.api_key}`,
      },
      body: {
        model,
        messages: [
          { role: 'system', content: system },
          ...turns.map((t) => ({
            role: t.role === 'user' ? 'user' : 'assistant',
            content: t.text,
          })),
        ],
        tools: ASSISTANT_TOOL_SCHEMAS.map((s) => ({
          type: 'function',
          function: { name: s.name, description: s.description, parameters: s.parameters },
        })),
        tool_choice: 'auto',
      },
    }
  }
  if (cfg.provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.api_key,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model,
        max_tokens: 1024,
        system,
        messages: turns.map((t) => ({
          role: t.role === 'user' ? 'user' : 'assistant',
          content: t.text,
        })),
        tools: ASSISTANT_TOOL_SCHEMAS.map((s) => ({
          name: s.name,
          description: s.description,
          input_schema: s.parameters,
        })),
      },
    }
  }
  // gemini
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': cfg.api_key,
    },
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map((t) => ({
        role: t.role === 'user' ? 'user' : 'model',
        parts: [{ text: t.text }],
      })),
      tools: [{ functionDeclarations: ASSISTANT_TOOL_SCHEMAS }],
    },
  }
}

function stepFromToolCall(name: string, args: Record<string, unknown>): PlannedStep {
  const spec = ASSISTANT_TOOLS[name]
  if (!spec) {
    throw new PlannerError(`provider picked an unknown tool: ${name}`, 'provider_protocol', 502)
  }
  return spec.kind === 'read'
    ? { type: 'read', tool: name, args }
    : { type: 'action', tool: name, payload: args }
}

function answerStep(text: string): PlannedStep {
  const clean = text.trim()
  if (!clean) {
    throw new PlannerError('provider returned an empty answer', 'provider_protocol', 502)
  }
  return { type: 'answer', text: clean }
}

/** تحليل رد المزوّد إلى خطوة — دالة نقية */
export function parseProviderResponse(provider: ProviderId, json: unknown): PlannedStep {
  if (!isRecord(json)) {
    throw new PlannerError('provider returned a non-object response', 'provider_protocol', 502)
  }
  if (provider === 'openai' || provider === 'openai_compatible') {
    const choices = Array.isArray(json.choices) ? json.choices : []
    const message = isRecord(choices[0]) && isRecord(choices[0].message) ? choices[0].message : null
    if (!message) {
      throw new PlannerError('provider response has no message', 'provider_protocol', 502)
    }
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : []
    const first = isRecord(calls[0]) ? calls[0] : null
    if (first && isRecord(first.function) && typeof first.function.name === 'string') {
      let args: Record<string, unknown> = {}
      if (typeof first.function.arguments === 'string' && first.function.arguments.trim()) {
        try {
          const parsed: unknown = JSON.parse(first.function.arguments)
          if (isRecord(parsed)) args = parsed
        } catch {
          throw new PlannerError('provider tool arguments are not valid JSON', 'provider_protocol', 502)
        }
      }
      return stepFromToolCall(first.function.name, args)
    }
    return answerStep(typeof message.content === 'string' ? message.content : '')
  }
  if (provider === 'anthropic') {
    const blocks = Array.isArray(json.content) ? json.content : []
    let text = ''
    for (const block of blocks) {
      if (!isRecord(block)) continue
      if (block.type === 'tool_use' && typeof block.name === 'string') {
        return stepFromToolCall(block.name, isRecord(block.input) ? block.input : {})
      }
      if (block.type === 'text' && typeof block.text === 'string') text += block.text
    }
    return answerStep(text)
  }
  // gemini
  const candidates = Array.isArray(json.candidates) ? json.candidates : []
  const content =
    isRecord(candidates[0]) && isRecord(candidates[0].content) ? candidates[0].content : null
  const parts = content && Array.isArray(content.parts) ? content.parts : []
  let text = ''
  for (const part of parts) {
    if (!isRecord(part)) continue
    if (isRecord(part.functionCall) && typeof part.functionCall.name === 'string') {
      return stepFromToolCall(
        part.functionCall.name,
        isRecord(part.functionCall.args) ? part.functionCall.args : {},
      )
    }
    if (typeof part.text === 'string') text += part.text
  }
  return answerStep(text)
}

/**
 * تعقيم رسالة خطأ المزوّد قبل وصولها للعميل/السجل: استخراج رسالة الخطأ،
 * قصّها، و — دفاعاً في العمق — حذف أي ظهور لمفتاح المزوّد نفسه منها
 * (المفتاح لا يدخل الرسائل من عندنا أصلاً، لكن مزوّداً قد يردّده).
 */
export function sanitizeProviderError(status: number, bodyText: string, apiKey: string): string {
  let message = ''
  try {
    const parsed: unknown = JSON.parse(bodyText)
    if (isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.message === 'string') {
      message = parsed.error.message
    }
  } catch {
    message = ''
  }
  if (!message) message = bodyText.slice(0, 200)
  if (apiKey) message = message.split(apiKey).join('***')
  return `provider error (HTTP ${status}): ${message.slice(0, 250)}`
}

export class ProviderPlanner implements AssistantPlanner {
  private deps: ProviderPlannerDeps
  constructor(deps: ProviderPlannerDeps) {
    this.deps = deps
  }

  async plan(input: PlanInput): Promise<PlannedStep> {
    const cfg = await this.deps.resolveKey(input.teacherId)
    if (!cfg) {
      throw new PlannerError(
        'no provider key configured for this centre — add your key in Settings',
        'no_api_key',
        422,
      )
    }
    const groups = await this.deps.loadGroups(input.teacherId).catch(() => [])
    const request = buildProviderRequest(cfg, input, groups)
    const fetchFn = this.deps.fetchFn ?? fetch
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.deps.timeoutMs ?? 30_000)
    let response: Response
    try {
      response = await fetchFn(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: controller.signal,
      })
    } catch {
      // فشل شبكة/مهلة: رسالة آمنة بلا أي تفاصيل داخلية
      throw new PlannerError('provider request failed (network or timeout)', 'provider_error', 502)
    } finally {
      clearTimeout(timer)
    }
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      throw new PlannerError(
        sanitizeProviderError(response.status, bodyText, cfg.api_key),
        'provider_error',
        502,
      )
    }
    let json: unknown
    try {
      json = await response.json()
    } catch {
      throw new PlannerError('provider returned invalid JSON', 'provider_protocol', 502)
    }
    return parseProviderResponse(cfg.provider, json)
  }
}

// ----------------------------------------------------------------------------
// سجل الأدوات: النوع + صلاحية العضو المقابلة (المالك له الكل)
// ----------------------------------------------------------------------------

export interface AddStudentPayload {
  name: string
  group_id: string
  phone?: string
  guardian_name?: string
  guardian_phone?: string
  grade?: string
}

interface ToolSpec {
  kind: 'read' | 'action'
  permission: string
}

export const ASSISTANT_TOOLS: Record<string, ToolSpec> = {
  unpaid_students: { kind: 'read', permission: 'can_view_money' },
  absence_summary: { kind: 'read', permission: 'can_take_attendance' },
  collection_summary: { kind: 'read', permission: 'can_view_money' },
  homework_summary: { kind: 'read', permission: 'can_take_attendance' },
  sessions_overview: { kind: 'read', permission: 'can_manage_groups' },
  add_student: { kind: 'action', permission: 'can_manage_students' },
  set_homework: { kind: 'action', permission: 'can_take_attendance' },
  generate_sessions: { kind: 'action', permission: 'can_manage_groups' },
}

// ----------------------------------------------------------------------------
// مصفوفة الصلاحيات المعلنة (مهمة 22): تُشتق من سجل الأدوات نفسه فلا
// تنحرف عنه أبداً — القراءات تُنفَّذ مباشرة، والإجراءات تُقترح أولاً
// وتحتاج تأكيد المدرس. تُنشر للمدرس عبر فعل 'permissions' (بلا علم
// القتل — معلومة لا تشغيل).
// ----------------------------------------------------------------------------
export type MatrixExecution = 'direct' | 'confirm'

export interface PermissionMatrixEntry {
  tool: string
  description: string
  kind: 'read' | 'action'
  execution: MatrixExecution
}

export interface AssistantPermissionMatrix {
  /** ماذا يقرأ المساعد من بيانات السنتر */
  reads: PermissionMatrixEntry[]
  /** ماذا ينفّذ لوحده فوراً (القراءات — بلا تأكيد) */
  direct: PermissionMatrixEntry[]
  /** ماذا يحتاج تأكيدك قبل تنفيذه */
  confirm: PermissionMatrixEntry[]
}

export function buildPermissionMatrix(): AssistantPermissionMatrix {
  const byName = new Map(ASSISTANT_TOOL_SCHEMAS.map((s) => [s.name, s.description]))
  const entries: PermissionMatrixEntry[] = Object.entries(ASSISTANT_TOOLS).map(
    ([tool, spec]) => ({
      tool,
      description: byName.get(tool) ?? tool,
      kind: spec.kind,
      execution: spec.kind === 'read' ? 'direct' : 'confirm',
    }),
  )
  const reads = entries.filter((e) => e.kind === 'read')
  return {
    reads,
    direct: reads,
    confirm: entries.filter((e) => e.kind === 'action'),
  }
}

function hasToolPermission(ctx: CallerContext, spec: ToolSpec): boolean {
  return ctx.role === 'owner' || ctx.permissions[spec.permission] === true
}

// ----------------------------------------------------------------------------
// دوال حساب نقية (تُختبر مباشرة في المحاكاة)
// ----------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
}

export interface UnpaidStudentLine {
  student_id: string
  name: string
  balance: number
  overdue_balance: number
  open_invoices: number
}

export function computeUnpaid(
  balances: BalanceRow[],
  students: StudentRow[],
  currentMonth: string,
): { students: UnpaidStudentLine[]; count: number; total_balance: number; overdue_total: number } {
  const names = new Map(students.map((s) => [s.id, s.name]))
  const byStudent = new Map<string, UnpaidStudentLine>()
  for (const b of balances) {
    if (b.balance <= 0) continue
    const cur = byStudent.get(b.student_id) ?? {
      student_id: b.student_id,
      name: names.get(b.student_id) ?? '',
      balance: 0,
      overdue_balance: 0,
      open_invoices: 0,
    }
    cur.balance = round2(cur.balance + b.balance)
    if (b.period_month < currentMonth) {
      cur.overdue_balance = round2(cur.overdue_balance + b.balance)
    }
    cur.open_invoices += 1
    byStudent.set(b.student_id, cur)
  }
  const rows = [...byStudent.values()].sort((a, b) => b.balance - a.balance)
  return {
    students: rows,
    count: rows.length,
    total_balance: round2(rows.reduce((s, r) => s + r.balance, 0)),
    overdue_total: round2(rows.reduce((s, r) => s + r.overdue_balance, 0)),
  }
}

export interface AbsenceLine {
  student_id: string
  name: string
  absences: number
}

export function computeAbsence(
  attendance: AttendanceRow[],
  students: StudentRow[],
  minAbsences: number,
): { students: AbsenceLine[]; total_absences: number; marked_rows: number } {
  const names = new Map(students.map((s) => [s.id, s.name]))
  const counts = new Map<string, number>()
  let marked = 0
  for (const row of attendance) {
    if (row.status === null) continue
    marked += 1
    if (row.status === 'a') {
      counts.set(row.student_id, (counts.get(row.student_id) ?? 0) + 1)
    }
  }
  const rows = [...counts.entries()]
    .map(([student_id, absences]) => ({
      student_id,
      name: names.get(student_id) ?? '',
      absences,
    }))
    .filter((r) => r.absences >= minAbsences)
    .sort((a, b) => b.absences - a.absences)
  return {
    students: rows,
    total_absences: [...counts.values()].reduce((s, n) => s + n, 0),
    marked_rows: marked,
  }
}

export function computeCollection(
  payments: PaymentRow[],
): { total: number; count: number; by_method: Record<string, number> } {
  // دلالة السجل الصافي (نفس view ‏invoice_balances): دفعات العكس صفوف
  // سالبة بقيمتها، فالمجموع المباشر هو الصافي الفعلي للفترة.
  const byMethod: Record<string, number> = {}
  let total = 0
  for (const p of payments) {
    total += p.amount
    byMethod[p.method] = round2((byMethod[p.method] ?? 0) + p.amount)
  }
  return { total: round2(total), count: payments.length, by_method: byMethod }
}

/** حاضر فعلياً — نفس دلالة isAttended في التطبيق (p/l/m) */
function isAttendedStatus(status: string | null): boolean {
  return status === 'p' || status === 'l' || status === 'm'
}

export interface HomeworkPendingLine {
  student_id: string
  name: string
}

/**
 * ملخص واجب حصة واحدة — نفس دلالة summarizeHomework في التطبيق:
 * المتابعة للحاضرين أساساً؛ الغائب ومن بلا حالة لا يدخلون العدّادات.
 */
export function computeHomeworkSummary(
  session: SessionRow | null,
  marks: HomeworkMarkRow[],
  students: StudentRow[],
): {
  session: { id: string; session_date: string; start_time: string } | null
  attended: number
  submitted: number
  pending: number
  rate: number | null
  pending_students: HomeworkPendingLine[]
} {
  if (!session) {
    return { session: null, attended: 0, submitted: 0, pending: 0, rate: null, pending_students: [] }
  }
  const names = new Map(students.map((s) => [s.id, s.name]))
  let attended = 0
  let submitted = 0
  const pendingStudents: HomeworkPendingLine[] = []
  for (const m of marks) {
    if (m.session_id !== session.id) continue
    if (!isAttendedStatus(m.status)) continue
    attended += 1
    if (m.homework_done) submitted += 1
    else pendingStudents.push({ student_id: m.student_id, name: names.get(m.student_id) ?? '' })
  }
  return {
    session: { id: session.id, session_date: session.session_date, start_time: session.start_time },
    attended,
    submitted,
    pending: attended - submitted,
    rate: attended > 0 ? Math.round((submitted / attended) * 100) : null,
    pending_students: pendingStudents,
  }
}

// ----------------------------------------------------------------------------
// تشفير مفتاح المزوّد (BYOK) — AES-GCM خادمي فقط. مفتاح التشفير (32 بايت،
// base64) من بيئة الدالة حصراً؛ الدوال هنا نقية وتأخذ البايتات صراحةً
// حتى تُختبر في المحاكاة، وindex.ts هو من يقرأ البيئة.
// ----------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** يفكّ مفتاح التشفير من base64 — يرمي إن لم يكن 32 بايت بالضبط */
export function parseEncryptionKey(b64: string): Uint8Array {
  const bytes = base64ToBytes(b64.trim())
  if (bytes.length !== 32) {
    throw new Error('encryption key must be 32 bytes (base64)')
  }
  return bytes
}

export async function aesGcmEncrypt(
  plaintext: string,
  keyBytes: Uint8Array,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await globalThis.crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [
    'encrypt',
  ])
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const cipher = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return { ciphertext: bytesToBase64(new Uint8Array(cipher)), iv: bytesToBase64(iv) }
}

export async function aesGcmDecrypt(
  ciphertextB64: string,
  ivB64: string,
  keyBytes: Uint8Array,
): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [
    'decrypt',
  ])
  const plain = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivB64) },
    key,
    base64ToBytes(ciphertextB64),
  )
  return new TextDecoder().decode(plain)
}
/** JSON حتمي (مفاتيح مرتبة على كل المستويات) — أساس هاش الحمولة المستقر */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

export async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(payload))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ----------------------------------------------------------------------------
// المعالج الرئيسي
// ----------------------------------------------------------------------------

// CORS للمتصفح: الاستدعاء من التطبيق يمرّ بـ preflight OPTIONS
// (Authorization + apikey + content-type ترويسات غير بسيطة)، فبلا معالج
// OPTIONS وبلا ترويسات CORS يُحجب النداء قبل وصوله للدالة (405 بلا
// Access-Control-* — ثبت حياً 2026-11-25). النمط الموثّق من Supabase:
// ‏Allow-Origin: * يصلح مع ترويسة Authorization (بلا كوكيز/credentials).
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function jsonError(status: number, message: string, code?: string): Response {
  return json(status, {
    error: { http_code: status, message, ...(code ? { code } : {}) },
  })
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validateAddStudentPayload(
  payload: Record<string, unknown>,
): AddStudentPayload | null {
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const groupId = typeof payload.group_id === 'string' ? payload.group_id.trim() : ''
  if (!name || !groupId) return null
  const out: AddStudentPayload = { name, group_id: groupId }
  for (const key of ['phone', 'guardian_name', 'guardian_phone', 'grade'] as const) {
    const v = payload[key]
    if (typeof v === 'string' && v.trim()) out[key] = v.trim()
  }
  return out
}

const KEY_ACTIONS = new Set(['key_status', 'key_save', 'key_delete'])
const CHAT_ACTIONS = new Set(['message', 'confirm', 'stop', 'cancel'])

export async function handleAssistantChat(
  req: Request,
  env: AssistantEnv,
  deps: AssistantDeps,
  planner: AssistantPlanner,
  log: (msg: string) => void,
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonError(405, 'POST only')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'request body must be JSON')
  }
  if (!isRecord(body)) return jsonError(400, 'request body must be a JSON object')
  const teacherId = typeof body.teacher_id === 'string' ? body.teacher_id : ''
  const action = typeof body.action === 'string' ? body.action : ''
  if (!teacherId) return jsonError(400, 'teacher_id is required')

  // بوابة Kill switch المنصة — لأفعال المحادثة فقط، وقبل أي أثر جانبي
  // (نمط 3A-300: غياب العلم = OFF). أفعال إدارة المفتاح والحالة إعدادات
  // مالك لا تشغيل مساعد، فتبقى متاحة والمساعد مطفأ — كإعدادات واتساب.
  if (CHAT_ACTIONS.has(action) && env.ASSISTANT_ENABLED !== 'true') {
    return jsonError(503, 'assistant is disabled')
  }

  const userId = await deps.getUserId(req)
  if (!userId) return jsonError(401, 'invalid or missing JWT')

  const ctx = await deps.getCallerContext(teacherId, userId)
  if (!ctx) return jsonError(403, 'not a member of this centre')

  if (KEY_ACTIONS.has(action)) {
    return handleKeyAction(action, body, teacherId, ctx, deps)
  }
  if (action === 'status') {
    let row: StoredKeyRow | null = null
    try {
      row = await deps.readProviderKeyRow(teacherId)
    } catch {
      return jsonError(500, 'assistant status check failed')
    }
    // مصدر المفتاح الفعّال: BYOK أولاً، ثم مفتاح المنصة المركزي —
    // نفس ترتيب الحلّ في المخطط (مهمة 22). غياب الدالة الاختيارية =
    // غير مضبوط (محاكاة/عقود قديمة).
    const platform = deps.platformKeyStatus?.() ?? {
      configured: false,
      provider: null,
      model: null,
    }
    return json(200, {
      status: 'ok',
      enabled: env.ASSISTANT_ENABLED === 'true',
      has_key: row !== null || platform.configured,
      provider: row?.provider ?? platform.provider,
      key_source: row !== null ? 'byok' : platform.configured ? 'platform' : null,
    })
  }
  if (action === 'permissions') {
    // مصفوفة الصلاحيات المعلنة (مهمة 22): معلومة منشورة لا تشغيل —
    // خارج علم القتل كالحالة، فيراها المدرس والمساعد مطفأ.
    return json(200, { status: 'ok', matrix: buildPermissionMatrix() })
  }
  if (action === 'message') {
    return handleMessage(body, teacherId, ctx, deps, planner, log)
  }
  if (action === 'confirm') {
    return handleConfirm(body, teacherId, deps, log)
  }
  if (action === 'stop' || action === 'cancel') {
    const runId = typeof body.run_id === 'string' ? body.run_id : ''
    if (!runId) return jsonError(400, 'run_id is required')
    const res = await deps.cancelRun(runId, action === 'stop' ? 'stopped' : 'cancelled')
    if (!res.ok) return jsonError(409, res.error ?? 'run cannot be cancelled')
    return json(200, { status: action === 'stop' ? 'stopped' : 'cancelled', run_id: runId })
  }
  return jsonError(400, `unknown action: ${action || '(missing)'}`)
}

/**
 * إدارة مفتاح المزوّد (BYOK — 0049): مالك السنتر فقط، والمفتاح الصريح
 * يمر هنا مرة واحدة (يُشفَّر فوراً ولا يُسجَّل ولا يُعاد في أي رد).
 */
async function handleKeyAction(
  action: string,
  body: Record<string, unknown>,
  teacherId: string,
  ctx: CallerContext,
  deps: AssistantDeps,
): Promise<Response> {
  if (ctx.role !== 'owner') {
    return jsonError(403, 'only the centre owner can manage the provider key')
  }
  if (action === 'key_status') {
    const status = await deps.providerKeyStatus(teacherId)
    if (!status) return jsonError(500, 'key status check failed')
    return json(200, {
      status: 'key_status',
      is_set: status.is_set,
      provider: status.provider ?? null,
      model: status.model ?? null,
      updated_at: status.updated_at ?? null,
    })
  }
  if (action === 'key_delete') {
    const ok = await deps.deleteProviderKey(teacherId)
    if (!ok) return jsonError(500, 'key delete failed')
    return json(200, { status: 'key_deleted', is_set: false })
  }
  // key_save
  const provider = typeof body.provider === 'string' ? body.provider : ''
  if (!['openai', 'anthropic', 'gemini', 'openai_compatible'].includes(provider)) {
    return jsonError(400, 'unsupported provider')
  }
  const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : ''
  if (apiKey.length < 8 || apiKey.length > 4096) {
    return jsonError(400, 'api_key is required (8-4096 chars)')
  }
  const model =
    typeof body.model === 'string' && body.model.trim()
      ? body.model.trim().slice(0, 100)
      : null
  const baseUrl =
    typeof body.base_url === 'string' && body.base_url.trim() ? body.base_url.trim() : null
  if (provider === 'openai_compatible' && (!baseUrl || !baseUrl.startsWith('https://'))) {
    return jsonError(400, 'openai_compatible needs an https base_url')
  }
  let encrypted: { ciphertext: string; iv: string }
  try {
    encrypted = await deps.encryptApiKey(apiKey)
  } catch {
    return jsonError(500, 'key storage is not configured on the platform')
  }
  const saved = await deps.saveProviderKey(
    teacherId,
    provider,
    model,
    baseUrl,
    encrypted.ciphertext,
    encrypted.iv,
  )
  if (!saved) return jsonError(500, 'key save failed')
  return json(200, {
    status: 'key_saved',
    is_set: true,
    provider: saved.provider ?? provider,
    model: saved.model ?? model,
    updated_at: saved.updated_at ?? null,
  })
}

function parseHistory(body: Record<string, unknown>): ChatHistoryTurn[] {
  if (!Array.isArray(body.history)) return []
  const turns: ChatHistoryTurn[] = []
  for (const raw of body.history.slice(-10)) {
    if (!isRecord(raw)) continue
    const role = raw.role === 'assistant' ? 'assistant' : raw.role === 'user' ? 'user' : null
    const text = typeof raw.text === 'string' ? raw.text.slice(0, 2000) : ''
    if (role && text) turns.push({ role, text })
  }
  return turns
}

async function handleMessage(
  body: Record<string, unknown>,
  teacherId: string,
  ctx: CallerContext,
  deps: AssistantDeps,
  planner: AssistantPlanner,
  log: (msg: string) => void,
): Promise<Response> {
  const message = typeof body.message === 'string' ? body.message : ''
  if (!message.trim()) return jsonError(400, 'message is required')

  // حد رسائل الذكاء للباقة (مهمة 22 + 0062): قبل أي نداء نموذج —
  // فالرسالة المرفوضة لا تستهلك شيئاً. غياب الدالة أو أي خطأ فيها =
  // بلا حد (يُسمح) — الحد قاعدة أعمال لا حدود أمنية (نمط الخطوة 5).
  if (deps.checkAiLimit) {
    let check: { allowed: boolean; limit: number | null; used: number } | null = null
    try {
      check = await deps.checkAiLimit(teacherId)
    } catch {
      check = null
    }
    if (check && !check.allowed) {
      return jsonError(429, 'ai usage limit reached', 'limit_reached')
    }
  }

  let step: PlannedStep
  try {
    step = await planner.plan({
      message,
      teacherId,
      history: parseHistory(body),
    })
  } catch (e) {
    if (e instanceof PlannerError) return jsonError(e.httpStatus, e.message, e.code)
    throw e
  }

  // إجابة نصية من المخطط (بلا أدوات): تُدقَّق كقراءة ولا تلمس بيانات
  if (step.type === 'answer') {
    const runId = await deps.beginRead(teacherId, 'assistant_answer', message, {
      text: step.text,
    })
    if (!runId) return jsonError(500, 'audit write failed')
    return json(200, {
      status: 'answered',
      run_id: runId,
      tool: 'assistant_answer',
      result: { text: step.text },
    })
  }

  const spec = ASSISTANT_TOOLS[step.tool]
  if (!spec) return jsonError(422, `unknown tool: ${step.tool}`)
  // بوابة الصلاحية قبل أي جلب بيانات — الرفض لا يلمس البيانات أصلاً
  if (!hasToolPermission(ctx, spec)) {
    return jsonError(403, `missing permission: ${spec.permission}`)
  }

  if (step.type === 'read') {
    if (spec.kind !== 'read') return jsonError(422, `tool ${step.tool} is not a read tool`)
    const result = await runReadTool(step.tool, step.args, teacherId, deps)
    if (!result.ok) return jsonError(400, result.error)
    // لا إجابة بلا تدقيق: فشل القيد يوقف الرد كله
    const runId = await deps.beginRead(teacherId, step.tool, message, result.data)
    if (!runId) return jsonError(500, 'audit write failed')
    return json(200, { status: 'answered', run_id: runId, tool: step.tool, result: result.data })
  }

  // إجراء: تحقق شكلي من الحمولة ثم اقتراح فقط — صفر كتابات أعمال هنا
  if (spec.kind !== 'action') return jsonError(422, `tool ${step.tool} is not an action tool`)
  const payload = normalizeActionPayload(step.tool, step.payload)
  if (!payload) return jsonError(400, `invalid payload for tool ${step.tool}`)
  const payloadHash = await hashPayload(payload)
  const receipt = await deps.createProposal(teacherId, step.tool, message, payload, payloadHash)
  if (!receipt) return jsonError(500, 'proposal write failed')
  log(`assistant proposal created: run=${receipt.id} tool=${step.tool}`)
  return json(200, {
    status: 'proposed',
    run_id: receipt.id,
    tool: step.tool,
    payload_hash: receipt.payload_hash,
    expires_at: receipt.expires_at,
    preview: payload,
  })
}

export interface SetHomeworkPayload {
  session_id: string
  student_id: string
  done: boolean
}

function validateSetHomeworkPayload(
  payload: Record<string, unknown>,
): SetHomeworkPayload | null {
  const sessionId = typeof payload.session_id === 'string' ? payload.session_id.trim() : ''
  const studentId = typeof payload.student_id === 'string' ? payload.student_id.trim() : ''
  if (!sessionId || !studentId || typeof payload.done !== 'boolean') return null
  return { session_id: sessionId, student_id: studentId, done: payload.done }
}

export interface GenerateSessionsPayload {
  group_id: string
  month: string
}

function validateGenerateSessionsPayload(
  payload: Record<string, unknown>,
): GenerateSessionsPayload | null {
  const groupId = typeof payload.group_id === 'string' ? payload.group_id.trim() : ''
  const month = typeof payload.month === 'string' ? payload.month.trim() : ''
  if (!groupId || !/^\d{4}-\d{2}$/.test(month)) return null
  return { group_id: groupId, month }
}

function normalizeActionPayload(
  tool: string,
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  if (tool === 'add_student') {
    const valid = validateAddStudentPayload(payload)
    return valid ? { ...valid } : null
  }
  if (tool === 'set_homework') {
    const valid = validateSetHomeworkPayload(payload)
    return valid ? { ...valid } : null
  }
  if (tool === 'generate_sessions') {
    const valid = validateGenerateSessionsPayload(payload)
    return valid ? { ...valid } : null
  }
  return null
}

async function runReadTool(
  tool: string,
  args: Record<string, unknown>,
  teacherId: string,
  deps: AssistantDeps,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  if (tool === 'unpaid_students') {
    const [balances, students] = await Promise.all([
      deps.fetchBalances(teacherId),
      deps.fetchStudents(teacherId),
    ])
    const currentMonth = new Date(deps.now()).toISOString().slice(0, 7) + '-01'
    return { ok: true, data: computeUnpaid(balances, students, currentMonth) }
  }
  if (tool === 'absence_summary') {
    const min = typeof args.min_absences === 'number' ? args.min_absences : 3
    const [attendance, students] = await Promise.all([
      deps.fetchAttendance(teacherId),
      deps.fetchStudents(teacherId),
    ])
    return { ok: true, data: computeAbsence(attendance, students, min) }
  }
  if (tool === 'collection_summary') {
    const from = typeof args.from === 'string' ? args.from : ''
    const to = typeof args.to === 'string' ? args.to : ''
    if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
      return { ok: false, error: 'collection needs a valid from/to date range' }
    }
    const payments = await deps.fetchPayments(teacherId, from, to)
    return { ok: true, data: { from, to, ...computeCollection(payments) } }
  }
  if (tool === 'homework_summary') {
    const groupId = typeof args.group_id === 'string' ? args.group_id : ''
    if (!groupId) return { ok: false, error: 'homework needs a group_id' }
    const sessions = await deps.fetchGroupSessions(teacherId, groupId, 1)
    const latest = sessions[0] ?? null
    const [marks, students] = await Promise.all([
      latest ? deps.fetchHomeworkMarks(teacherId, [latest.id]) : Promise.resolve([]),
      deps.fetchStudents(teacherId),
    ])
    return {
      ok: true,
      data: { group_id: groupId, ...computeHomeworkSummary(latest, marks, students) },
    }
  }
  if (tool === 'sessions_overview') {
    const groupId = typeof args.group_id === 'string' ? args.group_id : ''
    const month = typeof args.month === 'string' ? args.month : ''
    if (!groupId || !/^\d{4}-\d{2}$/.test(month)) {
      return { ok: false, error: 'sessions overview needs group_id and month (YYYY-MM)' }
    }
    const rows = await deps.fetchSessionsInMonth(teacherId, groupId, month)
    return {
      ok: true,
      data: {
        group_id: groupId,
        month,
        count: rows.length,
        sessions: rows.map((s) => ({
          id: s.id,
          session_date: s.session_date,
          start_time: s.start_time,
          kind: s.kind,
          status: s.status,
        })),
      },
    }
  }
  return { ok: false, error: `unknown read tool: ${tool}` }
}

async function handleConfirm(
  body: Record<string, unknown>,
  teacherId: string,
  deps: AssistantDeps,
  log: (msg: string) => void,
): Promise<Response> {
  const runId = typeof body.run_id === 'string' ? body.run_id : ''
  const payloadHash = typeof body.payload_hash === 'string' ? body.payload_hash : ''
  if (!runId || !payloadHash) return jsonError(400, 'run_id and payload_hash are required')

  const confirmed = await deps.confirmProposal(runId, payloadHash)
  if (!confirmed.ok) return jsonError(409, confirmed.error)
  if (confirmed.teacher_id !== teacherId) {
    return jsonError(400, 'teacher_id does not match the proposal')
  }
  const spec = ASSISTANT_TOOLS[confirmed.tool]
  if (!spec || spec.kind !== 'action') {
    await deps.completeRun(runId, false, null, `unknown action tool: ${confirmed.tool}`)
    return jsonError(422, `unknown action tool: ${confirmed.tool}`)
  }

  // إعادة التحقق من الحمولة المخزّنة ضد البيانات الحالية قبل أي كتابة
  const reverifyError = await reverifyPayload(confirmed.tool, confirmed.payload, teacherId, deps)
  if (reverifyError) {
    await deps.completeRun(runId, false, null, reverifyError)
    return jsonError(422, reverifyError)
  }

  try {
    const outcome = await executeAction(confirmed.tool, confirmed.payload, teacherId, deps)
    await deps.completeRun(runId, true, outcome, null)
    log(`assistant run executed: run=${runId} tool=${confirmed.tool}`)
    return json(200, { status: 'executed', run_id: runId, result: outcome })
  } catch (e) {
    // مصير واضح للخطأ: يُسجَّل في قيد التشغيل ويُعاد للمستدعي — لا ابتلاع
    const message = e instanceof Error ? e.message : 'execution failed'
    await deps.completeRun(runId, false, null, message)
    return jsonError(500, message)
  }
}

async function reverifyPayload(
  tool: string,
  payload: Record<string, unknown>,
  teacherId: string,
  deps: AssistantDeps,
): Promise<string | null> {
  if (tool === 'add_student') {
    const valid = validateAddStudentPayload(payload)
    if (!valid) return 'stored payload no longer validates'
    const group = await deps.fetchGroup(teacherId, valid.group_id)
    if (!group) return 'group no longer exists'
    return null
  }
  if (tool === 'set_homework') {
    const valid = validateSetHomeworkPayload(payload)
    if (!valid) return 'stored payload no longer validates'
    const session = await deps.fetchSession(teacherId, valid.session_id)
    if (!session) return 'session no longer exists'
    const student = await deps.fetchStudentById(teacherId, valid.student_id)
    if (!student) return 'student no longer exists'
    return null
  }
  if (tool === 'generate_sessions') {
    const valid = validateGenerateSessionsPayload(payload)
    if (!valid) return 'stored payload no longer validates'
    const group = await deps.fetchGroup(teacherId, valid.group_id)
    if (!group) return 'group no longer exists'
    return null
  }
  return `no re-verifier for tool: ${tool}`
}

async function executeAction(
  tool: string,
  payload: Record<string, unknown>,
  teacherId: string,
  deps: AssistantDeps,
): Promise<unknown> {
  if (tool === 'add_student') {
    const valid = validateAddStudentPayload(payload)
    if (!valid) throw new Error('stored payload no longer validates')
    return deps.insertStudent(teacherId, valid)
  }
  if (tool === 'set_homework') {
    const valid = validateSetHomeworkPayload(payload)
    if (!valid) throw new Error('stored payload no longer validates')
    await deps.setHomeworkMark(teacherId, valid.session_id, valid.student_id, valid.done)
    return {
      session_id: valid.session_id,
      student_id: valid.student_id,
      homework_done: valid.done,
    }
  }
  if (tool === 'generate_sessions') {
    const valid = validateGenerateSessionsPayload(payload)
    if (!valid) throw new Error('stored payload no longer validates')
    const created = await deps.generateGroupSessions(
      teacherId,
      valid.group_id,
      `${valid.month}-01`,
    )
    return { group_id: valid.group_id, month: valid.month, created }
  }
  throw new Error(`no executor for tool: ${tool}`)
}
