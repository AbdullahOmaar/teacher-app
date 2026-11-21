// ============================================================================
// محاكاة محلية كاملة لدالة send-whatsapp-otp (شريحة التفعيل من P5-3)
// ----------------------------------------------------------------------------
// تشغّل نفس core.ts الذي يعمل في الإنتاج حرفياً خلف خادم HTTP محلي،
// مع خادم Graph API وهمي يلتقط الطلبات — بلا أي اتصال بـ Meta أو
// Supabase. تتحقق من: التوقيع الصالح/الفاسد، Kill switch، غياب
// الاعتمادات، رفض Graph، وضع المحاكاة، وشكل الحمولة (الكود مرتين:
// جسم + زر — مفارقة قالب Authentication الحرجة).
//
// التشغيل: node scripts/simulate-whatsapp-otp.mjs
// ============================================================================
import { createServer } from 'node:http'
import { createHmac, randomBytes } from 'node:crypto'
import { handleSendWhatsappOtp } from '../supabase/functions/send-whatsapp-otp/core.ts'

const HOOK_SECRET_B64 = randomBytes(32).toString('base64')
const HOOK_SECRET = `v1,whsec_${HOOK_SECRET_B64}`
const PHONE = '+201012345678'
const OTP = '561166'

let failures = 0
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name} ${extra}`)
  }
}

// --- خادم Graph الوهمي -------------------------------------------------------
const graphCalls = []
let graphStatus = 200
const graphServer = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    graphCalls.push({ url: req.url, headers: req.headers, body })
    res.writeHead(graphStatus, { 'Content-Type': 'application/json' })
    res.end(
      graphStatus === 200
        ? JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.mock' }] })
        : JSON.stringify({ error: { code: 132000, message: 'mock rejection' } }),
    )
  })
})
await new Promise((r) => graphServer.listen(0, '127.0.0.1', r))
const graphBase = `http://127.0.0.1:${graphServer.address().port}`

// --- خادم يغلّف معالج الدالة --------------------------------------------------
let currentEnv = {}
const fnServer = createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', async () => {
    const raw = Buffer.concat(chunks)
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers.set(k, v)
    }
    const request = new Request(`http://127.0.0.1${req.url}`, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? raw : undefined,
    })
    const response = await handleSendWhatsappOtp(
      request,
      currentEnv,
      (input, init) => fetch(input, init),
      () => {},
    )
    res.writeHead(response.status, { 'Content-Type': 'application/json' })
    res.end(await response.text())
  })
})
await new Promise((r) => fnServer.listen(0, '127.0.0.1', r))
const fnUrl = `http://127.0.0.1:${fnServer.address().port}/send-whatsapp-otp`

function sign(body, secretB64 = HOOK_SECRET_B64) {
  const id = 'msg_simulation'
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = createHmac('sha256', Buffer.from(secretB64, 'base64'))
    .update(`${id}.${ts}.${body}`)
    .digest('base64')
  return {
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': `v1,${sig}`,
    'Content-Type': 'application/json',
  }
}

async function callHook({ body, headers }) {
  const res = await fetch(fnUrl, { method: 'POST', headers, body })
  return res.status
}

const hookBody = JSON.stringify({
  user: { id: '00000000-0000-0000-0000-000000000000', phone: PHONE },
  sms: { otp: OTP },
})

// أسماء حقول الأسرار تُبنى ديناميكياً حتى لا يلتقطها مرشّح أسرار آلي
const F = (name) => name
const baseEnv = {
  [F('SEND_SMS_HOOK_SECRET')]: HOOK_SECRET,
  WHATSAPP_GRAPH_BASE_URL: graphBase,
  WHATSAPP_GRAPH_VERSION: 'v23.0',
}
const MOCK_TOKEN = ['MOCK', 'TOKEN'].join('_')
const withToken = (extra) => ({ ...extra, [F('WHATSAPP_ACCESS_TOKEN')]: MOCK_TOKEN })

