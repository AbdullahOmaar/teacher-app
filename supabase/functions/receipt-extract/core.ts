// ============================================================================
// Extract-1 — نواة دالة receipt-extract (Phase 2 T10 — بند ج13-1)
// ----------------------------------------------------------------------------
// قراءة آلية لحقول إيصال دفع مرفوع (مبلغ/تاريخ/طريقة) من صورته نفسها عبر
// مزوّد رؤية بمفتاح المدرّس نفسه (BYOK — قرار ق5، مهاجرة 0049)، حتى يجد
// المدرّس سجل الدفع مُعبّأً مسبقاً من الصورة لا من إعلان ولي الأمر فقط،
// ويؤكده بنقرة عبر مسار الاعتماد القائم نفسه (payment-proofs →
// createPayment). الاستخراج اقتراح دائماً: لا يكتب أي شيء في القاعدة،
// والاعتماد البشري وحده ينشئ الدفعة.
//
// • هوية المستدعي فقط (لا عميل إدارة إطلاقاً — قاعدة 0048 §2-2): قراءة
//   الإثبات وصورته ومفتاح المزوّد كلها بتوكن المستدعي وتخضع لـ RLS.
// • المفتاح الصريح يُفكّ في الذاكرة فقط ولا يُسجَّل ولا يخرج في رد،
//   وأخطاء المزوّد تُنقّى منه (نمط sanitizeProviderError في assistant-chat).
// • النموذج مطالب برد JSON صرف بلا أي نص آخر، والتحقق منه صارم هنا:
//   مبلغ موجب محدود، تاريخ حقيقي بصيغة ISO، طريقة من عدّاد payment_method،
//   وثقة من ثلاث قيم — أي حقل فاسد يرجع null لا قيمة مخمّنة.
// • النواة نقية: fetch مُدخلة، فتُحاكى محلياً بـ scripts/simulate-receipt-
//   extract.mjs بلا أي اتصال حي. النشر على المنصة مؤجل لبوابة تجميد
//   فيز 2 (قاعدة فصل الإنتاج 2026-11-25) — الكود كامل ومُحاكى، ولم
//   يُدَّعَ أي تشغيل حي.
// ============================================================================

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'openai_compatible'
export type PaymentMethodId = 'cash' | 'vodafone_cash' | 'instapay' | 'bank_transfer'
export type Confidence = 'high' | 'medium' | 'low'

export interface ProviderKeyConfig {
  provider: ProviderId
  model: string | null
  base_url: string | null
  api_key: string
}

export interface ExtractedReceipt {
  amount: number | null
  paid_on: string | null
  method: PaymentMethodId | null
  confidence: Confidence
}

export interface DeclaredProof {
  amount: number
  method: PaymentMethodId
}

export interface DeclaredComparison {
  amount_match: boolean | null
  method_match: boolean | null
}

export class ExtractError extends Error {
  code: string
  httpStatus: number
  constructor(message: string, code: string, httpStatus: number) {
    super(message)
    this.code = code
    this.httpStatus = httpStatus
  }
}

export const PROVIDER_DEFAULT_MODELS: Record<ProviderId, string | null> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5',
  gemini: 'gemini-3.1-flash-lite',
  openai_compatible: null,
}

export const EXTRACTION_PROMPT =
  'You are reading an Egyptian payment receipt image (bank transfer, ' +
  'InstaPay, Vodafone Cash, or cash receipt). Extract exactly these fields ' +
  'and reply with ONLY a JSON object, no markdown, no explanation: ' +
  '{"amount": <total paid amount in EGP as a number, or null>, ' +
  '"paid_on": <date as YYYY-MM-DD, or null>, ' +
  '"method": <"cash"|"vodafone_cash"|"instapay"|"bank_transfer", or null>, ' +
  '"confidence": <"high"|"medium"|"low">}. ' +
  'If a field is not clearly readable, use null for it. Never guess.'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function modelFor(cfg: ProviderKeyConfig): string {
  if (cfg.model) return cfg.model
  const fallback = PROVIDER_DEFAULT_MODELS[cfg.provider]
  if (!fallback) {
    throw new ExtractError(
      'a model name is required for this provider (set it in the key settings)',
      'model_required',
      422,
    )
  }
  return fallback
}

