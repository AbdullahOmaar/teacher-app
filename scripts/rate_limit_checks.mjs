// ============================================================================
// فحوص حدود المعدّل والإساءة — فجوة 41 من تقييم الـ45 (Phase 2، المهمة 7)
// ----------------------------------------------------------------------------
// قاعدة الخطة: «توثيق الحدود كفحص — لا افتراض حدود Supabase الافتراضية».
// هذا الملف يثبّت كل حدّ موجود فعلاً في الكود/المهاجرات بطريقتين:
//  (أ) سلوكي: الحد الوحيد المُدار بكود دالة حدّية (إرسال واتساب التجريبي:
//      60 ثانية بين إرسالين لنفس السنتر) يُختبَر فعلياً على core.ts
//      الإنتاجي: أول إرسال يمرّ، الفوري بعده 429 بـ retry_after_seconds
//      داخل النافذة، وبعد انقضائها يمرّ من جديد.
//  (ب) أدلة ثابتة: حدود قاعدة البيانات (قفل حساب البوابة بعد 8 محاولات،
//      خنق بدء الامتحان، سقف الحجز العام اليومي، سقف إثباتات الدفع
//      المعلّقة) تُقرأ من ملفات المهاجرات نفسها — أي تعديل قادم يحذف
//      حارساً أو يغيّر قيمته يُسقِط هذا الفحص في CI بدل أن يمرّ صامتاً.
// حدود المنصة (Supabase Auth: معدّلات OTP/الإيميل) إعدادات لوحة تحكم
// لا تعيش في الريبو — موثقة في دراسة المهمة كحدّ منصّة لا كفحص كود،
// ولا يدّعي هذا الملف تغطيتها. الفجوات الصريحة تُطبع في النهاية.
//
// التشغيل: node scripts/rate_limit_checks.mjs  (npm run test:ratelimits)
// في CI: خطوة حاجبة داخل وظيفة check-and-test.
// ============================================================================
import { readFileSync } from 'node:fs'
import {
  TEST_MIN_INTERVAL_MS,
  handleSendWhatsappTest,
} from '../supabase/functions/send-whatsapp-test/core.ts'

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
const NOW = 1_800_000_000_000

function testReq() {
  return new Request('https://ratelimit.test/fn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teacher_id: TEACHER_ID }),
  })
}

function depsWithLastTest(lastTestAt) {
  return {
    getUserId: async () => USER_ID,
    loadOwnedTeacher: async () => ({ phone: '+201012345678' }),
    loadConfig: async () => ({
      enabled: true,
      phoneNumberId: '123456',
      tokenPresent: true,
      templateName: 'test_code',
      templateLang: 'ar',
      lastTestAt,
    }),
    getToken: async () => 'token',
    markTested: async () => {},
    fetchFn: async () =>
      new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.x' }] }), {
        status: 200,
      }),
    now: () => NOW,
    randomCode: () => '123456',
  }
}
const envOn = { WHATSAPP_OTP_ENABLED: 'true' }
const iso = (ms) => new Date(ms).toISOString()

// --- (أ) الحد السلوكي: إرسال واتساب التجريبي --------------------------------
console.log('rate limit (behavioral): send-whatsapp-test')
check(
  'documented interval constant is 60s',
  TEST_MIN_INTERVAL_MS === 60_000,
  `got ${TEST_MIN_INTERVAL_MS}`,
)
{
  const first = await handleSendWhatsappTest(testReq(), envOn, depsWithLastTest(null))
  check('first send (no prior stamp) passes', first.status === 200, `got ${first.status}`)

  const immediate = await handleSendWhatsappTest(testReq(), envOn, depsWithLastTest(iso(NOW)))
  check('immediate second send is 429', immediate.status === 429, `got ${immediate.status}`)
  const body = await immediate.json()
  const retry = body?.error?.retry_after_seconds
  check(
    '429 carries retry_after_seconds within (0, 60]',
    typeof retry === 'number' && retry > 0 && retry <= 60,
    `got ${retry}`,
  )

  const nearEdge = await handleSendWhatsappTest(testReq(), envOn, depsWithLastTest(iso(NOW - 59_500)))
  const nearBody = await nearEdge.json()
  check(
    'at 59.5s elapsed still 429 with retry_after_seconds === 1',
    nearEdge.status === 429 && nearBody?.error?.retry_after_seconds === 1,
    `got ${nearEdge.status}/${nearBody?.error?.retry_after_seconds}`,
  )

  const afterWindow = await handleSendWhatsappTest(testReq(), envOn, depsWithLastTest(iso(NOW - 61_000)))
  check('after the 60s window the send passes again', afterWindow.status === 200, `got ${afterWindow.status}`)
}

// --- (ب) أدلة الحدود في المهاجرات --------------------------------------------
console.log('rate limit (static evidence): database guards in migrations')
const mig = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')

const portalRpcs = mig('0041_portal_login_rpcs.sql')
check(
  'portal login: lockout threshold is 8 failed attempts',
  portalRpcs.includes('failed_attempts + 1 >= 8'),
)
check(
  'portal login: lockout duration is 15 minutes',
  portalRpcs.includes("now() + interval '15 minutes'"),
)
const portalSchema = mig('0040_portal_accounts.sql')
check(
  'portal accounts schema carries failed_attempts + locked_until',
  portalSchema.includes('failed_attempts') && portalSchema.includes('locked_until'),
)

const examThrottle = mig('0024_exam_throttle_enrol_cap_token_expiry.sql')
check(
  'exam start: throttle table exam_start_throttle exists',
  examThrottle.includes('create table if not exists public.exam_start_throttle'),
)
check(
  'public booking: per-centre daily cap is 150 rows/day',
  examThrottle.includes('if v_recent_teacher >= 150 then'),
)

const proofs = mig('0005_payment_proofs.sql')
check(
  "payment proofs: pending cap raises 'too many pending proofs'",
  proofs.includes("raise exception 'too many pending proofs'"),
)

// --- فجوات صريحة (توثيق لا فشل) ----------------------------------------------
console.log('documented gaps (not failures — see docs/PHASE2-T7-HARDENING.md):')
console.log('  NOTE  send-whatsapp-message: no per-centre send quota in code;')
console.log('        abuse surface is owner-JWT + teacher-owned Meta token/cost.')
console.log('  NOTE  assistant-chat: no per-centre request quota in code;')
console.log('        surface is member-JWT + permission gates + platform flag.')
console.log('  NOTE  Supabase Auth OTP/email rates are dashboard config, not repo')
console.log('        code — documented as platform limits in the study, not')
console.log('        asserted here (the plan forbids assuming them as checks).')

console.log(`\nrate limit checks: ${checks - failures}/${checks} passed`)
if (failures > 0) {
  console.log(`FAILED: ${failures} rate-limit check(s)`)
  process.exit(1)
}
