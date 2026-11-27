// ============================================================================
// اختبارات عقود API — فجوة 40 من تقييم الـ45 (Phase 2، المهمة 7: 3A-711)
// ----------------------------------------------------------------------------
// العقد المُختبَر هنا هو سطح HTTP العام للدوال الحدّية الخمس: أكواد الحالة
// + شكل جسم الرد. كل الأخطاء بلا استثناء على شكل مغلف واحد:
//   { "error": { "http_code": <نفس كود الحالة>, "message": <نص غير فارغ> } }
// برأس Content-Type: application/json. والنجاحات بأشكالها الموثقة لكل دالة.
// الاختبارات تشغّل نفس core.ts الذي يعمل في الإنتاج حرفياً (نفس نمط
// محاكيات scripts/simulate-*.mjs) لكنها تثبّت «العقد» لا سلوك الأعمال:
// المحاكيات القائمة تختبر المسارات الداخلية، وهذا الملف يمنع كسر العقد
// العام (إعادة تسمية حقل/تغيير كود/تسريب شكل خطأ خام) في أي تعديل قادم.
// بلا أي اتصال خارجي: كل الاعتماديات وهمية بنفس عقود الحقن في الإنتاج.
//
// التشغيل: node scripts/contract_tests.mjs  (أو npm run test:contracts)
// في CI: خطوة حاجبة داخل وظيفة check-and-test.
// ============================================================================
import { createHmac, randomBytes } from 'node:crypto'
import { handleSendWhatsappOtp } from '../supabase/functions/send-whatsapp-otp/core.ts'
import { handleSendWhatsappTest } from '../supabase/functions/send-whatsapp-test/core.ts'
import { handleSendWhatsappMessage } from '../supabase/functions/send-whatsapp-message/core.ts'
import { handleWhatsappWebhook } from '../supabase/functions/whatsapp-webhook/core.ts'
import {
  DeterministicTestPlanner,
  handleAssistantChat,
} from '../supabase/functions/assistant-chat/core.ts'

