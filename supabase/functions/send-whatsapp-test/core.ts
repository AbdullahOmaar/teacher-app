// ============================================================================
// تطبيق المدرس — Edge Function: send-whatsapp-test (3A-300، نموذج 0026)
// ----------------------------------------------------------------------------
// «إرسال كود تجريبي» من قسم «واتساب» في إعدادات المدرس: يضغطها المدرس
// المالك بنفسه (JWT مستخدم حقيقي — verify_jwt مفعّل على المنصة لهذه
// الدالة) فتُرسل قالب Authentication بكود عشوائي لرقم ملف مدرّسه،
// بأصول Meta بتاعته هو (إعداداته + توكنه من Vault عبر RPC داخلية).
// نجاح الوصول يثبت أن سلسلة Meta كاملة (رقم مسجل + قالب معتمد +
// توكن صالح + وسيلة دفع) تعمل — قبل خطوة ربط الهاتف بالحساب.
// الكود التجريبي لا يُخزَّن ولا يُسجَّل ولا يصلح لأي تحقق — توصيل فقط.
//
// المنطق نقي هنا (اعتماديات محقونة) حتى تحاكيه المحاكاة المحلية
// (scripts/simulate-whatsapp-otp.mjs) بنفس كود الإنتاج؛ مدخل Deno في
// index.ts يمرّر عملاء Supabase الحقيقيين.
//
// البوابات بالترتيب: Kill switch المنصة ← JWT صالح ← ملكية السنتر ←
// إعداد مكتمل ومفعّل ← حدّ معدل 60 ثانية (last_test_at) ← رقم ملف
// موجود ← إرسال Graph.
// ============================================================================

export interface WhatsappTestEnv {
  WHATSAPP_OTP_ENABLED?: string
  WHATSAPP_GRAPH_VERSION?: string
  WHATSAPP_GRAPH_BASE_URL?: string
}

export interface OwnedTeacher {
  phone: string | null
}

export interface TeacherWhatsappConfig {
  enabled: boolean
  phoneNumberId: string
  templateName: string
  templateLang: string
  tokenPresent: boolean
  lastTestAt: string | null
}

export interface WhatsappTestDeps {
  /** يتحقق من JWT الترويسة ويرجع معرّف المستخدم أو null */
  getUserId: (req: Request) => Promise<string | null>
  /** صف السنتر لو المستخدم مالكه (وإلا null) — يرجع رقم ملف المدرس */
  loadOwnedTeacher: (teacherId: string, userId: string) => Promise<OwnedTeacher | null>
  /** إعدادات واتساب السنتر أو null عند غياب الصف */
  loadConfig: (teacherId: string) => Promise<TeacherWhatsappConfig | null>
  /** التوكن مفكوكاً من Vault (service role) أو null */
  getToken: (teacherId: string) => Promise<string | null>
  /** ختم زمن آخر إرسال تجريبي ناجح (حدّ المعدل) */
  markTested: (teacherId: string) => Promise<void>
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>
  now: () => number
  /** كود تجريبي من 6 أرقام */
  randomCode: () => string
}

const DEFAULT_GRAPH_BASE = 'https://graph.facebook.com'
const DEFAULT_GRAPH_VERSION = 'v23.0'
/** حدّ المعدل بين إرسالين تجريبيين لنفس السنتر */
export const TEST_MIN_INTERVAL_MS = 60_000

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

