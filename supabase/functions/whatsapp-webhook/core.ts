// ============================================================================
// تطبيق المدرس — Edge Function: whatsapp-webhook (3A-300 — تجهيز كود)
// ----------------------------------------------------------------------------
// Webhook حالات التسليم من Meta: يحدّث صفوف whatsapp_message_log
// (0045) بحالات sent/delivered/read/failed عبر معرّف رسالة Meta
// (wamid). تجهيز خامل تماماً حتى تُضبط أسرار المنصة عند أول تفعيل
// فعلي: بلا WHATSAPP_WEBHOOK_VERIFY_TOKEN يفشل تحقق GET دائماً
// (403)، وبلا WHATSAPP_APP_SECRET يُرفض كل POST ‏(401) — لا تحديث
// واحد يمر قبل إثبات توقيع Meta ‏(X-Hub-Signature-256 ‏= HMAC-SHA256
// للجسم الخام بسرّ التطبيق، مقارنة ثابتة الزمن).
//
// المنطق نقي هنا (اعتماديات محقونة) حتى تحاكيه المحاكاة المحلية
// (scripts/simulate-whatsapp-messaging.mjs) بنفس كود الإنتاج.
// الرسائل الواردة من أولياء الأمور (messages[]) خارج النطاق: تُقرّ
// بـ 200 وتُتجاهل — الردود التفاعلية مرحلة لاحقة بقرار مستقل.
// أي POST بتوقيع صالح يرد 200 دائماً (حتى بحمولة مشوّشة) حتى لا
// تعيد Meta المحاولة بعواصف إعادة — التشويش يُسجَّل ولا يُبتلع.
// ============================================================================

export interface WhatsappWebhookEnv {
  WHATSAPP_APP_SECRET?: string
  WHATSAPP_WEBHOOK_VERIFY_TOKEN?: string
}

export interface WebhookStatusError {
  code: number
  message: string
}

export interface WhatsappWebhookDeps {
  /** تحديث حالة صف سجل بمعرّف رسالة Meta — يرجع true عند وجود الصف */
  updateStatusByMetaId: (
    metaMessageId: string,
    status: 'sent' | 'delivered' | 'read' | 'failed',
    error: WebhookStatusError | null,
  ) => Promise<boolean>
}

const DELIVERY_STATUSES = ['sent', 'delivered', 'read', 'failed'] as const
type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return (
    typeof value === 'string' &&
    (DELIVERY_STATUSES as readonly string[]).includes(value)
  )
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** مقارنة ثابتة الزمن لنصين بنفس الطول (قيم التوقيع) */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface WebhookStatusEntry {
  id?: unknown
  status?: unknown
  errors?: unknown
}

/** استخراج حالات التسليم من حمولة Meta (entry→changes→value→statuses) */
export function extractStatuses(payload: unknown): WebhookStatusEntry[] {
  const out: WebhookStatusEntry[] = []
  if (!payload || typeof payload !== 'object') return out
  const entries = (payload as { entry?: unknown }).entry
  if (!Array.isArray(entries)) return out
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes
    if (!Array.isArray(changes)) continue
    for (const change of changes) {
      const value = (change as { value?: unknown })?.value
      const statuses = (value as { statuses?: unknown })?.statuses
      if (!Array.isArray(statuses)) continue
      for (const s of statuses) {
        if (s && typeof s === 'object') out.push(s as WebhookStatusEntry)
      }
    }
  }
  return out
}

export async function handleWhatsappWebhook(
  req: Request,
  env: WhatsappWebhookEnv,
  deps: WhatsappWebhookDeps,
  log: (msg: string) => void = () => {},
): Promise<Response> {
  // --- تحقق الاشتراك (GET من Meta عند ربط الـ Webhook) ----------------
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (
      env.WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
      mode === 'subscribe' &&
      token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
      challenge
    ) {
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }
    log('whatsapp-webhook: verification refused')
    return json(403, { error: { http_code: 403, message: 'verification failed' } })
  }

  if (req.method !== 'POST') {
    return json(405, { error: { http_code: 405, message: 'method not allowed' } })
  }

  // --- أحداث الحالات (POST موقّع من Meta) ------------------------------
  if (!env.WHATSAPP_APP_SECRET) {
    log('whatsapp-webhook: app secret not configured — inert')
    return json(401, { error: { http_code: 401, message: 'webhook not configured' } })
  }
  const rawBody = await req.text()
  const provided = req.headers.get('x-hub-signature-256') ?? ''
  const expected = 'sha256=' + (await hmacSha256Hex(env.WHATSAPP_APP_SECRET, rawBody))
  if (!timingSafeEqual(provided, expected)) {
    log('whatsapp-webhook: bad signature')
    return json(401, { error: { http_code: 401, message: 'invalid signature' } })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    // توقيع صالح بحمولة غير قابلة للقراءة: نقرّ بـ 200 ونُسجّل — إعادة
    // محاولات Meta لن تصلح حمولة مشوّشة أصلاً
    log('whatsapp-webhook: signed payload was not valid json — acked without updates')
    return json(200, { ok: true, updated: 0 })
  }

  let updated = 0
  for (const entry of extractStatuses(payload)) {
    const metaId = typeof entry.id === 'string' ? entry.id : ''
    if (!metaId || !isDeliveryStatus(entry.status)) continue
    let error: WebhookStatusError | null = null
    if (entry.status === 'failed' && Array.isArray(entry.errors)) {
      const first = entry.errors[0] as { code?: unknown; title?: unknown; message?: unknown } | undefined
      if (first) {
        error = {
          code: typeof first.code === 'number' ? first.code : 0,
          message: String(first.title ?? first.message ?? 'delivery failed').slice(0, 500),
        }
      }
    }
    const found = await deps.updateStatusByMetaId(metaId, entry.status, error)
    if (found) updated++
  }
  if (updated > 0) log(`whatsapp-webhook: updated ${updated} message status(es)`)
  return json(200, { ok: true, updated })
}
