// ============================================================================
// محاكاة محلية كاملة لدالتي إرسال/ـWebhook واتساب (3A-300 — مسار
// الإرسال الكامل في الكود، migration ‏0045)
// ----------------------------------------------------------------------------
// تشغّل نفس core.ts الذي يعمل في الإنتاج حرفياً، مع خادم Graph API
// وهمي يلتقط الطلبات وذاكرة سجل رسائل وهمية — بلا أي اتصال بـ Meta
// أو Supabase. تغطي:
// • send-whatsapp-message: Kill switch ‏503 بلا أي أثر، بلا JWT ‏401،
//   طلب فاسد 400 (نوع/معاملات/مستلم)، غير مالك 403، إعداد ناقص 422،
//   قالب غير جاهز 422، توكن غائب 422، فشل كتابة السجل 500 بلا إرسال،
//   نجاح كامل (حمولة القالب + انتقال السجل queued←sent بـ wamid)،
//   رفض Graph ‏502 مع حفظ رمز/رسالة الخطأ في السجل، وخطأ شبكة 502.
// • whatsapp-webhook: تحقق GET (صحيح/فاسد/سرّ غائب)، POST بلا سرّ
//   تطبيق 401، توقيع فاسد 401، حالة delivered تحدّث السجل، حالة
//   failed برمز خطأ Meta، رسائل واردة بلا حالات 200 بلا تحديث،
//   وحمولة مشوّشة بتوقيع صالح 200 بلا تحديث.
//
// التشغيل: node scripts/simulate-whatsapp-messaging.mjs
// ============================================================================
import { createServer } from 'node:http'
import { createHmac } from 'node:crypto'
import { handleSendWhatsappMessage } from '../supabase/functions/send-whatsapp-message/core.ts'
import { handleWhatsappWebhook } from '../supabase/functions/whatsapp-webhook/core.ts'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TEACHER_ID = '22222222-2222-4222-8222-222222222222'
const PHONE = '+201012345678'
const TEACHER_TOKEN = 'sim' + '-teacher-' + 'tok'
const BAD_TEACHER_TOKEN = 'sim' + '-bad-' + 'tok'
const APP_SECRET = 'sim' + '-app-' + 'sec'
const VERIFY_TOKEN = 'sim' + '-verify-' + 'tok'

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
// يرفض أي طلب بتوكن المدرس الفاسد أو عند ضبط graphStatus على خطأ
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

// --- اعتماديات قابلة للضبط لكل سيناريو ---------------------------------------
const logRows = new Map()
let logSeq = 0
let state
function freshState() {
  logRows.clear()
  logSeq = 0
  graphCalls.length = 0
  graphStatus = 200
  return {
    userId: USER_ID,
    owner: true,
    config: { enabled: true, phoneNumberId: '1234567890', tokenPresent: true },
    template: { templateName: 'arrival_notice_ar', language: 'ar', status: 'ready' },
    token: TEACHER_TOKEN,
    insertLogOk: true,
    fetchThrows: false,
    webhookUpdates: [],
  }
}
function makeDeps() {
  return {
    getUserId: async () => state.userId,
    isOwner: async () => state.owner,
    loadConfig: async () => state.config,
    loadTemplate: async () => state.template,
    getToken: async () => state.token,
    insertLog: async (row) => {
      if (!state.insertLogOk) return null
      const id = `log-${++logSeq}`
      logRows.set(id, { ...row, status: 'queued' })
      return id
    },
    updateLog: async (id, patch) => {
      const row = logRows.get(id)
      if (row) Object.assign(row, patch)
    },
    fetchFn: async (input, init) => {
      if (state.fetchThrows) throw new Error('simulated network failure')
      return fetch(input, init)
    },
    now: () => Date.now(),
  }
}

const ON_ENV = {
  WHATSAPP_MESSAGING_ENABLED: 'true',
  WHATSAPP_GRAPH_BASE_URL: graphBase,
  WHATSAPP_GRAPH_VERSION: 'v23.0',
}
const OFF_ENV = { WHATSAPP_GRAPH_BASE_URL: graphBase, WHATSAPP_GRAPH_VERSION: 'v23.0' }

