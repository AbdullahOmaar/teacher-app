// ============================================================================
// تطبيق المدرس — Edge Function: send-whatsapp-otp (شريحة التفعيل من P5-3)
// ----------------------------------------------------------------------------
// هذا الملف هو المنطق النقي للدالة: بلا أي اعتماديات خاصة بـ Deno حتى
// يمكن محاكاته محلياً بالكامل (scripts/simulate-whatsapp-otp.mjs) بنفس
// الكود الذي يعمل في الإنتاج حرفياً. مدخل Deno في index.ts يمرّر
// Deno.env وfetch العامة إلى handleSendWhatsappOtp هنا.
//
// الدور: دالتنا هي «قناة التوصيل» فقط في نمط Supabase Send SMS Hook —
// GoTrue يولّد الكود ويخزّنه مجزّأً عنده ويتحقق منه ويصدر الجلسة؛ نحن
// نستقبل الكود الجاهز في طلب موقّع ونوصّله عبر WhatsApp Cloud API.
// لا كود يُخزَّن أو يُسجَّل عندنا في أي مكان (ولا حتى في الـ logs).
//
// البوابات بالترتيب قبل أي إرسال:
// ١) توقيع Standard Webhooks صالح بسرّ SEND_SMS_HOOK_SECRET — غير ذلك 401.
// ٢) Kill switch: ‏WHATSAPP_OTP_ENABLED=true وكل أسرار Meta موجودة —
//    غير ذلك خطأ مضبوط (503/500) بلا أي إرسال أو تكلفة. هذا يسمح بتفعيل
//    إعدادات Auth والـ Hook مسبقاً بأمان قبل وصول أصول Meta من المالك.
// ٣) وضع المحاكاة WHATSAPP_OTP_MOCK=true يتخطى نداء Graph (اختبار محلي
//    فقط — لا يُضبط في الإنتاج أبداً).
// ============================================================================

export interface WhatsappOtpEnv {
  SEND_SMS_HOOK_SECRET?: string
  WHATSAPP_OTP_ENABLED?: string
  WHATSAPP_OTP_MOCK?: string
  WHATSAPP_ACCESS_TOKEN?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_OTP_TEMPLATE_NAME?: string
  WHATSAPP_OTP_TEMPLATE_LANG?: string
  WHATSAPP_GRAPH_VERSION?: string
  WHATSAPP_GRAPH_BASE_URL?: string
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

const DEFAULT_GRAPH_BASE = 'https://graph.facebook.com'
const DEFAULT_GRAPH_VERSION = 'v23.0'
const DEFAULT_TEMPLATE_NAME = 'otp_code'
const DEFAULT_TEMPLATE_LANG = 'ar'
/** تسامح توقيت توقيع الـ Webhook (مواصفة Standard Webhooks): ±5 دقائق */
const TIMESTAMP_TOLERANCE_SECONDS = 300

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes)
  let bin = ''
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin)
}

/** مقارنة ثابتة الزمن لنصين (تجنّب تسريب التوقيع بالتوقيت) */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * استخراج مفتاح HMAC من سرّ بصيغة Supabase: ‏"v1,whsec_<base64>"
 * (قد يضم عدة أزواج مفصولة بمسافات عند تدوير الأسرار — نأخذ كلها).
 */
export function hookSecretKeys(secretConfig: string): Uint8Array[] {
  const keys: Uint8Array[] = []
  for (const part of secretConfig.split(/\s+/)) {
    const seg = part.includes(',') ? part.split(',').pop() ?? '' : part
    const raw = seg.startsWith('whsec_') ? seg.slice('whsec_'.length) : seg
    if (!raw) continue
    try {
      keys.push(base64ToBytes(raw))
    } catch {
      // جزء غير صالح بصيغة base64 — يُتجاهل، بقية الأجزاء قد تصلح
    }
  }
  return keys
}

/** التحقق من توقيع Standard Webhooks على الجسم الخام */
export async function verifyWebhookSignature(
  secretConfig: string,
  headers: Headers,
  rawBody: string,
  nowSeconds: number,
): Promise<boolean> {
  const id = headers.get('webhook-id')
  const timestamp = headers.get('webhook-timestamp')
  const signatureHeader = headers.get('webhook-signature')
  if (!id || !timestamp || !signatureHeader) return false

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(nowSeconds - ts) > TIMESTAMP_TOLERANCE_SECONDS) return false

  const signedContent = `${id}.${timestamp}.${rawBody}`
  const encoder = new TextEncoder()
  // التوقيعات المرشحة من الترويسة: قائمة "v1,<base64>" مفصولة بمسافات
  const candidates = signatureHeader
    .split(/\s+/)
    .map((s) => (s.includes(',') ? s.split(',').pop() ?? '' : s))
    .filter(Boolean)

  for (const keyBytes of hookSecretKeys(secretConfig)) {
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedContent))
    const expected = bytesToBase64(sig)
    if (candidates.some((c) => timingSafeEqual(c, expected))) return true
  }
  return false
}

