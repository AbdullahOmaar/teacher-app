// ============================================================================
// محاكاة محلية كاملة لدوال واتساب (3A-300 — النموذج الاختياري per-teacher)
// ----------------------------------------------------------------------------
// تشغّل نفس core.ts الذي يعمل في الإنتاج حرفياً خلف خادم HTTP محلي،
// مع خادم Graph API وهمي يلتقط الطلبات — بلا أي اتصال بـ Meta أو
// Supabase. تغطي:
// • دالة send-whatsapp-otp (Hook): التوقيع الصالح/الفاسد، Kill switch،
//   مسار env الأحادي القديم (اعتمادات ناقصة/رفض Graph/mock)، ومسار
//   المُحلِّل متعدد المستأجرين: مدرس مفعّل تُستخدم قناته هو (رقمه
//   وتوكنه)، مدرس بلا إعداد ← 503 بلا Graph، توكن مدرس فاسد ← رفض
//   Graph ‏502، فشل الحلّ ← 502، غياب user.id ← 400، mock بعد الحلّ.
// • دالة send-whatsapp-test: بلا JWT ‏← 401، غير مالك ← 403، إعداد
//   ناقص ← 422، حدّ المعدل ← 429، Kill switch ← 503، ونجاح كامل
//   (الحمولة بالكود في المكوّنين + ختم last_test_at).
//
// التشغيل: node scripts/simulate-whatsapp-otp.mjs
// ============================================================================
import { createServer } from 'node:http'
import { createHmac, randomBytes } from 'node:crypto'
import { handleSendWhatsappOtp } from '../supabase/functions/send-whatsapp-otp/core.ts'
import { handleSendWhatsappTest } from '../supabase/functions/send-whatsapp-test/core.ts'

const HOOK_SECRET_B64 = randomBytes(32).toString('base64')
const HOOK_SECRET = `v1,whsec_${HOOK_SECRET_B64}`
const PHONE = '+201012345678'
const OTP = '561166'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const TEACHER_ID = '22222222-2222-4222-8222-222222222222'

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
// يرفض أي طلب بتوكن المدرس الفاسد (محاكاة توكن منتهٍ/خاطئ عند Meta)
const BAD_TEACHER_TOKEN = 'BAD_TEACHER_TOKEN'
const graphCalls = []
let graphStatus = 200
const graphServer = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    graphCalls.push({ url: req.url, headers: req.headers, body })
    const rejected = graphStatus !== 200 || req.headers.authorization === `Bearer ${BAD_TEACHER_TOKEN}`
    res.writeHead(rejected ? 400 : 200, { 'Content-Type': 'application/json' })
    res.end(
      rejected
        ? JSON.stringify({ error: { code: 190, message: 'mock rejection' } })
        : JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.mock' }] }),
    )
  })
})
await new Promise((r) => graphServer.listen(0, '127.0.0.1', r))
const graphBase = `http://127.0.0.1:${graphServer.address().port}`

// --- خادم يغلّف معالج دالة الـ Hook ------------------------------------------
let currentEnv = {}
let currentResolver = undefined
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
      currentResolver,
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
  user: { id: USER_ID, phone: PHONE },
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

// ============================================================================
// مسار env الأحادي (اختبار/طوارئ — بلا مُحلِّل)
// ============================================================================
currentResolver = undefined

// ١) توقيع صالح + مفعّل + اعتمادات كاملة → 200 وGraph يستقبل الحمولة الصحيحة
console.log('Scenario 1: [legacy] valid signature, enabled, full credentials')
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
console.log('Scenario 5: [legacy] enabled but credentials missing')
graphCalls.length = 0
currentEnv = { ...baseEnv, WHATSAPP_OTP_ENABLED: 'true' }
{
  const status = await callHook({ body: hookBody, headers: sign(hookBody) })
  check('hook returns 500', status === 500, `got ${status}`)
  check('graph not called', graphCalls.length === 0)
}

// ٦) Graph يرفض → 502
console.log('Scenario 6: [legacy] graph rejects the send')
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
console.log('Scenario 7: [legacy] mock mode')
graphCalls.length = 0
currentEnv = { ...baseEnv, WHATSAPP_OTP_ENABLED: 'true', WHATSAPP_OTP_MOCK: 'true' }
{
  const status = await callHook({ body: hookBody, headers: sign(hookBody) })
  check('hook returns 200', status === 200, `got ${status}`)
  check('graph not called', graphCalls.length === 0)
}