function sendReq(body, method = 'POST') {
  return new Request('http://127.0.0.1/send-whatsapp-message', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}
const GOOD_BODY = {
  teacher_id: TEACHER_ID,
  kind: 'arrival_notice',
  to: PHONE,
  params: ['أحمد', '٠٩:٣٠'],
}

// ============================================================================
// send-whatsapp-message
// ============================================================================
console.log('send-whatsapp-message:')

state = freshState()
{
  const res = await handleSendWhatsappMessage(sendReq(GOOD_BODY), OFF_ENV, makeDeps())
  check('kill switch off → 503', res.status === 503, `got ${res.status}`)
  check('kill switch off → no graph call, no log row', graphCalls.length === 0 && logRows.size === 0)
}

state = freshState()
state.userId = null
{
  const res = await handleSendWhatsappMessage(sendReq(GOOD_BODY), ON_ENV, makeDeps())
  check('no jwt → 401', res.status === 401, `got ${res.status}`)
}

state = freshState()
{
  const badKind = await handleSendWhatsappMessage(sendReq({ ...GOOD_BODY, kind: 'nope' }), ON_ENV, makeDeps())
  check('unknown kind → 400', badKind.status === 400, `got ${badKind.status}`)
  const badParams = await handleSendWhatsappMessage(sendReq({ ...GOOD_BODY, params: ['واحد'] }), ON_ENV, makeDeps())
  check('wrong param count → 400', badParams.status === 400, `got ${badParams.status}`)
  const badTo = await handleSendWhatsappMessage(sendReq({ ...GOOD_BODY, to: '123' }), ON_ENV, makeDeps())
  check('short recipient → 400', badTo.status === 400, `got ${badTo.status}`)
  const get = await handleSendWhatsappMessage(sendReq(GOOD_BODY, 'GET'), ON_ENV, makeDeps())
  check('GET → 405', get.status === 405, `got ${get.status}`)
}

state = freshState()
state.owner = false
{
  const res = await handleSendWhatsappMessage(sendReq(GOOD_BODY), ON_ENV, makeDeps())
  check('not owner → 403', res.status === 403, `got ${res.status}`)
  check('not owner → no graph call', graphCalls.length === 0)
}

state = freshState()
state.config = null
{
  const res = await handleSendWhatsappMessage(sendReq(GOOD_BODY), ON_ENV, makeDeps())
  check('no config row → 422', res.status === 422, `got ${res.status}`)
}
state = freshState()
state.config = { enabled: false, phoneNumberId: '1234567890', tokenPresent: true }
{
  const res = await handleSendWhatsappMessage(sendReq(GOOD_BODY), ON_ENV, makeDeps())
  check('config disabled → 422', res.status === 422, `got ${res.status}`)
}
state = freshState()
state.config = { enabled: true, phoneNumberId: '1234567890', tokenPresent: false }
{
  const res = await handleSendWhatsappMessage(sendReq(GOOD_BODY), ON_ENV, makeDeps())
  check('config without token → 422', res.status === 422, `got ${res.status}`)
}

state = freshState()
state.template = null
{
  const res = await handleSendWhatsappMessage(sendReq(GOOD_BODY), ON_ENV, makeDeps())
  const body = await res.json()
  check('template row missing → 422 template_not_ready', res.status === 422 && body.error?.code === 'template_not_ready', `got ${res.status}`)
}
state = freshState()
state.template = { templateName: 'arrival_notice_ar', language: 'ar', status: 'unknown' }
{
  const res = await handleSendWhatsappMessage(sendReq(GOOD_BODY), ON_ENV, makeDeps())
  check('template not marked ready → 422', res.status === 422, `got ${res.status}`)
  check('template not ready → no graph call', graphCalls.length === 0)
}

state = freshState()
state.token = null
{
  const res = await handleSendWhatsappMessage(sendReq(GOOD_BODY), ON_ENV, makeDeps())
  check('vault token missing → 422', res.status === 422, `got ${res.status}`)
}

state = freshState()
state.insertLogOk = false
{
  const res = await handleSendWhatsappMessage(sendReq(GOOD_BODY), ON_ENV, makeDeps())
  check('log insert failure → 500', res.status === 500, `got ${res.status}`)
  check('log insert failure → no graph call', graphCalls.length === 0)
}

state = freshState()
{
  const res = await handleSendWhatsappMessage(sendReq(GOOD_BODY), ON_ENV, makeDeps())
  const body = await res.json()
  check('success → 200 with message id', res.status === 200 && body.message_id === 'wamid.mock', `got ${res.status}`)
  check('success → one graph call to the teacher number id', graphCalls.length === 1 && graphCalls[0].url === '/v23.0/1234567890/messages', `url=${graphCalls[0]?.url}`)
  check('success → graph auth is the teacher token', graphCalls[0].headers.authorization === `Bearer ${TEACHER_TOKEN}`)
  const sent = JSON.parse(graphCalls[0].body)
  check(
    'success → utility template payload (name/lang/params, digits recipient)',
    sent.type === 'template' &&
      sent.to === '201012345678' &&
      sent.template.name === 'arrival_notice_ar' &&
      sent.template.language.code === 'ar' &&
      sent.template.components[0].parameters.map((p) => p.text).join('|') === 'أحمد|٠٩:٣٠',
  )
  const row = [...logRows.values()][0]
  check('success → log row sent with wamid', row?.status === 'sent' && row?.metaMessageId === 'wamid.mock' && row?.kind === 'arrival_notice')
}

state = freshState()
state.token = BAD_TEACHER_TOKEN
{
  const res = await handleSendWhatsappMessage(sendReq(GOOD_BODY), ON_ENV, makeDeps())
  check('graph rejection → 502', res.status === 502, `got ${res.status}`)
  const row = [...logRows.values()][0]
  check(
    'graph rejection → log failed with meta code/message',
    row?.status === 'failed' && row?.errorCode === 190 && row?.errorMessage === 'mock rejection',
    `row=${JSON.stringify(row)}`,
  )
}

state = freshState()
state.fetchThrows = true
{
  const res = await handleSendWhatsappMessage(sendReq(GOOD_BODY), ON_ENV, makeDeps())
  check('network error → 502', res.status === 502, `got ${res.status}`)
  const row = [...logRows.values()][0]
  check('network error → log failed (network error)', row?.status === 'failed' && row?.errorMessage === 'network error')
}

// ============================================================================
// whatsapp-webhook
// ============================================================================
console.log('whatsapp-webhook:')

function webhookDeps() {
  return {
    updateStatusByMetaId: async (metaId, status, error) => {
      state.webhookUpdates.push({ metaId, status, error })
      return true
    },
  }
}
const HOOK_ENV = { WHATSAPP_APP_SECRET: APP_SECRET, WHATSAPP_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN }
function sign(body, secret = APP_SECRET) {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}
function hookPost(body, signature) {
  return new Request('http://127.0.0.1/whatsapp-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
    body,
  })
}