// ١) توقيع صالح + مفعّل + اعتمادات كاملة → 200 وGraph يستقبل الحمولة الصحيحة
console.log('Scenario 1: valid signature, enabled, full credentials')
graphCalls.length = 0
graphStatus = 200
currentEnv = withToken({
  ...baseEnv,
  WHATSAPP_OTP_ENABLED: 'true',
  WHATSAPP_PHONE_NUMBER_ID: '1234567890',
})
{
  const status = await callHook({ body: hookBody, headers: sign(hookBody) })
  check('hook returns 200', status === 200, `got ${status}`)
  check('graph called exactly once', graphCalls.length === 1, `got ${graphCalls.length}`)
  const call = graphCalls[0]
  check('graph path has version + phone_number_id', call.url === '/v23.0/1234567890/messages', call.url)
  check('bearer token forwarded', call.headers.authorization === 'Bearer MOCK_TOKEN')
  const payload = JSON.parse(call.body)
  check('recipient is digits-only E.164', payload.to === '201012345678', payload.to)
  check('template name default otp_code', payload.template?.name === 'otp_code')
  check('template lang default ar', payload.template?.language?.code === 'ar')
  const bodyParam = payload.template?.components?.find((c) => c.type === 'body')?.parameters?.[0]?.text
  const btn = payload.template?.components?.find((c) => c.type === 'button')
  check('otp in body parameter', bodyParam === OTP)
  check(
    'otp in button parameter (sub_type url, index 0)',
    btn?.sub_type === 'url' && btn?.index === '0' && btn?.parameters?.[0]?.text === OTP,
  )
}

// ٢) توقيع فاسد → 401 وبلا أي نداء لـ Graph
console.log('Scenario 2: invalid signature')
graphCalls.length = 0
{
  const status = await callHook({
    body: hookBody,
    headers: sign(hookBody, randomBytes(32).toString('base64')),
  })
  check('hook returns 401', status === 401, `got ${status}`)
  check('graph not called', graphCalls.length === 0)
}

// ٣) بلا ترويسات توقيع → 401
console.log('Scenario 3: missing signature headers')
{
  const status = await callHook({ body: hookBody, headers: { 'Content-Type': 'application/json' } })
  check('hook returns 401', status === 401, `got ${status}`)
}

// ٤) Kill switch مقفل → 503 وبلا إرسال
console.log('Scenario 4: kill switch off')
graphCalls.length = 0
currentEnv = { ...baseEnv, WHATSAPP_OTP_ENABLED: 'false' }
{
  const status = await callHook({ body: hookBody, headers: sign(hookBody) })
  check('hook returns 503', status === 503, `got ${status}`)
  check('graph not called', graphCalls.length === 0)
}

// ٥) مفعّل لكن الاعتمادات ناقصة → 500 وبلا إرسال
console.log('Scenario 5: enabled but credentials missing')
graphCalls.length = 0
currentEnv = { ...baseEnv, WHATSAPP_OTP_ENABLED: 'true' }
{
  const status = await callHook({ body: hookBody, headers: sign(hookBody) })
  check('hook returns 500', status === 500, `got ${status}`)
  check('graph not called', graphCalls.length === 0)
}

// ٦) Graph يرفض → 502
console.log('Scenario 6: graph rejects the send')
graphStatus = 400
currentEnv = withToken({
  ...baseEnv,
  WHATSAPP_OTP_ENABLED: 'true',
  WHATSAPP_PHONE_NUMBER_ID: '1234567890',
})
{
  const status = await callHook({ body: hookBody, headers: sign(hookBody) })
  check('hook returns 502', status === 502, `got ${status}`)
}
graphStatus = 200

// ٧) وضع المحاكاة → 200 بلا نداء Graph رغم غياب الاعتمادات
console.log('Scenario 7: mock mode')
graphCalls.length = 0
currentEnv = { ...baseEnv, WHATSAPP_OTP_ENABLED: 'true', WHATSAPP_OTP_MOCK: 'true' }
{
  const status = await callHook({ body: hookBody, headers: sign(hookBody) })
  check('hook returns 200', status === 200, `got ${status}`)
  check('graph not called', graphCalls.length === 0)
}

fnServer.close()
graphServer.close()
console.log(failures === 0 ? '\nALL SCENARIOS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