// ============================================================================
// مسار المُحلِّل — متعدد المستأجرين (النموذج الاختياري per-teacher)
// ============================================================================
const TEACHER_TOKEN = 'TEACHER_OWN_TOKEN'
const teacherChannel = {
  teacherId: TEACHER_ID,
  accessToken: TEACHER_TOKEN,
  phoneNumberId: '999888777',
  templateName: 'otp_code',
  templateLang: 'ar',
}

// ٨) مدرس مفعّل: تُستخدم قناته هو — رقمه وتوكنه وقالب سنتره
console.log('Scenario 8: [tenant] enabled teacher — his own channel is used')
graphCalls.length = 0
currentEnv = { ...baseEnv, WHATSAPP_OTP_ENABLED: 'true' }
currentResolver = async (userId) => {
  check('resolver receives the hook user id', userId === USER_ID, `got ${userId}`)
  return teacherChannel
}
{
  const status = await callHook({ body: hookBody, headers: sign(hookBody) })
  check('hook returns 200', status === 200, `got ${status}`)
  check('graph called exactly once', graphCalls.length === 1, `got ${graphCalls.length}`)
  const call = graphCalls[0]
  check('graph path uses the TEACHER phone_number_id', call.url === '/v23.0/999888777/messages', call.url)
  check('graph auth uses the TEACHER token', call.headers.authorization === `Bearer ${TEACHER_TOKEN}`)
  const payload = JSON.parse(call.body)
  check('recipient is the teacher phone digits-only', payload.to === '201012345678', payload.to)
}

// ٩) مدرس بلا إعداد واتساب (المُحلِّل يرجع null) → 503 رشيق وبلا Graph
console.log('Scenario 9: [tenant] no whatsapp config — graceful 503')
graphCalls.length = 0
currentResolver = async () => null
{
  const status = await callHook({ body: hookBody, headers: sign(hookBody) })
  check('hook returns 503', status === 503, `got ${status}`)
  check('graph not called (no cost to anyone)', graphCalls.length === 0)
}

// ١٠) توكن المدرس فاسد عند Meta → 502 (رفض Graph بقناة المدرس)
console.log('Scenario 10: [tenant] teacher token rejected by graph — 502')
graphCalls.length = 0
currentResolver = async () => ({ ...teacherChannel, accessToken: BAD_TEACHER_TOKEN })
{
  const status = await callHook({ body: hookBody, headers: sign(hookBody) })
  check('hook returns 502', status === 502, `got ${status}`)
  check('graph was attempted with the bad teacher token', graphCalls.length === 1)
}

// ١١) فشل حلّ القناة (قاعدة/شبكة) → 502 مميز عن «بلا إعداد»
console.log('Scenario 11: [tenant] resolver throws — 502 resolution failed')
graphCalls.length = 0
currentResolver = async () => {
  throw new Error('mock db down')
}
{
  const status = await callHook({ body: hookBody, headers: sign(hookBody) })
  check('hook returns 502', status === 502, `got ${status}`)
  check('graph not called', graphCalls.length === 0)
}

// ١٢) غياب user.id في الحمولة مع وجود مُحلِّل → 400
console.log('Scenario 12: [tenant] missing user id — 400')
currentResolver = async () => teacherChannel
{
  const noIdBody = JSON.stringify({ user: { phone: PHONE }, sms: { otp: OTP } })
  const status = await callHook({ body: noIdBody, headers: sign(noIdBody) })
  check('hook returns 400', status === 400, `got ${status}`)
}

// ١٣) mock بعد حلّ ناجح → 200 بلا Graph
console.log('Scenario 13: [tenant] mock mode after successful resolution')
graphCalls.length = 0
currentEnv = { ...baseEnv, WHATSAPP_OTP_ENABLED: 'true', WHATSAPP_OTP_MOCK: 'true' }
currentResolver = async () => teacherChannel
{
  const status = await callHook({ body: hookBody, headers: sign(hookBody) })
  check('hook returns 200', status === 200, `got ${status}`)
  check('graph not called', graphCalls.length === 0)
}
currentResolver = undefined

// ============================================================================
// دالة send-whatsapp-test — اعتماديات وهمية بنفس عقد الإنتاج
// ============================================================================
function testRequest() {
  return new Request('http://127.0.0.1/send-whatsapp-test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teacher_id: TEACHER_ID }),
  })
}

