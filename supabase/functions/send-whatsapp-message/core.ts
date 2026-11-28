// ============================================================================
// تطبيق المدرس — Edge Function: send-whatsapp-message (3A-300 — مسار
// إرسال واتساب الكامل في الكود، قرار المالك 2026-11-23 ~20:09)
// ----------------------------------------------------------------------------
// إرسال رسالة قالب Utility (وصول/انصراف/غياب/فاتورة) لولي أمر من رقم
// المدرس نفسه وبأصول Meta بتاعته (إعداد 0026 + توكن Vault + قوالب
// 0045) — تجهيز كود كامل بلا تفعيل: بوابة Kill switch المنصة
// WHATSAPP_MESSAGING_ENABLED غير مضبوطة أصلاً (= OFF)، فالدالة ترد
// 503 قبل أي عمل، ولا إرسال حقيقي يحدث قبل أن يفعّل مدرس قناته
// بنفسه داخل التطبيق وتُفتح بوابة المنصة بقرار تشغيل لاحق.
//
// المنطق نقي هنا (اعتماديات محقونة) حتى تحاكيه المحاكاة المحلية
// (scripts/simulate-whatsapp-messaging.mjs) بنفس كود الإنتاج؛ مدخل
// Deno في index.ts يمرّر عملاء Supabase الحقيقيين.
//
// البوابات بالترتيب: Kill switch المنصة ← JWT صالح ← صحة الطلب ←
// ملكية السنتر ← إعداد مكتمل ومفعّل ← قالب جاهز (0045) ← توكن Vault
// ← تسجيل «queued» في سجل الرسائل ← إرسال Graph ← تحديث السجل
// (sent + wamid، أو failed + رمز/رسالة خطأ Meta). لا إرسال بلا سجل:
// فشل كتابة السجل يوقف الإرسال نفسه (500) — الفشل ظاهر لا صامت.
//
// الوضع الداخلي (0073 — المهمة 24 / 3A-900): الإرسال الآلي الحدثي من
// سلّم قاعدة البيانات (whatsapp_auto_dispatch عبر pg_net) لا يحمل JWT
// مدرّس أصلاً — درس المهمة 15 §1.2: «مسار خادمي جديد بلا JWT مستخدم».
// طلب يحمل ترويسة x-wa-internal-secret مطابقة لسرّ الدالة
// WHATSAPP_AUTO_INTERNAL_SECRET (مقارنة ثابتة الزمن) + ‏internal:true
// في الجسم يتخطى بوابتي JWT والملكية وحدهما — فالمستدعي هو القاعدة
// نفسها بعد بوابات السلم (جاهزية + بوابة منصة + opt-in سنتر + opt-out
// ولي + حصة يومية). كل ما عداهما يبقى حرفياً: Kill switch فوق الكل،
// والإعداد/القالب/التوكن/حد الشهر (0062)/السجل-أولاً، والسجل يُختم
// بـ source='auto'. وفي هذا الوضع وحده، مبلغ قالب الفاتورة يُحلّ
// خادمياً لحظة التنفيذ من invoice_balances (deps.loadInvoiceAmountText)
// — لا مبلغ وقت الحدث (درس المهمة 9)، وغياب مبلغ نهائي (> 0) يوقف
// الإرسال بـ 422 قبل أي سجل.
// ============================================================================

export interface WhatsappMessageEnv {
  WHATSAPP_MESSAGING_ENABLED?: string
  WHATSAPP_GRAPH_VERSION?: string
  WHATSAPP_GRAPH_BASE_URL?: string
  /** سرّ الوضع الداخلي (0073) — غيابه = الوضع الداخلي معطّل كلياً */
  WHATSAPP_AUTO_INTERNAL_SECRET?: string
}

export type WhatsappKind =
  | 'arrival_notice'
  | 'departure_notice'
  | 'absence_notice'
  | 'invoice_issued'

export const WHATSAPP_KINDS: readonly WhatsappKind[] = [
  'arrival_notice',
  'departure_notice',
  'absence_notice',
  'invoice_issued',
]

/**
 * عدد معاملات جسم القالب لكل نوع — مرآة كتالوج العميل
 * (src/features/settings/whatsappTemplates.ts). مكرّرة هنا عمداً:
 * كل دالة Edge حزمة مستقلة عند النشر (نفس قاعدة دالة الـ OTP).
 */