export interface VisionRequest {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

/** بناء طلب الرؤية لكل مزوّد — دالة نقية (تُختبر بالمحاكاة) */
export function buildVisionRequest(
  cfg: ProviderKeyConfig,
  imageBase64: string,
  mimeType: string,
): VisionRequest {
  const model = modelFor(cfg)
  if (cfg.provider === 'openai' || cfg.provider === 'openai_compatible') {
    const base =
      cfg.provider === 'openai'
        ? 'https://api.openai.com/v1'
        : (cfg.base_url ?? '').replace(/\/+$/, '')
    if (!base) {
      throw new ExtractError('openai_compatible needs a base_url', 'model_required', 422)
    }
    return {
      url: `${base}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.api_key}`,
      },
      body: {
        model,
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: EXTRACTION_PROMPT },
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${imageBase64}` },
              },
            ],
          },
        ],
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
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: imageBase64 },
              },
              { type: 'text', text: EXTRACTION_PROMPT },
            ],
          },
        ],
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
      contents: [
        {
          role: 'user',
          parts: [
            { text: EXTRACTION_PROMPT },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
    },
  }
}

const METHODS: PaymentMethodId[] = ['cash', 'vodafone_cash', 'instapay', 'bank_transfer']

/** تحقق صارم من كائن الاستخراج الخام — أي حقل فاسد يرجع null لا تخميناً */
export function validateExtraction(raw: unknown): ExtractedReceipt {
  const out: ExtractedReceipt = { amount: null, paid_on: null, method: null, confidence: 'low' }
  if (!isRecord(raw)) return out
  if (typeof raw.amount === 'number' && Number.isFinite(raw.amount)
      && raw.amount > 0 && raw.amount <= 10_000_000) {
    out.amount = Math.round(raw.amount * 100) / 100
  }
  if (typeof raw.paid_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.paid_on)) {
    const d = new Date(`${raw.paid_on}T00:00:00Z`)
    if (!Number.isNaN(d.getTime())
        && d.toISOString().slice(0, 10) === raw.paid_on) {
      out.paid_on = raw.paid_on
    }
  }
  if (typeof raw.method === 'string' && (METHODS as string[]).includes(raw.method)) {
    out.method = raw.method as PaymentMethodId
  }
  if (raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low') {
    out.confidence = raw.confidence
  }
  return out
}

function providerText(provider: ProviderId, json: unknown): string {
  if (!isRecord(json)) return ''
  if (provider === 'openai' || provider === 'openai_compatible') {
    const choices = json.choices
    if (Array.isArray(choices) && isRecord(choices[0]) && isRecord(choices[0].message)) {
      const content = choices[0].message.content
      if (typeof content === 'string') return content
    }
    return ''
  }
  if (provider === 'anthropic') {
    const content = json.content
    if (Array.isArray(content)) {
      return content
        .filter((b): b is Record<string, unknown> => isRecord(b) && b.type === 'text')
        .map((b) => (typeof b.text === 'string' ? b.text : ''))
        .join('')
    }
    return ''
  }
  // gemini
  const candidates = json.candidates
  if (Array.isArray(candidates) && isRecord(candidates[0]) && isRecord(candidates[0].content)) {
    const parts = candidates[0].content.parts
    if (Array.isArray(parts)) {
      return parts
        .map((p) => (isRecord(p) && typeof p.text === 'string' ? p.text : ''))
        .join('')
    }
  }
  return ''
}

/** تحليل رد المزوّد: استخراج أول كائن JSON من النص ثم التحقق الصارم */
export function parseVisionResponse(provider: ProviderId, json: unknown): ExtractedReceipt {
  const text = providerText(provider, json)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new ExtractError('provider returned no JSON object', 'provider_protocol', 502)
  }
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new ExtractError('provider returned invalid JSON', 'provider_protocol', 502)
  }
  return validateExtraction(raw)
}

/** مقارنة المستخرج بما أعلنه ولي الأمر عند الرفع — null يعني «لا أساس للمقارنة» */
export function compareWithDeclared(
  extracted: ExtractedReceipt,
  declared: DeclaredProof,
): DeclaredComparison {
  return {
    amount_match: extracted.amount === null ? null : extracted.amount === declared.amount,
    method_match: extracted.method === null ? null : extracted.method === declared.method,
  }
}

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

// ---------------------------------------------------------------------------
// التهيئة: فك تشفير مفتاح BYOK (AES-GCM — نفس بارامترات assistant-chat)
// ---------------------------------------------------------------------------

export function parseEncryptionKey(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  if (bytes.length !== 32) throw new Error('encryption key must be 32 bytes')
  return bytes
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export async function aesGcmDecrypt(
  ciphertextB64: string,
  ivB64: string,
  keyBytes: Uint8Array,
): Promise<string> {
  const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, 'AES-GCM', false, [
    'decrypt',
  ])
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(ivB64) as BufferSource },
    key,
    b64ToBytes(ciphertextB64) as BufferSource,
  )
  return new TextDecoder().decode(plain)
}

// ---------------------------------------------------------------------------
// المعالج: اعتماديات مُدخلة بالكامل (قابلة للمحاكاة)
// ---------------------------------------------------------------------------

export interface ProofForExtraction {
  id: string
  teacher_id: string
  storage_path: string
  status: string
  uploaded_at: string | null
  amount: number
  method: PaymentMethodId
}

export interface ExtractDeps {
  /** Kill switch المنصة: RECEIPT_EXTRACT_ENABLED === 'true' فقط */
  enabled: boolean
  /** هوية المستدعي من JWT — null تعني غير مصادق */
  callerUserId: (req: Request) => Promise<string | null>
  /** قراءة الإثبات بهوية المستدعي (RLS تحصرها في مالكه) */
  loadProof: (proofId: string) => Promise<ProofForExtraction | null>
  /** تنزيل صورة الإثبات من bucket ‏payment-proofs بهوية المستدعي */
  downloadImage: (storagePath: string) => Promise<{ base64: string; mimeType: string } | null>
  /** مفتاح BYOK مفكوكاً في الذاكرة — null يعني لا مفتاح مضبوطاً */
  resolveKey: (teacherId: string) => Promise<ProviderKeyConfig | null>
  fetchFn?: typeof fetch
  timeoutMs?: number
}

export interface ExtractOutcome {
  extracted: ExtractedReceipt
  matches_declared: DeclaredComparison
}

export async function handleReceiptExtract(
  req: Request,
  deps: ExtractDeps,
): Promise<ExtractOutcome> {
  if (!deps.enabled) {
    throw new ExtractError('receipt extraction is disabled', 'extract_disabled', 503)
  }
  const userId = await deps.callerUserId(req)
  if (!userId) throw new ExtractError('not authenticated', 'unauthorized', 401)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new ExtractError('invalid request body', 'bad_request', 400)
  }
  const proofId = isRecord(body) && typeof body.proof_id === 'string' ? body.proof_id : ''
  if (!proofId) throw new ExtractError('proof_id is required', 'bad_request', 400)

  const proof = await deps.loadProof(proofId)
  if (!proof) throw new ExtractError('proof not found', 'not_found', 404)
  if (proof.status !== 'pending' || !proof.uploaded_at) {
    throw new ExtractError('proof is not awaiting review', 'proof_not_pending', 409)
  }

  const cfg = await deps.resolveKey(proof.teacher_id)
  if (!cfg) {
    throw new ExtractError(
      'no provider key configured for this centre — add your key in Settings',
      'no_api_key',
      422,
    )
  }

  const image = await deps.downloadImage(proof.storage_path)
  if (!image) throw new ExtractError('proof image is unavailable', 'image_unavailable', 404)

  const request = buildVisionRequest(cfg, image.base64, image.mimeType)
  const fetchFn = deps.fetchFn ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 30_000)
  let response: Response
  try {
    response = await fetchFn(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
    })
  } catch {
    throw new ExtractError('provider request failed (network or timeout)', 'provider_error', 502)
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new ExtractError(
      sanitizeProviderError(response.status, bodyText, cfg.api_key),
      'provider_error',
      502,
    )
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new ExtractError('provider returned invalid JSON', 'provider_protocol', 502)
  }
  const extracted = parseVisionResponse(cfg.provider, json)
  return {
    extracted,
    matches_declared: compareWithDeclared(extracted, {
      amount: proof.amount,
      method: proof.method,
    }),
  }
}