/** رقم واتساب في حقل to: أرقام فقط بلا + (نفس قاعدة دالة الـ OTP) */
export function toWhatsappRecipient(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function maskPhone(phone: string): string {
  const digits = toWhatsappRecipient(phone)
  if (digits.length <= 2) return '**'
  return '*'.repeat(digits.length - 2) + digits.slice(-2)
}

/**
 * حمولة قالب Authentication — نفس مفارقة دالة الـ OTP الموثّقة:
 * الكود يُمرَّر مرتين (معامل جسم + معامل زر النسخ) وإلا فشل الإرسال.
 * (مكرّرة هنا عمداً: كل دالة Edge حزمة مستقلة عند النشر.)
 */
export function buildTemplatePayload(
  phone: string,
  code: string,
  templateName: string,
  templateLang: string,
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
          parameters: [{ type: 'text', text: code }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: code }],
        },
      ],
    },
  }
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export async function handleSendWhatsappTest(
  req: Request,
  env: WhatsappTestEnv,
  deps: WhatsappTestDeps,
  log: (msg: string) => void = () => {},
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonError(405, 'method not allowed')

  // Kill switch المنصة فوق الكل — يوقف أي إرسال واتساب من أي مدرس
  if (env.WHATSAPP_OTP_ENABLED !== 'true') {
    log('send-whatsapp-test: disabled by platform kill switch')
    return jsonError(503, 'whatsapp channel not enabled at platform level yet')
  }

  const userId = await deps.getUserId(req)
  if (!userId) return jsonError(401, 'authentication required')

  let teacherId = ''
  try {
    const body = (await req.json()) as { teacher_id?: string }
    teacherId = body.teacher_id ?? ''
  } catch {
    return jsonError(400, 'invalid json')
  }
  if (!UUID_RE.test(teacherId)) return jsonError(400, 'teacher_id required')

  const teacher = await deps.loadOwnedTeacher(teacherId, userId)
  if (!teacher) {
    log(`send-whatsapp-test: not owner (teacher ${teacherId})`)
    return jsonError(403, 'not the owner of this centre')
  }

  const config = await deps.loadConfig(teacherId)
  if (
    !config ||
    !config.enabled ||
    !config.phoneNumberId ||
    !config.tokenPresent
  ) {
    log(`send-whatsapp-test: incomplete config (teacher ${teacherId})`)
    return jsonError(422, 'whatsapp config incomplete or disabled')
  }

  if (config.lastTestAt) {
    const last = Date.parse(config.lastTestAt)
    if (Number.isFinite(last) && deps.now() - last < TEST_MIN_INTERVAL_MS) {
      const retryAfter = Math.ceil((TEST_MIN_INTERVAL_MS - (deps.now() - last)) / 1000)
      return jsonError(429, 'test send rate limited', { retry_after_seconds: retryAfter })
    }
  }

  const phone = (teacher.phone ?? '').trim()
  if (!phone) {
    return jsonError(422, 'no phone number on the teacher profile')
  }

  const token = await deps.getToken(teacherId)
  if (!token) {
    log(`send-whatsapp-test: token missing in vault (teacher ${teacherId})`)
    return jsonError(422, 'whatsapp config incomplete or disabled')
  }

  const base = (env.WHATSAPP_GRAPH_BASE_URL ?? DEFAULT_GRAPH_BASE).replace(/\/$/, '')
  const version = env.WHATSAPP_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION
  const url = `${base}/${version}/${config.phoneNumberId}/messages`
  const code = deps.randomCode()
  const body = buildTemplatePayload(phone, code, config.templateName, config.templateLang)

  let graphRes: Response
  try {
    graphRes = await deps.fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    log(`send-whatsapp-test: graph network error (phone ${maskPhone(phone)})`)
    return jsonError(502, 'whatsapp send failed')
  }

  if (!graphRes.ok) {
    // حالة Graph ورمز خطئها فقط — لا الكود ولا التوكن في أي سجل
    let graphCode = ''
    try {
      const errJson = (await graphRes.json()) as { error?: { code?: number } }
      graphCode = errJson.error?.code ? ` code=${errJson.error.code}` : ''
    } catch {
      graphCode = ''
    }
    log(
      `send-whatsapp-test: graph rejected status=${graphRes.status}${graphCode} (phone ${maskPhone(phone)})`,
    )
    return jsonError(502, 'whatsapp send failed', { graph_status: graphRes.status })
  }

  await deps.markTested(teacherId)
  log(`send-whatsapp-test: delivered (phone ${maskPhone(phone)})`)
  return json(200, { ok: true })
}
