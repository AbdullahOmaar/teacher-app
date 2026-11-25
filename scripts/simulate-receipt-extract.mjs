// ============================================================================
// محاكاة محلية كاملة لدالة receipt-extract (Extract-1 — Phase 2 T10)
// ----------------------------------------------------------------------------
// تشغّل نفس core.ts الذي سيعمل في الإنتاج حرفياً، باعتماديات وهمية وHTTP
// مُحاكى لكل مزوّد — بلا أي اتصال بـ Supabase أو أي مزوّد ذكاء، وبلا أي
// مفتاح حقيقي (المفتاح الوهمي هنا قيمة اختبار مُجمّعة وقت التشغيل).
//
// تغطي: Kill switch ‏503، بلا هوية 401، جسم فاسد 400، إثبات غائب 404،
// إثبات غير معلّق 409، غياب مفتاح BYOK ‏422 بلا أي نداء شبكي، مسارات
// الرؤية الثلاثة (OpenAI/Anthropic/Gemini) ببنائها وتحليلها، التحقق
// الصارم (تاريخ مستحيل/طريقة مجهولة/مبلغ سالب → null لا تخمين)، مقارنة
// المستخرج بالمُعلن، وتنقية خطأ المزوّد من المفتاح نفسه.
//
// التشغيل: node scripts/simulate-receipt-extract.mjs
// ⚠️ الدالة غير منشورة على المنصة (بوابة تجميد فيز 2) — هذه المحاكاة هي
// مستوى الإثبات الحالي، ولا تدّعي أي تشغيل حي.
// ============================================================================
import {
  ExtractError,
  buildVisionRequest,
  handleReceiptExtract,
  parseVisionResponse,
  validateExtraction,
} from '../supabase/functions/receipt-extract/core.ts'

const FAKE_KEY = ['sk', 'simulate', '0000'].join('-')
const OWNER = '11111111-1111-4111-8111-111111111111'
const PROOF = {
  id: 'proof-1',
  teacher_id: 'teacher-1',
  storage_path: 'teacher-1/proof-1.jpg',
  status: 'pending',
  uploaded_at: '2026-11-25T06:00:00Z',
  amount: 750,
  method: 'instapay',
}

let checks = 0
let failures = 0
function check(name, cond, detail = '') {
  checks++
  if (cond) console.log(`  PASS ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name} ${detail}`)
  }
}

