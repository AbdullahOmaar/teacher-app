// ============================================================================
// تطبيق المدرس — Edge Function: receipt-extract (Extract-1 — Phase 2 T10)
// ----------------------------------------------------------------------------
// مدخل Deno فقط: المنطق كله في core.ts (نقي وقابل للمحاكاة محلياً).
// التصميم والحدود الصادقة: docs/PHASE2-T10-FINANCE.md ‏(§4).
//
// verify_jwt مفعّل على مستوى المنصة لهذه الدالة: المستدعي مدرّس بـ JWT.
// الأسرار (أسماء فقط):
// • RECEIPT_EXTRACT_ENABLED — Kill switch المنصة (غير مضبوط = OFF → 503).
// • ASSISTANT_KEY_ENCRYPTION_KEY — مفتاح تشفير AES-GCM لمفاتيح BYOK،
//   نفس مفتاح منصة assistant-chat (0049): فكّ مفتاح المدرّس هنا في
//   الذاكرة فقط، ولا يُسجَّل ولا يخرج في أي رد.
// • SUPABASE_URL + SUPABASE_PUBLISHABLE_KEYS لعميل المستدعي (نمط 3A-695).
//
// ⚠️ لا عميل إدارة (service role) إطلاقاً — هوية المستدعي فقط (قاعدة
// 0048 §2-2): الإثبات وصورته ومفتاح المزوّد تُقرأ بتوكن المستدعي وتخضع
// لـ RLS. الدالة لا تكتب أي شيء: الاستخراج اقتراح، والاعتماد البشري في
// واجهة الإثباتات وحده ينشئ الدفعة عبر المسار القائم.
//
// ⚠️ الحالة: الكود كامل ومُحاكى محلياً (scripts/simulate-receipt-
// extract.mjs) لكنه **غير منشور** على المنصة — النشر عند بوابة تجميد
// فيز 2 طبقاً لقاعدة فصل الإنتاج عن التطوير (2026-11-25).
// ============================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  ExtractError,
  aesGcmDecrypt,
  handleReceiptExtract,
  parseEncryptionKey,
  type ExtractDeps,
  type PaymentMethodId,
  type ProofForExtraction,
  type ProviderId,
  type ProviderKeyConfig,
} from './core.ts'

function injectedKeys(envName: string): Record<string, string> {
  try {
    const raw = Deno.env.get(envName)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value) out[name] = value
    }
    return out
  } catch {
    return {}
  }
}

const PUBLISHABLE_KEY =
  injectedKeys('SUPABASE_PUBLISHABLE_KEYS')['default'] ??
  Deno.env.get('SUPABASE_ANON_KEY') ??
  ''

function callerClient(req: Request): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', PUBLISHABLE_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const PROVIDER_IDS: ProviderId[] = ['openai', 'anthropic', 'gemini', 'openai_compatible']
const PROOF_BUCKET = 'payment-proofs'

function mimeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function makeDeps(req: Request): ExtractDeps {
  const db = () => callerClient(req)
  return {
    enabled: Deno.env.get('RECEIPT_EXTRACT_ENABLED') === 'true',
    callerUserId: async () => {
      const { data, error } = await db().auth.getUser()
      if (error || !data.user) return null
      return data.user.id
    },
    loadProof: async (proofId) => {
      const { data, error } = await db()
        .from('payment_proofs')
        .select('id, teacher_id, storage_path, status, uploaded_at, amount, method')
        .eq('id', proofId)
        .single()
      if (error || !isRecord(data)) return null
      return {
        id: String(data.id),
        teacher_id: String(data.teacher_id),
        storage_path: String(data.storage_path),
        status: String(data.status),
        uploaded_at: typeof data.uploaded_at === 'string' ? data.uploaded_at : null,
        amount: Number(data.amount) || 0,
        method: String(data.method) as PaymentMethodId,
      } satisfies ProofForExtraction
    },
    downloadImage: async (storagePath) => {
      const { data, error } = await db().storage.from(PROOF_BUCKET).download(storagePath)
      if (error || !data) return null
      const bytes = new Uint8Array(await data.arrayBuffer())
      return { base64: bytesToBase64(bytes), mimeType: mimeForPath(storagePath) }
    },
    resolveKey: async (teacherId): Promise<ProviderKeyConfig | null> => {
      const { data, error } = await db().rpc('assistant_read_provider_key', {
        p_teacher_id: teacherId,
      })
      if (error) throw new Error(`provider key read failed: ${error.message}`)
      if (!isRecord(data)) return null
      const provider = String(data.provider ?? '') as ProviderId
      if (!PROVIDER_IDS.includes(provider)) {
        throw new ExtractError('the stored provider is not supported', 'extract_unconfigured', 500)
      }
      const keyB64 = Deno.env.get('ASSISTANT_KEY_ENCRYPTION_KEY')
      if (!keyB64) {
        throw new ExtractError(
          'key storage is not configured on the platform',
          'extract_unconfigured',
          500,
        )
      }
      let apiKey: string
      try {
        apiKey = await aesGcmDecrypt(
          String(data.key_ciphertext ?? ''),
          String(data.key_iv ?? ''),
          parseEncryptionKey(keyB64),
        )
      } catch {
        throw new ExtractError('the stored provider key cannot be decrypted', 'key_decrypt_failed', 500)
      }
      return {
        provider,
        model: typeof data.model === 'string' ? data.model : null,
        base_url: typeof data.base_url === 'string' ? data.base_url : null,
        api_key: apiKey,
      }
    },
  }
}

// CORS للمتصفح: الاستدعاء من التطبيق يمرّ بـ preflight OPTIONS
// (Authorization + apikey + content-type ترويسات غير بسيطة)، فبلا معالج
// OPTIONS وبلا ترويسات CORS يُحجب النداء قبل وصوله للدالة (405 بلا
// Access-Control-* — ثبت حياً 2026-11-25). النمط الموثّق من Supabase:
// ‏Allow-Origin: * يصلح مع ترويسة Authorization (بلا كوكيز/credentials).
// نفس نمط assistant-chat (core.ts) وsend-push (index.ts) حرفياً — كانت
// هذه الدالة الوحيدة بلا معالج CORS (بند بوابة تجميد فيز 2).
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return errorResponse(405, 'method not allowed')
  try {
    const outcome = await handleReceiptExtract(req, makeDeps(req))
    return new Response(JSON.stringify({ ok: true, ...outcome }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (err) {
    if (err instanceof ExtractError) return errorResponse(err.httpStatus, err.message)
    return errorResponse(500, 'unexpected extraction failure')
  }
})