export const KIND_PARAM_COUNTS: Record<WhatsappKind, number> = {
  arrival_notice: 2,
  departure_notice: 2,
  absence_notice: 2,
  invoice_issued: 2,
}

export interface TeacherWhatsappConfig {
  enabled: boolean
  phoneNumberId: string
  tokenPresent: boolean
}

export interface TeacherWhatsappTemplate {
  templateName: string
  language: string
  status: string
}

export interface NewMessageLogRow {
  teacherId: string
  kind: WhatsappKind
  templateName: string
  recipientPhone: string
  /** مصدر الإرسال (0073): يدوي من التطبيق أو آلي من السلم */
  source: 'manual' | 'auto'
}

export interface MessageLogPatch {
  status: 'sent' | 'failed'
  metaMessageId?: string
  errorCode?: number
  errorMessage?: string
}

/**
 * كشف غياب عمود source في whatsapp_message_log (مهاجرة 0073) من خطأ
 * PostgREST — بوابة ترتيب النشر: لو أُعيد نشر الدالة قبل تطبيق 0073
 * يرفض الإدخال بـ PGRST204؛ مدخل Deno (index.ts) يعيد الإدخال بلا
 * source عند هذا الكشف حتى لا يتعطل الإرسال اليدوي الحي (قاعدة
 * «لا إرسال بلا سجل» تبقى: أي فشل آخر يرجع null فيوقف الإرسال).
 */
export function isMissingLogSourceColumnError(error: {
  code?: string
  message?: string
} | null): boolean {
  if (!error) return false
  return error.code === 'PGRST204' || (error.message ?? '').includes('source')
}

export interface WhatsappMessageDeps {
  /** يتحقق من JWT الترويسة ويرجع معرّف المستخدم أو null */
  getUserId: (req: Request) => Promise<string | null>
  /** هل المستخدم مالك هذا السنتر؟ */
  isOwner: (teacherId: string, userId: string) => Promise<boolean>
  /** إعدادات واتساب السنتر أو null عند غياب الصف */
  loadConfig: (teacherId: string) => Promise<TeacherWhatsappConfig | null>
  /** صف قالب النوع لهذا السنتر أو null */
  loadTemplate: (
    teacherId: string,
    kind: WhatsappKind,
  ) => Promise<TeacherWhatsappTemplate | null>
  /** التوكن مفكوكاً من Vault (service role) أو null */
  getToken: (teacherId: string) => Promise<string | null>
  /**
   * فحص حد رسائل الشهر (0062 — الخطوة 5): null = نظام الحدود غائب
   * (قبل تطبيق المهاجرة) فيُسمح — الإنفاذ يبدأ مع التطبيق لا قبله.
   */
  checkMessageLimit: (
    teacherId: string,
  ) => Promise<{ allowed: boolean; limit: number | null; used: number } | null>
  /**
   * مبلغ فاتورة نهائي كنص جاهز لمعامل القالب (0073 — الوضع الداخلي
   * فقط): يُقرأ من invoice_balances لحظة التنفيذ؛ null = لا مبلغ
   * نهائي (> 0) بعد فيُوقف الإرسال. اليدوي لا يستخدمه إطلاقاً —
   * معاملاته تأتي من التطبيق كما هي.
   */
  loadInvoiceAmountText: (teacherId: string, invoiceId: string) => Promise<string | null>
  /** إدخال صف سجل بحالة queued — يرجع معرّفه أو null عند الفشل */
  insertLog: (row: NewMessageLogRow) => Promise<string | null>
  /** تحديث صف السجل بنتيجة الإرسال */
  updateLog: (logId: string, patch: MessageLogPatch) => Promise<void>
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>
  now: () => number
}

const DEFAULT_GRAPH_BASE = 'https://graph.facebook.com'
const DEFAULT_GRAPH_VERSION = 'v23.0'
const MAX_PARAM_LENGTH = 1000

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

function jsonError(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return json(status, { error: { http_code: status, message, ...extra } })
}