/** رقم واتساب في حقل to: أرقام فقط بلا + (E.164 بلا علامة) */
export function toWhatsappRecipient(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** إخفاء الرقم في السجلات: كل شيء عدا آخر رقمين */
export function maskPhone(phone: string): string {
  const digits = toWhatsappRecipient(phone)
  if (digits.length <= 2) return '**'
  return '*'.repeat(digits.length - 2) + digits.slice(-2)
}

/**
 * حمولة Graph API لإرسال قالب Authentication.
 * مفارقة حرجة موثّقة: الكود يُمرَّر مرتين — معامل جسم ومعامل زر
 * (sub_type 'url' ‏index '0' رغم أن الزر فعلياً COPY_CODE) وإلا فشل الإرسال.
 */
export function buildTemplatePayload(
  phone: string,
  otp: string,
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
          parameters: [{ type: 'text', text: otp }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: otp }],
        },
      ],
    },
  }
}

interface HookPayload {
  user?: { phone?: string }
  sms?: { otp?: string }
}

/**
 * معالج طلب الـ Hook. يُستدعى من مدخل Deno (index.ts) في الإنتاج ومن
 * المحاكاة المحلية بنفس الشكل.
 */
export async function handleSendWhatsappOtp(
  req: Request,
  env: WhatsappOtpEnv,
  fetchFn: FetchFn,
  log: (msg: string) => void = () => {},
): Promise<Response> {
  if (req.method !== 'POST') return jsonError(405, 'method not allowed')

  const secret = env.SEND_SMS_HOOK_SECRET ?? ''
  if (!secret) {
    log('send-whatsapp-otp: SEND_SMS_HOOK_SECRET missing — refusing')
    return jsonError(500, 'hook secret not configured')
  }

  const rawBody = await req.text()
  const okSignature = await verifyWebhookSignature(
    secret,
    req.headers,
    rawBody,
    Math.floor(Date.now() / 1000),
  )
  if (!okSignature) {
    log('send-whatsapp-otp: invalid webhook signature — refused')
    return jsonError(401, 'invalid signature')
  }

  let payload: HookPayload
  try {
    payload = JSON.parse(rawBody) as HookPayload
  } catch {
    return jsonError(400, 'invalid json')
  }
  const phone = payload.user?.phone ?? ''
  const otp = payload.sms?.otp ?? ''
  if (!phone || !/^\d{4,8}$/.test(otp)) {
    return jsonError(400, 'missing phone or otp')
  }

  // Kill switch: لا إرسال قبل اكتمال أصول Meta وتفعيل العلم صراحة
  if (env.WHATSAPP_OTP_ENABLED !== 'true') {
    log(`send-whatsapp-otp: disabled by kill switch (phone ${maskPhone(phone)})`)
    return jsonError(503, 'whatsapp otp channel not enabled yet')
  }

  // وضع المحاكاة المحلية: توقيع صالح + علم مفتوح، بلا أي نداء لـ Graph
  if (env.WHATSAPP_OTP_MOCK === 'true') {
    log(`send-whatsapp-otp: MOCK send accepted (phone ${maskPhone(phone)})`)
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const token = env.WHATSAPP_ACCESS_TOKEN ?? ''
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID ?? ''
  if (!token || !phoneNumberId) {
    log('send-whatsapp-otp: Meta credentials incomplete — refusing')
    return jsonError(500, 'whatsapp credentials not configured')
  }

  const base = (env.WHATSAPP_GRAPH_BASE_URL ?? DEFAULT_GRAPH_BASE).replace(/\/$/, '')
  const version = env.WHATSAPP_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION
  const url = `${base}/${version}/${phoneNumberId}/messages`
  const body = buildTemplatePayload(
    phone,
    otp,
    env.WHATSAPP_OTP_TEMPLATE_NAME ?? DEFAULT_TEMPLATE_NAME,
    env.WHATSAPP_OTP_TEMPLATE_LANG ?? DEFAULT_TEMPLATE_LANG,
  )

  let graphRes: Response
  try {
    graphRes = await fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    log(`send-whatsapp-otp: graph network error (phone ${maskPhone(phone)})`)
    return jsonError(502, 'whatsapp send failed')
  }

  if (!graphRes.ok) {
    // نسجّل حالة Graph ورمز خطئها فقط — لا الكود ولا جسم الطلب أبداً
    let code = ''
    try {
      const errJson = (await graphRes.json()) as { error?: { code?: number } }
      code = errJson.error?.code ? ` code=${errJson.error.code}` : ''
    } catch {
      code = ''
    }
    log(
      `send-whatsapp-otp: graph rejected status=${graphRes.status}${code} (phone ${maskPhone(phone)})`,
    )
    return jsonError(502, 'whatsapp send failed')
  }

  log(`send-whatsapp-otp: delivered (phone ${maskPhone(phone)})`)
  return new Response('{}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