let failures = 0
let checks = 0
function check(name, cond, extra = '') {
  checks++
  if (cond) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name} ${extra}`)
  }
}

const TEACHER_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const noopFetch = async () => new Response('{}', { status: 200 })

function postReq(body, headers = {}) {
  return new Request('https://contract.test/fn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** عقد الخطأ الموحد: الحالة + JSON + مغلف error.http_code/message */
async function expectError(label, res, status) {
  check(`${label}: status ${status}`, res.status === status, `got ${res.status}`)
  const ct = res.headers.get('Content-Type') ?? ''
  check(`${label}: content-type json`, ct.includes('application/json'), ct)
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  check(`${label}: body is json object`, body !== null && typeof body === 'object')
  const err = body?.error
  check(
    `${label}: error envelope {http_code,message}`,
    err !== null &&
      typeof err === 'object' &&
      err.http_code === status &&
      typeof err.message === 'string' &&
      err.message.length > 0,
    JSON.stringify(body).slice(0, 200),
  )
}

async function expectOk(label, res, verify) {
  check(`${label}: status 200`, res.status === 200, `got ${res.status}`)
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  check(`${label}: body is json object`, body !== null && typeof body === 'object')
  if (body) verify(body)
}

// ============================================================================
// 1) send-whatsapp-otp — Hook موقّع (Standard Webhooks)
// ============================================================================
console.log('contract: send-whatsapp-otp')
{
  const keyBytes = randomBytes(32)
  const secret = `v1,whsec_${keyBytes.toString('base64')}`
  const hookBody = JSON.stringify({
    user: { id: USER_ID, phone: '201012345678' },
    sms: { otp: '561166' },
  })
  const sign = (body) => {
    const id = 'contract-msg-1'
    const ts = String(Math.floor(Date.now() / 1000))
    const sig = createHmac('sha256', keyBytes).update(`${id}.${ts}.${body}`).digest('base64')
    return {
      'webhook-id': id,
      'webhook-timestamp': ts,
      'webhook-signature': `v1,${sig}`,
    }
  }
  const envBase = { SEND_SMS_HOOK_SECRET: secret }

  await expectError(
    'otp GET',
    await handleSendWhatsappOtp(new Request('https://contract.test/fn', { method: 'GET' }), envBase, noopFetch),
    405,
  )
  await expectError(
    'otp unsigned',
    await handleSendWhatsappOtp(postReq(hookBody), envBase, noopFetch),
    401,
  )
  await expectError(
    'otp signed + kill switch off',
    await handleSendWhatsappOtp(postReq(hookBody, sign(hookBody)), envBase, noopFetch),
    503,
  )
  await expectOk(
    'otp signed + enabled + mock',
    await handleSendWhatsappOtp(
      postReq(hookBody, sign(hookBody)),
      { ...envBase, WHATSAPP_OTP_ENABLED: 'true', WHATSAPP_OTP_MOCK: 'true' },
      noopFetch,
    ),
    (body) => check('otp mock success: empty object body', Object.keys(body).length === 0),
  )
  await expectError(
    'otp signed + enabled + account not configured',
    await handleSendWhatsappOtp(
      postReq(hookBody, sign(hookBody)),
      { ...envBase, WHATSAPP_OTP_ENABLED: 'true' },
      noopFetch,
      () => {},
      async () => null,
    ),
    503,
  )
}

// ============================================================================
// 2) send-whatsapp-test — إرسال تجريبي (JWT + مالك فقط)
// ============================================================================
console.log('contract: send-whatsapp-test')
{
  const envOn = { WHATSAPP_OTP_ENABLED: 'true' }
  const fullConfig = {
    enabled: true,
    phoneNumberId: '123456',
    tokenPresent: true,
    templateName: 'test_code',
    templateLang: 'ar',
    lastTestAt: null,
  }
  const depsBase = {
    getUserId: async () => USER_ID,
    loadOwnedTeacher: async () => ({ phone: '+201012345678' }),
    loadConfig: async () => fullConfig,
    getToken: async () => 'token',
    markTested: async () => {},
    fetchFn: async () =>
      new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.x' }] }), {
        status: 200,
      }),
    now: () => Date.now(),
    randomCode: () => '123456',
  }

  await expectError(
    'test GET',
    await handleSendWhatsappTest(new Request('https://contract.test/fn', { method: 'GET' }), envOn, depsBase),
    405,
  )
  await expectError(
    'test kill switch off',
    await handleSendWhatsappTest(postReq({ teacher_id: TEACHER_ID }), {}, depsBase),
    503,
  )
  await expectError(
    'test no JWT',
    await handleSendWhatsappTest(postReq({ teacher_id: TEACHER_ID }), envOn, {
      ...depsBase,
      getUserId: async () => null,
    }),
    401,
  )
  await expectError(
    'test invalid json',
    await handleSendWhatsappTest(postReq('{not json'), envOn, depsBase),
    400,
  )
  await expectError(
    'test missing teacher_id',
    await handleSendWhatsappTest(postReq({}), envOn, depsBase),
    400,
  )
  await expectError(
    'test not owner',
    await handleSendWhatsappTest(postReq({ teacher_id: TEACHER_ID }), envOn, {
      ...depsBase,
      loadOwnedTeacher: async () => null,
    }),
    403,
  )
  await expectError(
    'test incomplete config',
    await handleSendWhatsappTest(postReq({ teacher_id: TEACHER_ID }), envOn, {
      ...depsBase,
      loadConfig: async () => ({ ...fullConfig, enabled: false }),
    }),
    422,
  )
  await expectOk(
    'test success',
    await handleSendWhatsappTest(postReq({ teacher_id: TEACHER_ID }), envOn, depsBase),
    (body) => check('test success: {ok:true}', body.ok === true),
  )
}

// ============================================================================
// 3) send-whatsapp-message — إرسال فعلي بأنواع موثقة
// ============================================================================
console.log('contract: send-whatsapp-message')
{
  const envOn = { WHATSAPP_MESSAGING_ENABLED: 'true' }
  const depsBase = {
    getUserId: async () => USER_ID,
    isOwner: async () => true,
    loadConfig: async () => ({
      enabled: true,
      phoneNumberId: '123456',
      tokenPresent: true,
    }),
    loadTemplate: async () => ({ status: 'ready', templateName: 'arrival_notice_v1' }),
    getToken: async () => 'token',
    insertLog: async () => 'log-1',
    updateLog: async () => {},
    fetchFn: async () =>
      new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.1' }] }), {
        status: 200,
      }),
    now: () => Date.now(),
  }
  const goodBody = {
    teacher_id: TEACHER_ID,
    kind: 'arrival_notice',
    to: '+201012345678',
    params: ['أحمد', 'السنتر'],
  }

  await expectError(
    'message GET',
    await handleSendWhatsappMessage(new Request('https://contract.test/fn', { method: 'GET' }), envOn, depsBase),
    405,
  )
  await expectError(
    'message kill switch off',
    await handleSendWhatsappMessage(postReq(goodBody), {}, depsBase),
    503,
  )
  await expectError(
    'message no JWT',
    await handleSendWhatsappMessage(postReq(goodBody), envOn, { ...depsBase, getUserId: async () => null }),
    401,
  )
  await expectError(
    'message unknown kind',
    await handleSendWhatsappMessage(postReq({ ...goodBody, kind: 'bogus_kind' }), envOn, depsBase),
    400,
  )
  await expectError(
    'message wrong param count',
    await handleSendWhatsappMessage(postReq({ ...goodBody, params: ['واحد'] }), envOn, depsBase),
    400,
  )
  await expectOk(
    'message success',
    await handleSendWhatsappMessage(postReq(goodBody), envOn, depsBase),
    (body) => {
      check('message success: ok===true', body.ok === true)
      check('message success: log_id echoes insert', body.log_id === 'log-1')
      check('message success: message_id from provider', body.message_id === 'wamid.1')
    },
  )
}

// ============================================================================
// 4) whatsapp-webhook — تحقق الاشتراك + أحداث الحالات الموقعة
// ============================================================================
console.log('contract: whatsapp-webhook')
{
  const env = {
    WHATSAPP_APP_SECRET: 'contract-secret',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'contract-verify-token',
  }
  const updates = []
  const deps = {
    updateStatusByMetaId: async (id, status) => {
      updates.push([id, status])
      return true
    },
  }
  const signRaw = (raw) =>
    'sha256=' + createHmac('sha256', env.WHATSAPP_APP_SECRET).update(raw).digest('hex')

  const getOk = await handleWhatsappWebhook(
    new Request(
      'https://contract.test/fn?hub.mode=subscribe&hub.verify_token=contract-verify-token&hub.challenge=CH-42',
    ),
    env,
    deps,
  )
  check('webhook GET verify: status 200', getOk.status === 200, `got ${getOk.status}`)
  check(
    'webhook GET verify: text/plain',
    (getOk.headers.get('Content-Type') ?? '').includes('text/plain'),
  )
  check('webhook GET verify: body is the challenge verbatim', (await getOk.text()) === 'CH-42')

  await expectError(
    'webhook GET wrong token',
    await handleWhatsappWebhook(
      new Request('https://contract.test/fn?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=CH-42'),
      env,
      deps,
    ),
    403,
  )
  await expectError(
    'webhook POST unsigned',
    await handleWhatsappWebhook(postReq({ entry: [] }), env, deps),
    401,
  )

  const badJson = 'this is not json'
  const ackRes = await handleWhatsappWebhook(
    postReq(badJson, { 'x-hub-signature-256': signRaw(badJson) }),
    env,
    deps,
  )
  await expectOk('webhook POST signed non-json ack', ackRes, (body) => {
    check('webhook ack: ok===true', body.ok === true)
    check('webhook ack: updated===0', body.updated === 0)
  })

  const eventBody = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [{ id: 'wamid.9', status: 'delivered', timestamp: '1700000000' }],
            },
          },
        ],
      },
    ],
  })
  const evRes = await handleWhatsappWebhook(
    postReq(eventBody, { 'x-hub-signature-256': signRaw(eventBody) }),
    env,
    deps,
  )
  await expectOk('webhook POST status event', evRes, (body) => {
    check('webhook event: ok===true', body.ok === true)
    check('webhook event: updated===1', body.updated === 1)
  })
  check(
    'webhook event: dep received (wamid.9, delivered)',
    updates.length === 1 && updates[0][0] === 'wamid.9' && updates[0][1] === 'delivered',
    JSON.stringify(updates),
  )
}

// ============================================================================
// 5) assistant-chat — مساعد منفّذ (علم منصة + JWT + أفعال موثقة)
// ============================================================================
console.log('contract: assistant-chat')
{
  const depsBase = {
    getUserId: async () => USER_ID,
    getCallerContext: async () => ({ role: 'owner', permissions: {} }),
    fetchBalances: async () => [],
    fetchStudents: async () => [],
    fetchAttendance: async () => [],
    fetchPayments: async () => [],
    fetchGroup: async () => null,
    insertStudent: async () => ({ student_id: 's-1' }),
    beginRead: async () => 'run-1',
    createProposal: async () => null,
    confirmProposal: async () => ({ ok: false, error: 'n/a' }),
    completeRun: async () => true,
    cancelRun: async () => ({ ok: true }),
    now: () => Date.now(),
  }
  const planner = new DeterministicTestPlanner()
  const log = () => {}

  await expectError(
    'assistant flag off',
    await handleAssistantChat(postReq({ teacher_id: TEACHER_ID, action: 'message', message: 'unpaid' }), {}, depsBase, planner, log),
    503,
  )
  await expectError(
    'assistant GET',
    await handleAssistantChat(
      new Request('https://contract.test/fn', { method: 'GET' }),
      { ASSISTANT_ENABLED: 'true' },
      depsBase,
      planner,
      log,
    ),
    405,
  )
  await expectError(
    'assistant no JWT',
    await handleAssistantChat(
      postReq({ teacher_id: TEACHER_ID, action: 'message', message: 'unpaid' }),
      { ASSISTANT_ENABLED: 'true' },
      { ...depsBase, getUserId: async () => null },
      planner,
      log,
    ),
    401,
  )
  await expectError(
    'assistant unknown action',
    await handleAssistantChat(
      postReq({ teacher_id: TEACHER_ID, action: 'bogus' }),
      { ASSISTANT_ENABLED: 'true' },
      depsBase,
      planner,
      log,
    ),
    400,
  )
  await expectError(
    'assistant stop without run_id',
    await handleAssistantChat(
      postReq({ teacher_id: TEACHER_ID, action: 'stop' }),
      { ASSISTANT_ENABLED: 'true' },
      depsBase,
      planner,
      log,
    ),
    400,
  )
  await expectOk(
    'assistant read answer',
    await handleAssistantChat(
      postReq({ teacher_id: TEACHER_ID, action: 'message', message: 'unpaid' }),
      { ASSISTANT_ENABLED: 'true' },
      depsBase,
      planner,
      log,
    ),
    (body) => {
      check('assistant read: status answered', body.status === 'answered')
      check('assistant read: tool unpaid_students', body.tool === 'unpaid_students')
      check('assistant read: run_id from audit write', body.run_id === 'run-1')
    },
  )
  // مهمة 22: مصفوفة الصلاحيات متاحة والمساعد مطفأ، بلا اعتماديات اختيارية
  await expectOk(
    'assistant permissions matrix while disabled',
    await handleAssistantChat(
      postReq({ teacher_id: TEACHER_ID, action: 'permissions' }),
      {},
      depsBase,
      planner,
      log,
    ),
    (body) => {
      check('permissions: status ok', body.status === 'ok')
      check(
        'permissions: matrix shape 5 reads / 3 confirm',
        Array.isArray(body.matrix?.reads) && body.matrix.reads.length === 5
          && Array.isArray(body.matrix?.confirm) && body.matrix.confirm.length === 3,
      )
      check(
        'permissions: confirm tools are the action tools only',
        body.matrix.confirm.map((e) => e.tool).join(',') === 'add_student,set_homework,generate_sessions',
      )
    },
  )
}

console.log(`\ncontract tests: ${checks - failures}/${checks} passed`)
if (failures > 0) {
  console.log(`FAILED: ${failures} contract check(s)`)
  process.exit(1)
}