/** رقم واتساب في حقل to: أرقام فقط بلا + (نفس قاعدة دالتي الـ OTP) */
export function toWhatsappRecipient(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function maskPhone(phone: string): string {
  const digits = toWhatsappRecipient(phone)
  if (digits.length <= 2) return '**'
  return '*'.repeat(digits.length - 2) + digits.slice(-2)
}

/** حمولة قالب Utility: معاملات جسم نصية بالترتيب الموثّق في الكتالوج */
export function buildUtilityTemplatePayload(
  phone: string,
  templateName: string,
  templateLang: string,
  params: string[],
): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toWhatsappRecipient(phone),
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLang },
      components: [
        {
          type: 'body',
          parameters: params.map((text) => ({ type: 'text', text })),
        },
      ],
    },
  }
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/** مقارنة أسرار ثابتة الزمن (نمط بوابة send-push الموثّق) */
function secretsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function isWhatsappKind(value: unknown): value is WhatsappKind {
  return typeof value === 'string' && (WHATSAPP_KINDS as readonly string[]).includes(value)
}

export async function handleSendWhatsappMessage(
  req: Request,
  env: WhatsappMessageEnv,
  deps: WhatsappMessageDeps,
  log: (msg: string) => void = () => {},
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonError(405, 'method not allowed')

  // Kill switch المنصة فوق الكل — يوقف أي إرسال رسائل من أي مدرس
  if (env.WHATSAPP_MESSAGING_ENABLED !== 'true') {
    log('send-whatsapp-message: disabled by platform kill switch')
    return jsonError(503, 'whatsapp messaging not enabled at platform level yet')
  }

  let teacherId = ''
  let kind: WhatsappKind | null = null
  let recipient = ''
  let params: string[] = []
  let internalFlag = false
  let invoiceId = ''
  try {
    const body = (await req.json()) as {
      teacher_id?: unknown
      kind?: unknown
      to?: unknown
      params?: unknown
      internal?: unknown
      invoice_id?: unknown
    }
    teacherId = typeof body.teacher_id === 'string' ? body.teacher_id : ''
    if (isWhatsappKind(body.kind)) kind = body.kind
    recipient = typeof body.to === 'string' ? toWhatsappRecipient(body.to) : ''
    if (Array.isArray(body.params)) {
      params = body.params.map((p) => (typeof p === 'string' ? p.trim() : ''))
    }
    internalFlag = body.internal === true
    invoiceId = typeof body.invoice_id === 'string' ? body.invoice_id : ''
  } catch {
    return jsonError(400, 'invalid json')
  }

  // الوضع الداخلي (0073): سرّ مشترك + علم صريح في الجسم — أي نقص في
  // أيٍّ منهما يعيد الطلب لمسار JWT العادي حرفياً (لا بوابة خلفية
  // بنصف شرط). Kill switch فوقُ فُحص قبل هذا الموضع ويبقى فوق الكل.
  const internalSecret = req.headers.get('x-wa-internal-secret') ?? ''
  const internal = Boolean(
    internalFlag &&
      env.WHATSAPP_AUTO_INTERNAL_SECRET &&
      secretsEqual(internalSecret, env.WHATSAPP_AUTO_INTERNAL_SECRET),
  )

  let userId: string | null = null
  if (!internal) {
    userId = await deps.getUserId(req)
    if (!userId) return jsonError(401, 'authentication required')
  }

  if (!UUID_RE.test(teacherId)) return jsonError(400, 'teacher_id required')
  if (!kind) return jsonError(400, 'unknown message kind')
  if (recipient.length < 10 || recipient.length > 15) {
    return jsonError(400, 'invalid recipient phone')
  }

  // مبلغ الفاتورة الآلي يُحلّ لحظة التنفيذ (0073): السلم يمرّر
  // invoice_id ومعامل مبلغ فارغاً عمداً؛ غياب مبلغ نهائي يوقف الإرسال
  // هنا قبل أي سجل أو نداء Graph — لا رسالة بمبلغ جزئي أبداً.
  if (internal && kind === 'invoice_issued' && UUID_RE.test(invoiceId)) {
    const amountText = await deps.loadInvoiceAmountText(teacherId, invoiceId)
    if (!amountText) {
      log(`send-whatsapp-message: auto invoice total not final (teacher ${teacherId})`)
      return jsonError(422, 'invoice total is not final yet', {
        code: 'invoice_total_unavailable',
      })
    }
    params = [amountText, params[1] ?? '']
  }

  if (
    params.length !== KIND_PARAM_COUNTS[kind] ||
    params.some((p) => !p || p.length > MAX_PARAM_LENGTH)
  ) {
    return jsonError(400, 'invalid template parameters')
  }

  if (!internal) {
    const owned = await deps.isOwner(teacherId, userId as string)
    if (!owned) {
      log(`send-whatsapp-message: not owner (teacher ${teacherId})`)
      return jsonError(403, 'not the owner of this centre')
    }
  }

  const config = await deps.loadConfig(teacherId)
  if (!config || !config.enabled || !config.phoneNumberId || !config.tokenPresent) {
    log(`send-whatsapp-message: incomplete config (teacher ${teacherId})`)
    return jsonError(422, 'whatsapp config incomplete or disabled')
  }

  const template = await deps.loadTemplate(teacherId, kind)
  if (!template || template.status !== 'ready' || !template.templateName) {
    log(`send-whatsapp-message: template not ready kind=${kind} (teacher ${teacherId})`)
    return jsonError(422, 'whatsapp template not marked ready', { code: 'template_not_ready' })
  }

  const token = await deps.getToken(teacherId)
  if (!token) {
    log(`send-whatsapp-message: token missing in vault (teacher ${teacherId})`)
    return jsonError(422, 'whatsapp config incomplete or disabled')
  }

  // حد رسائل الشهر (0062 — الخطوة 5): بعد اكتمال الإعداد وقبل أي
  // سجل أو إرسال — فلا تُستهلك رسالة مرفوضة أصلاً. null = نظام
  // الحدود غائب (قبل تطبيق المهاجرة) فيُسمح.
  const limitCheck = await deps.checkMessageLimit(teacherId)
  if (limitCheck && !limitCheck.allowed) {
    log(
      `send-whatsapp-message: monthly limit reached (teacher ${teacherId} ` +
        `used=${limitCheck.used} limit=${limitCheck.limit})`,
    )
    return jsonError(429, 'monthly message limit reached', {
      code: 'limit_reached',
      limit: limitCheck.limit,
      used: limitCheck.used,
    })
  }

  // السجل أولاً: لا إرسال بلا أثر قابل للمتابعة في نموذج البيانات
  const logId = await deps.insertLog({
    teacherId,
    kind,
    templateName: template.templateName,
    recipientPhone: recipient,
    source: internal ? 'auto' : 'manual',
  })
  if (!logId) {
    log(`send-whatsapp-message: log insert failed (teacher ${teacherId})`)
    return jsonError(500, 'message log write failed')
  }

  const base = (env.WHATSAPP_GRAPH_BASE_URL ?? DEFAULT_GRAPH_BASE).replace(/\/$/, '')
  const version = env.WHATSAPP_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION
  const url = `${base}/${version}/${config.phoneNumberId}/messages`
  const payload = buildUtilityTemplatePayload(
    recipient,
    template.templateName,
    template.language || 'ar',
    params,
  )

  let graphRes: Response
  try {
    graphRes = await deps.fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    await deps.updateLog(logId, { status: 'failed', errorMessage: 'network error' })
    log(`send-whatsapp-message: graph network error (phone ${maskPhone(recipient)})`)
    return jsonError(502, 'whatsapp send failed')
  }

  if (!graphRes.ok) {
    // رمز/رسالة خطأ Meta يُحفظان في السجل (يظهران للمالك) — التوكن لا
    let errorCode: number | undefined
    let errorMessage: string | undefined
    try {
      const errJson = (await graphRes.json()) as {
        error?: { code?: number; message?: string }
      }
      if (typeof errJson.error?.code === 'number') errorCode = errJson.error.code
      if (typeof errJson.error?.message === 'string') {
        errorMessage = errJson.error.message.slice(0, 500)
      }
    } catch {
      errorCode = undefined
      errorMessage = undefined
    }
    await deps.updateLog(logId, { status: 'failed', errorCode, errorMessage })
    log(
      `send-whatsapp-message: graph rejected status=${graphRes.status}` +
        `${errorCode ? ` code=${errorCode}` : ''} (phone ${maskPhone(recipient)})`,
    )
    return jsonError(502, 'whatsapp send failed', { graph_status: graphRes.status })
  }

  let metaMessageId = ''
  try {
    const okJson = (await graphRes.json()) as { messages?: { id?: string }[] }
    metaMessageId = okJson.messages?.[0]?.id ?? ''
  } catch {
    metaMessageId = ''
  }
  await deps.updateLog(logId, { status: 'sent', metaMessageId: metaMessageId || undefined })
  log(`send-whatsapp-message: sent kind=${kind} (phone ${maskPhone(recipient)})`)
  return json(200, { ok: true, log_id: logId, message_id: metaMessageId })
}