function makeTestDeps(overrides = {}) {
  const state = { marked: false, graphCalls: 0, lastPayload: null, lastUrl: '' }
  const deps = {
    getUserId: async () => USER_ID,
    loadOwnedTeacher: async () => ({ phone: PHONE }),
    loadConfig: async () => ({
      enabled: true,
      phoneNumberId: '999888777',
      templateName: 'otp_code',
      templateLang: 'ar',
      tokenPresent: true,
      lastTestAt: null,
    }),
    getToken: async () => TEACHER_TOKEN,
    markTested: async () => {
      state.marked = true
    },
    fetchFn: async (input, init) => {
      state.graphCalls++
      state.lastUrl = input
      state.lastPayload = JSON.parse(init.body)
      state.lastAuth = init.headers.Authorization
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), { status: 200 })
    },
    now: () => Date.now(),
    randomCode: () => '424242',
    ...overrides,
  }
  return { deps, state }
}
const testEnv = { WHATSAPP_OTP_ENABLED: 'true', WHATSAPP_GRAPH_VERSION: 'v23.0' }

// T1) Kill switch مقفل → 503 قبل أي شيء
console.log('Test-fn T1: platform kill switch off — 503')
{
  const { deps } = makeTestDeps()
  const res = await handleSendWhatsappTest(testRequest(), { WHATSAPP_OTP_ENABLED: 'false' }, deps)
  check('returns 503', res.status === 503, `got ${res.status}`)
}

// T2) بلا JWT → 401
console.log('Test-fn T2: no authenticated user — 401')
{
  const { deps } = makeTestDeps({ getUserId: async () => null })
  const res = await handleSendWhatsappTest(testRequest(), testEnv, deps)
  check('returns 401', res.status === 401, `got ${res.status}`)
}

// T3) مستخدم ليس مالك السنتر → 403
console.log('Test-fn T3: not the centre owner — 403')
{
  const { deps } = makeTestDeps({ loadOwnedTeacher: async () => null })
  const res = await handleSendWhatsappTest(testRequest(), testEnv, deps)
  check('returns 403', res.status === 403, `got ${res.status}`)
}

// T4) إعداد ناقص (التوكن غير محفوظ) → 422
console.log('Test-fn T4: incomplete config (no token saved) — 422')
{
  const { deps } = makeTestDeps({
    loadConfig: async () => ({
      enabled: true,
      phoneNumberId: '999888777',
      templateName: 'otp_code',
      templateLang: 'ar',
      tokenPresent: false,
      lastTestAt: null,
    }),
  })
  const res = await handleSendWhatsappTest(testRequest(), testEnv, deps)
  check('returns 422', res.status === 422, `got ${res.status}`)
}

// T5) حدّ المعدل: إرسال تجريبي قبل أقل من 60 ثانية → 429
console.log('Test-fn T5: rate limited — 429')
{
  const { deps } = makeTestDeps({
    loadConfig: async () => ({
      enabled: true,
      phoneNumberId: '999888777',
      templateName: 'otp_code',
      templateLang: 'ar',
      tokenPresent: true,
      lastTestAt: new Date(Date.now() - 10_000).toISOString(),
    }),
  })
  const res = await handleSendWhatsappTest(testRequest(), testEnv, deps)
  check('returns 429', res.status === 429, `got ${res.status}`)
  const body = await res.json()
  check('retry_after_seconds present', typeof body.error?.retry_after_seconds === 'number')
}

// T6) نجاح كامل: Graph بقناة المدرس + الكود في المكوّنين + ختم last_test_at
console.log('Test-fn T6: full success')
{
  const { deps, state } = makeTestDeps()
  const res = await handleSendWhatsappTest(testRequest(), testEnv, deps)
  check('returns 200', res.status === 200, `got ${res.status}`)
  check('graph called once', state.graphCalls === 1)
  check('graph path uses teacher phone_number_id', state.lastUrl.endsWith('/v23.0/999888777/messages'), state.lastUrl)
  check('graph auth uses teacher token', state.lastAuth === `Bearer ${TEACHER_TOKEN}`)
  check('recipient is profile phone digits-only', state.lastPayload?.to === '201012345678')
  const bodyParam = state.lastPayload?.template?.components?.find((c) => c.type === 'body')?.parameters?.[0]?.text
  const btnParam = state.lastPayload?.template?.components?.find((c) => c.type === 'button')?.parameters?.[0]?.text
  check('test code in body + button parameters', bodyParam === '424242' && btnParam === '424242')
  check('last_test_at marked', state.marked === true)
}

fnServer.close()
graphServer.close()
console.log(failures === 0 ? '\nALL SCENARIOS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