state = freshState()
{
  const ok = await handleWhatsappWebhook(
    new Request(`http://127.0.0.1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=CH-123`),
    HOOK_ENV, webhookDeps(),
  )
  check('GET verify ok → 200 challenge', ok.status === 200 && (await ok.text()) === 'CH-123', `got ${ok.status}`)
  const bad = await handleWhatsappWebhook(
    new Request('http://127.0.0.1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=CH-123'),
    HOOK_ENV, webhookDeps(),
  )
  check('GET verify wrong token → 403', bad.status === 403, `got ${bad.status}`)
  const unset = await handleWhatsappWebhook(
    new Request(`http://127.0.0.1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=CH-123`),
    {}, webhookDeps(),
  )
  check('GET verify token unset (inert) → 403', unset.status === 403, `got ${unset.status}`)
}

state = freshState()
{
  const body = JSON.stringify({ entry: [] })
  const res = await handleWhatsappWebhook(hookPost(body, sign(body)), { WHATSAPP_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN }, webhookDeps())
  check('POST app secret unset (inert) → 401', res.status === 401, `got ${res.status}`)
  check('POST inert → no updates', state.webhookUpdates.length === 0)
}

state = freshState()
{
  const body = JSON.stringify({
    entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.x', status: 'delivered' }] } }] }],
  })
  const res = await handleWhatsappWebhook(hookPost(body, 'sha256=deadbeef'), HOOK_ENV, webhookDeps())
  check('POST bad signature → 401', res.status === 401, `got ${res.status}`)
  check('POST bad signature → no updates', state.webhookUpdates.length === 0)
}

state = freshState()
{
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.x', status: 'delivered', timestamp: '1' }] } }] }],
  })
  const res = await handleWhatsappWebhook(hookPost(body, sign(body)), HOOK_ENV, webhookDeps())
  const out = await res.json()
  check('POST delivered → 200 updated=1', res.status === 200 && out.updated === 1, `got ${res.status}`)
  check(
    'POST delivered → update recorded (no error)',
    state.webhookUpdates.length === 1 && state.webhookUpdates[0].metaId === 'wamid.x' &&
      state.webhookUpdates[0].status === 'delivered' && state.webhookUpdates[0].error === null,
  )
}

state = freshState()
{
  const body = JSON.stringify({
    entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.y', status: 'failed', errors: [{ code: 131047, title: 'Re-engagement message' }] }] } }] }],
  })
  const res = await handleWhatsappWebhook(hookPost(body, sign(body)), HOOK_ENV, webhookDeps())
  check(
    'POST failed → error code/title recorded',
    res.status === 200 && state.webhookUpdates.length === 1 &&
      state.webhookUpdates[0].status === 'failed' &&
      state.webhookUpdates[0].error?.code === 131047 &&
      state.webhookUpdates[0].error?.message === 'Re-engagement message',
    `updates=${JSON.stringify(state.webhookUpdates)}`,
  )
}

state = freshState()
{
  const body = JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{ id: 'wamid.in', from: '2010', type: 'text' }] } }] }],
  })
  const res = await handleWhatsappWebhook(hookPost(body, sign(body)), HOOK_ENV, webhookDeps())
  const out = await res.json()
  check('POST incoming message only → 200 updated=0', res.status === 200 && out.updated === 0, `got ${res.status}`)
}

state = freshState()
{
  const body = 'this is not json'
  const res = await handleWhatsappWebhook(hookPost(body, sign(body)), HOOK_ENV, webhookDeps())
  check('POST signed malformed json → 200 updated=0 (no retry storm)', res.status === 200, `got ${res.status}`)
}

graphServer.close()
console.log(failures === 0 ? '\nALL SIMULATION CHECKS PASSED' : `\n${failures} SIMULATION CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
