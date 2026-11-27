// ============================================================================
// حقن الأعطال واختبارات المرونة — فجوة 44 من تقييم الـ45 (Phase 2، مهمة 7)
// ----------------------------------------------------------------------------
// سيناريوهات فشل محكومة على نفس core.ts الإنتاجي، في بيئة اختبار فقط:
// المزوّد (Meta Graph) يسقط شبكياً/يرفض بـ500/تنقطع مهلة ندائه، وكتابات
// قاعدة البيانات (سجل الرسائل/قيد تدقيق المساعد) تفشل. المطلوب إثباته:
//  ١) تدهور رشيق: أكواد خطأ موثقة (502/500) بمغلف الخطأ الموحد — لا
//     انهيار، لا نجاح مزيّف، لا إرسال بلا أثر قابل للمتابعة.
//  ٢) السجل يُختم «failed» بسبب واضح عند فشل الإرسال، وختم حدّ المعدل
//     (markTested) لا يحدث إلا بعد نجاح فعلي.
//  ٣) إجابة المساعد تُحجَب كلياً عند فشل قيد التدقيق (لا إجابة بلا أثر)،
//     وفشل جلب البيانات يظهر كخطأ صريح لا كإجابة فارغة مزيّفة.
//  ٤) أحداث Webhook لمعرّفات رسائل غير معروفة لا تُسقط المعالج (200).
// ملحوظة صادقة: الأنوية لا تفرض مهلة نداء خاصة بها على fetch — تعتمد
// على مهلات المنصة (Deno/المتصفح)؛ سيناريو «المهلة» هنا يُحاكى برفض
// AbortError وهو نفس مسار خطأ الشبكة في الكود.
//
// التشغيل: node scripts/fault_injection.mjs  (npm run test:faults)
// في CI: خطوة حاجبة داخل وظيفة check-and-test.
// ============================================================================
import { handleSendWhatsappMessage } from '../supabase/functions/send-whatsapp-message/core.ts'
import { handleSendWhatsappTest } from '../supabase/functions/send-whatsapp-test/core.ts'
import { handleWhatsappWebhook } from '../supabase/functions/whatsapp-webhook/core.ts'
import {
  DeterministicTestPlanner,
  handleAssistantChat,
} from '../supabase/functions/assistant-chat/core.ts'
import { createHmac } from 'node:crypto'

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
function postReq(body) {
  return new Request('https://fault.test/fn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
async function expectFault(label, res, status) {
  check(`${label}: status ${status}`, res.status === status, `got ${res.status}`)
  const body = await res.json().catch(() => null)
  check(
    `${label}: unified error envelope`,
    body?.error?.http_code === status && typeof body?.error?.message === 'string',
    JSON.stringify(body).slice(0, 160),
  )
}

// --- send-whatsapp-message: المزوّد يسقط بكل الطرق ----------------------------
console.log('fault injection: send-whatsapp-message provider failures')
{
  const updates = []
  let fetchCalls = 0
  const depsBase = {
    getUserId: async () => USER_ID,
    isOwner: async () => true,
    loadConfig: async () => ({ enabled: true, phoneNumberId: '123456', tokenPresent: true }),
    loadTemplate: async () => ({ status: 'ready', templateName: 'arrival_notice_v1' }),
    getToken: async () => 'token',
    // حد رسائل الشهر (0062 — الخطوة 5): null = نظام الحدود غائب (قبل
    // تطبيق المهاجرة) فيُسمح — نفس دلالة الإنتاج (index.ts)؛ بدونه
    // ينهار السيناريو عند البوابة قبل أن يصل لعطل المزوّد المُحاكى.
    checkMessageLimit: async () => null,
    insertLog: async () => 'log-1',
    updateLog: async (id, patch) => {
      updates.push(patch)
    },
    now: () => Date.now(),
  }
  const envOn = { WHATSAPP_MESSAGING_ENABLED: 'true' }
  const body = {
    teacher_id: TEACHER_ID,
    kind: 'arrival_notice',
    to: '+201012345678',
    params: ['أحمد', 'السنتر'],
  }
  const abortError = () => {
    const e = new Error('The operation was aborted')
    e.name = 'AbortError'
    throw e
  }

  updates.length = 0
  await expectFault(
    'message graph network down',
    await handleSendWhatsappMessage(postReq(body), envOn, {
      ...depsBase,
      fetchFn: async () => {
        fetchCalls++
        throw new Error('ECONNRESET')
      },
    }),
    502,
  )
  check(
    'message graph network down: log stamped failed/network error',
    updates.length === 1 && updates[0].status === 'failed' && updates[0].errorMessage === 'network error',
    JSON.stringify(updates),
  )

  await expectFault(
    'message graph timeout (AbortError)',
    await handleSendWhatsappMessage(postReq(body), envOn, { ...depsBase, fetchFn: async () => abortError() }),
    502,
  )

  updates.length = 0
  const res500 = await handleSendWhatsappMessage(postReq(body), envOn, {
    ...depsBase,
    fetchFn: async () =>
      new Response(JSON.stringify({ error: { code: 131030, message: 'recipient not allowed' } }), {
        status: 500,
      }),
  })
  await expectFault('message graph HTTP 500', res500.clone(), 502)
  const body500 = await res500.json().catch(() => null)
  check(
    'message graph HTTP 500: graph_status surfaced in envelope',
    body500?.error?.graph_status === 500,
    JSON.stringify(body500).slice(0, 160),
  )
  check(
    'message graph HTTP 500: log stamped failed with provider code',
    updates.length === 1 && updates[0].status === 'failed' && updates[0].errorCode === 131030,
    JSON.stringify(updates),
  )

  fetchCalls = 0
  await expectFault(
    'message log write fails first',
    await handleSendWhatsappMessage(postReq(body), envOn, {
      ...depsBase,
      insertLog: async () => null,
      fetchFn: async () => {
        fetchCalls++
        return new Response('{}', { status: 200 })
      },
    }),
    500,
  )
  check('message log write fails: provider never called (no send without audit trail)', fetchCalls === 0)
}

// --- send-whatsapp-test: فشل المزوّد لا يختم حدّ المعدل ------------------------
console.log('fault injection: send-whatsapp-test provider failures')
{
  let marked = 0
  const depsBase = {
    getUserId: async () => USER_ID,
    loadOwnedTeacher: async () => ({ phone: '+201012345678' }),
    loadConfig: async () => ({
      enabled: true,
      phoneNumberId: '123456',
      tokenPresent: true,
      templateName: 'test_code',
      templateLang: 'ar',
      lastTestAt: null,
    }),
    getToken: async () => 'token',
    markTested: async () => {
      marked++
    },
    now: () => Date.now(),
    randomCode: () => '123456',
  }
  const envOn = { WHATSAPP_OTP_ENABLED: 'true' }
  const req = () => postReq({ teacher_id: TEACHER_ID })

  await expectFault(
    'test graph network down',
    await handleSendWhatsappTest(req(), envOn, {
      ...depsBase,
      fetchFn: async () => {
        throw new Error('ENOTFOUND')
      },
    }),
    502,
  )
  check('test graph network down: rate-limit stamp NOT written', marked === 0)

  await expectFault(
    'test graph HTTP 500',
    await handleSendWhatsappTest(req(), envOn, {
      ...depsBase,
      fetchFn: async () => new Response(JSON.stringify({ error: { code: 190 } }), { status: 500 }),
    }),
    502,
  )
  check('test graph HTTP 500: rate-limit stamp still NOT written', marked === 0)
}

// --- assistant-chat: فشل التدقيق يحجب الإجابة، وفشل الجلب خطأ صريح -------------
console.log('fault injection: assistant-chat dependency failures')
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
  const envOn = { ASSISTANT_ENABLED: 'true' }
  const planner = new DeterministicTestPlanner()
  const log = () => {}
  const msg = () => postReq({ teacher_id: TEACHER_ID, action: 'message', message: 'unpaid' })

  await expectFault(
    'assistant audit write fails',
    await handleAssistantChat(msg(), envOn, { ...depsBase, beginRead: async () => null }, planner, log),
    500,
  )

  let threw = false
  try {
    await handleAssistantChat(
      msg(),
      envOn,
      {
        ...depsBase,
        fetchBalances: async () => {
          throw new Error('db unreachable')
        },
      },
      planner,
      log,
    )
  } catch {
    threw = true
  }
  check('assistant data fetch fails: explicit throw (no fake empty answer)', threw)
}

// --- whatsapp-webhook: أحداث لمعرّفات غير معروفة لا تُسقط المعالج --------------
console.log('fault injection: whatsapp-webhook unknown message ids')
{
  const env = { WHATSAPP_APP_SECRET: 'fault-secret', WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'tok' }
  const deps = { updateStatusByMetaId: async () => false }
  const eventBody = JSON.stringify({
    entry: [
      {
        changes: [
          { value: { statuses: [{ id: 'wamid.unknown', status: 'read', timestamp: '1700000000' }] } },
        ],
      },
    ],
  })
  const sig = 'sha256=' + createHmac('sha256', env.WHATSAPP_APP_SECRET).update(eventBody).digest('hex')
  const res = await handleWhatsappWebhook(
    new Request('https://fault.test/fn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig },
      body: eventBody,
    }),
    env,
    deps,
  )
  check('webhook unknown id: status 200', res.status === 200, `got ${res.status}`)
  const body = await res.json()
  check('webhook unknown id: {ok:true, updated:0}', body.ok === true && body.updated === 0)
}

console.log(`\nfault injection: ${checks - failures}/${checks} passed`)
if (failures > 0) {
  console.log(`FAILED: ${failures} fault-injection check(s)`)
  process.exit(1)
}
