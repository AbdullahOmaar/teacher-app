// محاكاة محلية كاملة لدالة send-whatsapp-recovery (3A-927) — نفس
// أسلوب simulate-whatsapp-otp.mjs: مخزن ذاكرة بعقد الإنتاج وGraph
// وهمي يلتقط الحمولات، فتُفحص الدورة كلها بلا شبكة ولا مفاتيح:
//   طلب (رقم معروف/مجهول) → إرسال قالب المنصة → تحقق → تعيين سر
//   → استهلاك، مع حدود المعدل والانتهاء وسقف المحاولات وحياد الرد.
// التشغيل: node scripts/simulate-whatsapp-recovery.mjs
import { createHash } from 'node:crypto'
import {
  handleSendWhatsappRecovery,
  CODE_TTL_MS,
} from '../supabase/functions/send-whatsapp-recovery/core.ts'

let failures = 0
function assert(cond, label, extra = '') {
  if (cond) console.log(`  ✓ ${label}`)
  else {
    failures++
    console.log(`  ✗ ${label} ${extra}`)
  }
}

const USER_ID = '11111111-1111-4111-8111-111111111111'
const PHONE = '+201012345678'
let clock = Date.now()
const graphCalls = []
let graphOk = true

const graphFetch = async (url, init) => {
  graphCalls.push({ url, body: JSON.parse(init.body) })
  if (!graphOk) {
    return new Response(JSON.stringify({ error: { code: 190 } }), { status: 400 })
  }
  return new Response(
    JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.sim' }] }),
    { status: 200 },
  )
}

const codes = []
let seq = 0
const passwords = new Map()
const store = {
  async findUserIdByPhone(phone) {
    return phone === PHONE ? USER_ID : null
  },
  async listRecentCodeTimes(phone, sinceMs) {
    return codes
      .filter((c) => c.phone === phone && c.createdMs >= sinceMs)
      .map((c) => c.createdMs)
  },
  async invalidateActiveCodes(phone) {
    for (const c of codes) if (c.phone === phone && c.consumedMs === null) c.consumedMs = clock
  },
  async insertCode(phone, codeHash, expiresAtMs) {
    codes.push({
      id: `sim-${++seq}`,
      phone,
      codeHash,
      expiresAtMs,
      attempts: 0,
      consumedMs: null,
      createdMs: expiresAtMs - CODE_TTL_MS,
    })
  },
  async getActiveCode(phone) {
    const active = codes.filter((c) => c.phone === phone && c.consumedMs === null)
    const row = active[active.length - 1]
    return row
      ? { id: row.id, codeHash: row.codeHash, expiresAtMs: row.expiresAtMs, attempts: row.attempts }
      : null
  },
  async incrementAttempts(id) {
    const row = codes.find((c) => c.id === id)
    row.attempts += 1
    return row.attempts
  },
  async consumeCode(id) {
    const row = codes.find((c) => c.id === id)
    if (row && row.consumedMs === null) row.consumedMs = clock
  },
  async updateUserPassword(userId, newPassword) {
    passwords.set(userId, newPassword)
  },
}