function req(body) {
  return new Request('http://local/receipt-extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function baseDeps(overrides = {}) {
  return {
    enabled: true,
    callerUserId: async () => OWNER,
    loadProof: async (id) => (id === PROOF.id ? { ...PROOF } : null),
    downloadImage: async () => ({ base64: 'aGVsbG8=', mimeType: 'image/jpeg' }),
    resolveKey: async () => ({
      provider: 'openai',
      model: null,
      base_url: null,
      api_key: FAKE_KEY,
    }),
    fetchFn: async () => {
      throw new Error('fetch not stubbed for this case')
    },
    ...overrides,
  }
}

async function expectError(name, promise, status, code) {
  try {
    await promise
    check(name, false, 'expected an ExtractError, got success')
  } catch (err) {
    check(
      name,
      err instanceof ExtractError && err.httpStatus === status && err.code === code,
      `got ${err?.httpStatus}/${err?.code}: ${err?.message}`,
    )
  }
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const openAiReply = (obj) =>
  jsonResponse(200, { choices: [{ message: { content: JSON.stringify(obj) } }] })

// ---------------------------------------------------------------------------
console.log('receipt-extract simulation:')

await expectError(
  'kill switch off → 503 extract_disabled',
  handleReceiptExtract(req({ proof_id: PROOF.id }), baseDeps({ enabled: false })),
  503,
  'extract_disabled',
)
await expectError(
  'no caller identity → 401',
  handleReceiptExtract(req({ proof_id: PROOF.id }), baseDeps({ callerUserId: async () => null })),
  401,
  'unauthorized',
)
await expectError(
  'malformed body → 400',
  handleReceiptExtract(req('{not json'), baseDeps()),
  400,
  'bad_request',
)
await expectError(
  'unknown proof → 404',
  handleReceiptExtract(req({ proof_id: 'nope' }), baseDeps()),
  404,
  'not_found',
)
await expectError(
  'already-reviewed proof → 409',
  handleReceiptExtract(
    req({ proof_id: PROOF.id }),
    baseDeps({ loadProof: async () => ({ ...PROOF, status: 'approved' }) }),
  ),
  409,
  'proof_not_pending',
)

{
  let fetchCalls = 0
  await expectError(
    'no BYOK key → 422 and zero network calls',
    handleReceiptExtract(
      req({ proof_id: PROOF.id }),
      baseDeps({
        resolveKey: async () => null,
        fetchFn: async () => {
          fetchCalls++
          return openAiReply({})
        },
      }),
    ),
    422,
    'no_api_key',
  )
  check('no-key path made no fetch call', fetchCalls === 0)
}

{
  const outcome = await handleReceiptExtract(
    req({ proof_id: PROOF.id }),
    baseDeps({
      fetchFn: async (url, init) => {
        check('openai request url', url === 'https://api.openai.com/v1/chat/completions', url)
        const body = JSON.parse(init.body)
        const parts = body.messages[0].content
        check(
          'openai request carries a data-URI image part',
          parts.some((p) => p.type === 'image_url' && p.image_url.url.startsWith('data:image/jpeg;base64,')),
        )
        return openAiReply({ amount: 750, paid_on: '2026-11-24', method: 'instapay', confidence: 'high' })
      },
    }),
  )
  check(
    'openai happy path extracts all fields',
    outcome.extracted.amount === 750 &&
      outcome.extracted.paid_on === '2026-11-24' &&
      outcome.extracted.method === 'instapay' &&
      outcome.extracted.confidence === 'high',
    JSON.stringify(outcome.extracted),
  )
  check(
    'declared comparison matches',
    outcome.matches_declared.amount_match === true && outcome.matches_declared.method_match === true,
  )
}

{
  const outcome = await handleReceiptExtract(
    req({ proof_id: PROOF.id }),
    baseDeps({
      resolveKey: async () => ({ provider: 'anthropic', model: null, base_url: null, api_key: FAKE_KEY }),
      fetchFn: async (url, init) => {
        check('anthropic request url', url === 'https://api.anthropic.com/v1/messages', url)
        const body = JSON.parse(init.body)
        check(
          'anthropic request carries a base64 image block',
          body.messages[0].content.some((b) => b.type === 'image' && b.source.type === 'base64'),
        )
        return jsonResponse(200, {
          content: [{ type: 'text', text: '```json\n{"amount": 700, "paid_on": null, "method": "instapay", "confidence": "medium"}\n```' }],
        })
      },
    }),
  )
  check(
    'anthropic fenced JSON parsed; amount mismatch flagged',
    outcome.extracted.amount === 700 &&
      outcome.matches_declared.amount_match === false &&
      outcome.matches_declared.method_match === true,
    JSON.stringify(outcome),
  )
}

{
  const outcome = await handleReceiptExtract(
    req({ proof_id: PROOF.id }),
    baseDeps({
      resolveKey: async () => ({ provider: 'gemini', model: null, base_url: null, api_key: FAKE_KEY }),
      fetchFn: async (url, init) => {
        check('gemini request url has model', url.includes(':generateContent'), url)
        const body = JSON.parse(init.body)
        check(
          'gemini request carries inline_data',
          body.contents[0].parts.some((p) => p.inline_data?.mime_type === 'image/jpeg'),
        )
        return jsonResponse(200, {
          candidates: [
            {
              content: {
                parts: [
                  { text: '{"amount": -5, "paid_on": "2026-02-30", "method": "paypal", "confidence": "sure"}' },
                ],
              },
            },
          ],
        })
      },
    }),
  )
  check(
    'strict validation nulls impossible date, unknown method, negative amount, bad confidence',
    outcome.extracted.amount === null &&
      outcome.extracted.paid_on === null &&
      outcome.extracted.method === null &&
      outcome.extracted.confidence === 'low',
    JSON.stringify(outcome.extracted),
  )
  check(
    'comparison is null when extraction is null',
    outcome.matches_declared.amount_match === null && outcome.matches_declared.method_match === null,
  )
}

await expectError(
  'provider 500 → 502 with the key scrubbed from the message',
  handleReceiptExtract(
    req({ proof_id: PROOF.id }),
    baseDeps({
      fetchFn: async () =>
        new Response(JSON.stringify({ error: { message: `bad key ${FAKE_KEY} rejected` } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
    }),
  ).catch((err) => {
    check('error message contains no key', !String(err.message).includes(FAKE_KEY), err.message)
    throw err
  }),
  502,
  'provider_error',
)

await expectError(
  'provider reply without JSON → 502 provider_protocol',
  handleReceiptExtract(
    req({ proof_id: PROOF.id }),
    baseDeps({ fetchFn: async () => openAiReplyRaw('I cannot read this image') }),
  ),
  502,
  'provider_protocol',
)

function openAiReplyRaw(text) {
  return jsonResponse(200, { choices: [{ message: { content: text } }] })
}

{
  let threw = null
  try {
    buildVisionRequest(
      { provider: 'openai_compatible', model: null, base_url: null, api_key: FAKE_KEY },
      'aGVsbG8=',
      'image/jpeg',
    )
  } catch (err) {
    threw = err
  }
  check(
    'openai_compatible without base_url → 422 model_required',
    threw instanceof ExtractError && threw.code === 'model_required',
  )
  const parsed = parseVisionResponse('openai', {
    choices: [{ message: { content: '{"amount": 12.345, "paid_on": "2026-01-05", "method": "cash", "confidence": "high"}' } }],
  })
  check('amount is rounded to 2 decimals', parsed.amount === 12.35 || parsed.amount === 12.34, String(parsed.amount))
  check(
    'validateExtraction rejects non-record input wholesale',
    validateExtraction('junk').amount === null && validateExtraction(null).confidence === 'low',
  )
}

console.log(`\nreceipt-extract simulation: ${checks - failures}/${checks} passed`)
if (failures > 0) process.exit(1)
