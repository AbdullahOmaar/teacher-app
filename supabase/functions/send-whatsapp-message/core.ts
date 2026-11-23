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
// ============================================================================

export interface WhatsappMessageEnv {
  WHATSAPP_MESSAGING_ENABLED?: string
  WHATSAPP_GRAPH_VERSION?: string
  WHATSAPP_GRAPH_BASE_URL?: string
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
}

export interface MessageLogPatch {
  status: 'sent' | 'failed'
  metaMessageId?: string
  errorCode?: number
  errorMessage?: string
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

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
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

function isWhatsappKind(value: unknown): value is WhatsappKind {
  return typeof value === 'string' && (WHATSAPP_KINDS as readonly string[]).includes(value)
}

export async function handleSendWhatsappMessage(
  req: Request,
  env: WhatsappMessageEnv,
  deps: WhatsappMessageDeps,
  log: (msg: string) => void = () => {},
): Promise<Response> {
  if (req.method !== 'POST') return jsonError(405, 'method not allowed')

  // Kill switch المنصة فوق الكل — يوقف أي إرسال رسائل من أي مدرس
  if (env.WHATSAPP_MESSAGING_ENABLED !== 'true') {
    log('send-whatsapp-message: disabled by platform kill switch')
    return jsonError(503, 'whatsapp messaging not enabled at platform level yet')
  }

  const userId = await deps.getUserId(req)
  if (!userId) return jsonError(401, 'authentication required')

  let teacherId = ''
  let kind: WhatsappKind | null = null
  let recipient = ''
  let params: string[] = []
  try {
    const body = (await req.json()) as {
      teacher_id?: unknown
      kind?: unknown
      to?: unknown
      params?: unknown
    }
    teacherId = typeof body.teacher_id === 'string' ? body.teacher_id : ''
    if (isWhatsappKind(body.kind)) kind = body.kind
    recipient = typeof body.to === 'string' ? toWhatsappRecipient(body.to) : ''
    if (Array.isArray(body.params)) {
      params = body.params.map((p) => (typeof p === 'string' ? p.trim() : ''))
    }
  } catch {
    return jsonError(400, 'invalid json')
  }
  if (!UUID_RE.test(teacherId)) return jsonError(400, 'teacher_id required')
  if (!kind) return jsonError(400, 'unknown message kind')
  if (recipient.length < 10 || recipient.length > 15) {
    return jsonError(400, 'invalid recipient phone')
  }
  if (
    params.length !== KIND_PARAM_COUNTS[kind] ||
    params.some((p) => !p || p.length > MAX_PARAM_LENGTH)
  ) {
    return jsonError(400, 'invalid template parameters')
  }

  const owned = await deps.isOwner(teacherId, userId)
  if (!owned) {
    log(`send-whatsapp-message: not owner (teacher ${teacherId})`)
    return jsonError(403, 'not the owner of this centre')
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

  // السجل أولاً: لا إرسال بلا أثر قابل للمتابعة في نموذج البيانات
  const logId = await deps.insertLog({
    teacherId,
    kind,
    templateName: template.templateName,
    recipientPhone: recipient,
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