const envOn = {
  WHATSAPP_RECOVERY_ENABLED: 'true',
  WHATSAPP_ACCESS_TOKEN: 'sim-platform-token',
  WHATSAPP_PHONE_NUMBER_ID: '100200300',
}
const call = (body, env = envOn) =>
  handleSendWhatsappRecovery(
    new Request('https://sim.test/send-whatsapp-recovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
    graphFetch,
    (m) => console.log(`    [log] ${m}`),
    store,
    () => clock,
  )
const sentCode = () =>
  graphCalls[graphCalls.length - 1].body.template.components[0].parameters[0].text
const sha256 = (s) => createHash('sha256').update(s).digest('hex')

console.log('— Kill switch مقفل: 503 مصمم، لا لمس للمخزن')
{
  const res = await call(
    { action: 'request', phone: PHONE },
    { ...envOn, WHATSAPP_RECOVERY_ENABLED: 'false' },
  )
  assert(res.status === 503, 'يرفض بـ503')
  assert(codes.length === 0 && graphCalls.length === 0, 'لا تخزين ولا إرسال')
}

console.log('— رقم غير مربوط: رد محايد 200 بلا إرسال (منع التعداد)')
{
  const res = await call({ action: 'request', phone: '+201155555555' })
  assert(res.status === 200, 'يرد 200')
  assert(graphCalls.length === 0, 'Graph لم يُستدعَ')
}

console.log('— دورة كاملة: طلب → قالب منصة → تحقق → تعيين سر')
{
  const res = await call({ action: 'request', phone: PHONE })
  assert(res.status === 200, 'الطلب ينجح')
  const body = graphCalls[0].body
  assert(body.messaging_product === 'whatsapp', 'حمولة واتساب صحيحة')
  assert(body.to === '201012345678', 'المستلم بلا +')
  assert(body.template.name === 'otp_code', 'القالب الافتراضي otp_code')
  const code = sentCode()
  assert(/^\d{6}$/.test(code), 'الكود 6 أرقام', code)
  assert(codes[0].codeHash === sha256(code), 'المخزّن تجزئة SHA-256 فقط')
  assert(codes[0].codeHash !== code, 'لا نص صريح في المخزن')

  const again = await call({ action: 'request', phone: PHONE })
  assert(again.status === 429, 'إعادة فورية تُرفض 429 (فاصل 60 ث)')

  const wrong = code === '000000' ? '000001' : '000000'
  const bad = await call({ action: 'verify', phone: PHONE, code: wrong, new_password: 'NewPass123' })
  assert(bad.status === 400, 'كود خاطئ 400 عام')
  assert(codes[0].attempts === 1, 'المحاولة تُعدّ ذرّياً')

  const ok = await call({ action: 'verify', phone: PHONE, code, new_password: 'NewPass123' })
  assert(ok.status === 200, 'التحقق الصحيح ينجح')
  assert(passwords.get(USER_ID) === 'NewPass123', 'السر عُيّن لصاحب الرقم')
  assert(codes[0].consumedMs !== null, 'الكود استُهلك')

  const replay = await call({ action: 'verify', phone: PHONE, code, new_password: 'OtherPass1' })
  assert(replay.status === 400, 'إعادة التشغيل تُرفض')
}

console.log('— انتهاء الصلاحية + سقف المحاولات')
{
  clock += 61_000
  await call({ action: 'request', phone: PHONE })
  const code = sentCode()
  clock += CODE_TTL_MS + 1_000
  const expired = await call({ action: 'verify', phone: PHONE, code, new_password: 'NewPass123' })
  assert(expired.status === 400, 'كود منتهٍ يُرفض 400')

  clock += 61_000
  await call({ action: 'request', phone: PHONE })
  const code3 = sentCode()
  const wrong = code3 === '000000' ? '000001' : '000000'
  for (let i = 0; i < 5; i++) {
    await call({ action: 'verify', phone: PHONE, code: wrong, new_password: 'NewPass123' })
  }
  const capped = codes[codes.length - 1]
  assert(capped.attempts === 5 && capped.consumedMs !== null, 'عند 5 محاولات يُبطل الكود')
  const afterCap = await call({ action: 'verify', phone: PHONE, code: code3, new_password: 'NewPass123' })
  assert(afterCap.status === 400, 'الصحيح بعد السقف يُرفض')
}

console.log('— فشل Graph: 502 + إبطال الكود المخزّن')
{
  // قفز فوق نافذة حد الساعة (3 رموز/ساعة) وإلا رُفض الطلب 429 بحق
  clock += 3_700_000
  graphOk = false
  const res = await call({ action: 'request', phone: PHONE })
  graphOk = true
  assert(res.status === 502, 'فشل الإرسال 502')
  assert(codes[codes.length - 1].consumedMs !== null, 'لا كود حي خلف إرسال فاشل')
}

console.log(failures === 0 ? '\nالمحاكاة: كل الفحوص خضراء ✓' : `\nالمحاكاة: ${failures} فشل ✗`)
process.exit(failures === 0 ? 0 : 1)
