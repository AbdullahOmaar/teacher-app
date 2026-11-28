// ============================================================================
// تطبيق المدرس — Edge Function: send-whatsapp-recovery (3A-927)
// ----------------------------------------------------------------------------
// هذا الملف هو المنطق النقي للدالة: بلا أي اعتماديات خاصة بـ Deno حتى
// يمكن محاكاته محلياً بالكامل (scripts/simulate-whatsapp-recovery.mjs)
// بنفس الكود الذي يعمل في الإنتاج حرفياً. مدخل Deno في index.ts يمرّر
// Deno.env وfetch العامة ومخزن Supabase (service role) إلى
// handleSendWhatsappRecovery هنا.
//
// الدور: استرداد كلمة السر برمز واتساب على **قناة المنصة** — قرار
// المدير الحاكم (2026-11-27): المستخدم المقفول بره حسابه قد لا تملك
// قناة مدرّسه (0026) وجوداً أو عملاً، فالإرسال يتم من رقم المنصة
// بأصول Meta في أسرار المشروع (نفس أسماء مسار env في
// send-whatsapp-otp)، لا بحلّ قناة لكل مدرس. التصميم الكامل:
// docs/WHATSAPP-RECOVERY.md
//
// لماذا لا نركب على GoTrue؟ لا يوجد resetPasswordForPhone في
// Supabase Auth — الاسترداد الأصلي إيميل فقط. فهذه الدالة تدير دورة
// الكود بنفسها بمعايير البيت: الكود يُخزَّن مجزّأً SHA-256 فقط
// (0076)، صلاحية 10 دقائق، سقف محاولات 5، حدود معدل للرقم (60 ثانية
// بين الطلبات + 3 طلبات/ساعة)، استهلاك فوري عند النجاح أو الاستنفاد
// أو فشل الإرسال، وردود محايدة لا تكشف تسجيل الرقم من عدمه. تعيين
// كلمة السر يتم عبر Admin API في نفس طلب التحقق الناجح — لا جلسة
// وسيطة ولا توكن استرداد يخرج للعميل أبداً.
//
// البوابات بالترتيب:
// ١) Kill switch المنصة: ‏WHATSAPP_RECOVERY_ENABLED=true — غير ذلك
//    503 مضبوط بلا أي عمل أو تكلفة (التفعيل إعدادات فقط لاحقاً).
// ٢) تحقق المدخلات (هاتف مصري E.164 / كود 6 أرقام / كلمة سر ≥ 8).
// ٣) حدود المعدل والمحاولات قبل أي إرسال أو تعيين.
// الكود لا يُسجَّل في أي مكان (ولا حتى في الـ logs) — الرقم مموّه.
// ============================================================================

export interface WhatsappRecoveryEnv {
  WHATSAPP_RECOVERY_ENABLED?: string
  WHATSAPP_RECOVERY_MOCK?: string
  WHATSAPP_ACCESS_TOKEN?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_RECOVERY_TEMPLATE_NAME?: string
  WHATSAPP_OTP_TEMPLATE_NAME?: string
  WHATSAPP_OTP_TEMPLATE_LANG?: string
  WHATSAPP_GRAPH_VERSION?: string
  WHATSAPP_GRAPH_BASE_URL?: string
}

/** كود استرداد نشط كما يقرأه المخزن (بلا الكود الصريح — مجزّأ فقط) */
export interface ActiveRecoveryCode {
  id: string
  codeHash: string
  expiresAtMs: number
  attempts: number
}

/**
 * مخزن الاسترداد: كل وصول للقاعدة/الهوية خلف هذا العقد — في الإنتاج
 * يركب على Supabase بالـ service role (index.ts)، وفي المحاكاة ذاكرة
 * محلية بنفس العقد. الدالة لا تعرف Supabase أبداً.
 */
export interface RecoveryStore {
  /** معرّف مستخدم Auth برقمه (E.164) أو null إن لم يكن مربوطاً بحساب */
  findUserIdByPhone(phone: string): Promise<string | null>
  /** أوقات إنشاء أكواد هذا الرقم منذ لحظة معينة (نافذة حد المعدل) */
  listRecentCodeTimes(phone: string, sinceMs: number): Promise<number[]>
  /** إبطال كل أكواد الرقم غير المستهلكة (كود جديد يلغي ما قبله) */
  invalidateActiveCodes(phone: string): Promise<void>
  insertCode(phone: string, codeHash: string, expiresAtMs: number): Promise<void>
  /** أحدث كود غير مستهلك للرقم (قد يكون منتهياً — الفحص هنا) */
  getActiveCode(phone: string): Promise<ActiveRecoveryCode | null>
  /** زيادة ذرّية لعدّاد المحاولات — تعيد القيمة الجديدة */
  incrementAttempts(id: string): Promise<number>
  consumeCode(id: string): Promise<void>
  /** تعيين كلمة السر عبر Admin API — ترمي عند الفشل */
  updateUserPassword(userId: string, newPassword: string): Promise<void>
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

const DEFAULT_GRAPH_BASE = 'https://graph.facebook.com'
const DEFAULT_GRAPH_VERSION = 'v23.0'
const DEFAULT_TEMPLATE_NAME = 'otp_code'
const DEFAULT_TEMPLATE_LANG = 'ar'

/** صلاحية الكود: 10 دقائق (تطابق وعد واجهة الدخول بالهاتف) */
export const CODE_TTL_MS = 10 * 60_000
/** حد أدنى بين طلبي كود لنفس الرقم */
export const RESEND_INTERVAL_MS = 60_000
/** سقف أكواد الرقم في الساعة (إرسال فعلي أو محايد — العدّ على الإنشاء) */
export const MAX_CODES_PER_HOUR = 3
/** سقف محاولات التحقق الخاطئة قبل إبطال الكود */
export const MAX_VERIFY_ATTEMPTS = 5
/** حد كلمة السر الأدنى — يطابق قاعدة العميل في صفحات المصادقة */
export const MIN_PASSWORD_LENGTH = 8

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function jsonOk(body: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** مقارنة ثابتة الزمن لنصين (تجنّب تسريب التجزئة بالتوقيت) */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** رقم واتساب في حقل to: أرقام فقط بلا + (E.164 بلا علامة) */
export function toWhatsappRecipient(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** إخفاء الرقم في السجلات: كل شيء عدا آخر رقمين */
export function maskPhone(phone: string): string {
  const digits = toWhatsappRecipient(phone)
  if (digits.length <= 2) return '**'
  return '*'.repeat(digits.length - 2) + digits.slice(-2)
}

/**
 * تطبيع/تحقق هاتف مصري خادمياً (مرآة lib/phone.ts): يقبل الصيغ
 * الشائعة ويعيد E.164 ‎(+20…)‎ أو null. الخادم لا يثق بتطبيع العميل.
 */
export function normalizeEgyptianPhoneServer(raw: string): string | null {
  let digits = raw.replace(/[\s\-()]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  if (!/^\d+$/.test(digits)) return null

  let national: string
  if (digits.startsWith('0020')) national = digits.slice(4)
  else if (digits.startsWith('20') && digits.length === 12) national = digits.slice(2)
  else if (digits.startsWith('0') && digits.length === 11) national = digits.slice(1)
  else if (digits.length === 10) national = digits
  else return null

  if (!/^1[0125]\d{8}$/.test(national)) return null
  return `+20${national}`
}

/** تجزئة SHA-256 سداسية لكود — التخزين والتحقق بها فقط */
export async function hashRecoveryCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** توليد كود من 6 أرقام بعشوائية مشفّرة */
export function generateRecoveryCode(): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return String(buf[0] % 1_000_000).padStart(6, '0')
}

/**
 * حمولة Graph API لإرسال قالب Authentication — نفس مفارقة
 * send-whatsapp-otp الموثّقة: الكود يُمرَّر مرتين (معامل جسم ومعامل
 * زر sub_type 'url' index '0') وإلا فشل الإرسال عند Meta.
 */
export function buildRecoveryTemplatePayload(
  phone: string,
  code: string,
  templateName: string,
  templateLang: string,
): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toWhatsappRecipient(phone),
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLang },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: code }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: code }],
        },
      ],
    },
  }
}

interface RecoveryRequestBody {
  action?: string
  phone?: string
  code?: string
  new_password?: string
}

async function handleRequestCode(
  phone: string,
  env: WhatsappRecoveryEnv,
  fetchFn: FetchFn,
  log: (msg: string) => void,
  store: RecoveryStore,
  now: number,
): Promise<Response> {
  // حدود المعدل أولاً: 60 ثانية بين الطلبات و3 أكواد/ساعة للرقم —
  // العدّ على الإنشاء الفعلي فلا تُستنزف الحصة بطلبات مرفوضة
  let recent: number[]
  try {
    recent = await store.listRecentCodeTimes(phone, now - 3_600_000)
  } catch {
    log(`send-whatsapp-recovery: store read failed (phone ${maskPhone(phone)})`)
    return jsonError(502, 'whatsapp recovery unavailable')
  }
  if (recent.some((t) => now - t < RESEND_INTERVAL_MS)) {
    log(`send-whatsapp-recovery: resend too soon (phone ${maskPhone(phone)})`)
    return jsonError(429, 'recovery code requested too soon')
  }
  if (recent.length >= MAX_CODES_PER_HOUR) {
    log(`send-whatsapp-recovery: hourly cap reached (phone ${maskPhone(phone)})`)
    return jsonError(429, 'too many recovery codes requested')
  }

  // الرقم غير المربوط بحساب: رد محايد 200 بلا تخزين ولا إرسال —
  // الرد لا يفرّق بين «مسجل» و«غير مسجل» (منع تعداد الحسابات)
  let userId: string | null
  try {
    userId = await store.findUserIdByPhone(phone)
  } catch {
    log(`send-whatsapp-recovery: user lookup failed (phone ${maskPhone(phone)})`)
    return jsonError(502, 'whatsapp recovery unavailable')
  }
  if (!userId) {
    log(`send-whatsapp-recovery: neutral accept, phone not linked (phone ${maskPhone(phone)})`)
    return jsonOk()
  }

  // أصول قناة المنصة: ناقصة = خطأ إعداد صريح قبل أي تخزين/إرسال
  // (وضع المحاكاة وحده يتخطى الاعتمادات — اختبار محلي فقط)
  const mock = env.WHATSAPP_RECOVERY_MOCK === 'true'
  const token = env.WHATSAPP_ACCESS_TOKEN ?? ''
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID ?? ''
  if (!mock && (!token || !phoneNumberId)) {
    log('send-whatsapp-recovery: platform Meta credentials incomplete — refusing')
    return jsonError(500, 'whatsapp credentials not configured')
  }

  const code = generateRecoveryCode()
  const codeHash = await hashRecoveryCode(code)
  try {
    await store.invalidateActiveCodes(phone)
    await store.insertCode(phone, codeHash, now + CODE_TTL_MS)
  } catch {
    log(`send-whatsapp-recovery: code store failed (phone ${maskPhone(phone)})`)
    return jsonError(502, 'whatsapp recovery unavailable')
  }

  if (mock) {
    log(`send-whatsapp-recovery: MOCK send accepted (phone ${maskPhone(phone)})`)
    return jsonOk()
  }

  const templateName =
    env.WHATSAPP_RECOVERY_TEMPLATE_NAME ?? env.WHATSAPP_OTP_TEMPLATE_NAME ?? DEFAULT_TEMPLATE_NAME
  const templateLang = env.WHATSAPP_OTP_TEMPLATE_LANG ?? DEFAULT_TEMPLATE_LANG
  const base = (env.WHATSAPP_GRAPH_BASE_URL ?? DEFAULT_GRAPH_BASE).replace(/\/$/, '')
  const version = env.WHATSAPP_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION
  const url = `${base}/${version}/${phoneNumberId}/messages`
  const body = buildRecoveryTemplatePayload(phone, code, templateName, templateLang)

  // مصير صريح لفشل الإرسال: الكود المخزّن يُبطَل فوراً (لا كود حي
  // لم يصل صاحبه أبداً) والرد 502 يوجّه العميل لإعادة المحاولة
  const voidStoredCode = async () => {
    try {
      await store.invalidateActiveCodes(phone)
    } catch {
      log(`send-whatsapp-recovery: void after send failure also failed (phone ${maskPhone(phone)})`)
    }
  }

  let graphRes: Response
  try {
    graphRes = await fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    await voidStoredCode()
    log(`send-whatsapp-recovery: graph network error (phone ${maskPhone(phone)})`)
    return jsonError(502, 'whatsapp send failed')
  }

  if (!graphRes.ok) {
    await voidStoredCode()
    let graphCode = ''
    try {
      const errJson = (await graphRes.json()) as { error?: { code?: number } }
      graphCode = errJson.error?.code ? ` code=${errJson.error.code}` : ''
    } catch {
      graphCode = ''
    }
    log(
      `send-whatsapp-recovery: graph rejected status=${graphRes.status}${graphCode} (phone ${maskPhone(phone)})`,
    )
    return jsonError(502, 'whatsapp send failed')
  }

  log(`send-whatsapp-recovery: delivered (phone ${maskPhone(phone)})`)
  return jsonOk()
}

async function handleVerifyCode(
  phone: string,
  rawCode: string,
  newPassword: string,
  log: (msg: string) => void,
  store: RecoveryStore,
  now: number,
): Promise<Response> {
  // رسالة فشل واحدة لكل مسارات التحقق (خطأ/منتهٍ/مستنفد/غير موجود):
  // لا أوراكل يفرّق بين «الكود غلط» و«لا كود أصلاً»
  const invalid = () => jsonError(400, 'invalid or expired recovery code')

  if (!/^\d{6}$/.test(rawCode)) return invalid()
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return jsonError(400, 'password too short')
  }

  let active: ActiveRecoveryCode | null
  try {
    active = await store.getActiveCode(phone)
  } catch {
    log(`send-whatsapp-recovery: store read failed on verify (phone ${maskPhone(phone)})`)
    return jsonError(502, 'whatsapp recovery unavailable')
  }
  if (!active) return invalid()

  if (active.expiresAtMs <= now || active.attempts >= MAX_VERIFY_ATTEMPTS) {
    try {
      await store.consumeCode(active.id)
    } catch {
      // الاستهلاك التنظيفي فشل — الكود منتهٍ/مستنفد أصلاً فالرفض قائم
      log(`send-whatsapp-recovery: cleanup consume failed (phone ${maskPhone(phone)})`)
    }
    return invalid()
  }

  const candidateHash = await hashRecoveryCode(rawCode)
  if (!timingSafeEqual(candidateHash, active.codeHash)) {
    try {
      const attempts = await store.incrementAttempts(active.id)
      if (attempts >= MAX_VERIFY_ATTEMPTS) await store.consumeCode(active.id)
    } catch {
      // فشل العدّ لا يفتح الباب: الرد رفض أصلاً، والسقف يُفرض عند
      // القراءة التالية بقيمة attempts المحفوظة
      log(`send-whatsapp-recovery: attempt counting failed (phone ${maskPhone(phone)})`)
    }
    log(`send-whatsapp-recovery: wrong code (phone ${maskPhone(phone)})`)
    return invalid()
  }

  // الكود صحيح: الهوية تُعاد قراءتها الآن (الحساب قد يُحذف بين
  // الطلب والتحقق) ثم يُعيَّن السر عبر Admin API
  let userId: string | null
  try {
    userId = await store.findUserIdByPhone(phone)
  } catch {
    log(`send-whatsapp-recovery: user lookup failed on verify (phone ${maskPhone(phone)})`)
    return jsonError(502, 'whatsapp recovery unavailable')
  }
  if (!userId) {
    try {
      await store.consumeCode(active.id)
    } catch {
      log(`send-whatsapp-recovery: consume after vanished user failed (phone ${maskPhone(phone)})`)
    }
    return invalid()
  }

  try {
    await store.updateUserPassword(userId, newPassword)
  } catch {
    // فشل التعيين ليس محاولة تخمين: الكود يبقى حياً لصلاحيته ليكمل
    // المستخدم المحاولة، والرد 502 صريح بلا استهلاك
    log(`send-whatsapp-recovery: password update failed (phone ${maskPhone(phone)})`)
    return jsonError(502, 'password update failed')
  }

  try {
    await store.consumeCode(active.id)
  } catch {
    // كلمة السر تغيّرت فعلياً — فشل الاستهلاك لا يُفشل العملية،
    // لكنه يُسجَّل: الكود يبقى صالحاً شكلياً حتى انتهاء صلاحيته
    log(`send-whatsapp-recovery: consume after success failed (phone ${maskPhone(phone)})`)
  }
  log(`send-whatsapp-recovery: password reset completed (phone ${maskPhone(phone)})`)
  return jsonOk({ status: 'ok' })
}

/**
 * معالج طلبات الاسترداد. يُستدعى من مدخل Deno (index.ts) في الإنتاج
 * ومن المحاكاة/العقود محلياً بنفس الشكل. الساعة قابلة للحقن لثبات
 * الاختبارات (الافتراضي ساعة النظام).
 */
export async function handleSendWhatsappRecovery(
  req: Request,
  env: WhatsappRecoveryEnv,
  fetchFn: FetchFn,
  log: (msg: string) => void = () => {},
  store: RecoveryStore,
  now: () => number = () => Date.now(),
): Promise<Response> {
  if (req.method !== 'POST') return jsonError(405, 'method not allowed')

  let payload: RecoveryRequestBody
  try {
    payload = (await req.json()) as RecoveryRequestBody
  } catch {
    return jsonError(400, 'invalid json')
  }

  // Kill switch المنصة: فوق الكل — لا قراءة مخزن ولا إرسال قبله
  if (env.WHATSAPP_RECOVERY_ENABLED !== 'true') {
    log('send-whatsapp-recovery: disabled by kill switch')
    return jsonError(503, 'whatsapp recovery channel not enabled yet')
  }

  const phone = normalizeEgyptianPhoneServer(payload.phone ?? '')
  if (!phone) return jsonError(400, 'invalid phone')

  const nowMs = now()
  if (payload.action === 'request') {
    return handleRequestCode(phone, env, fetchFn, log, store, nowMs)
  }
  if (payload.action === 'verify') {
    return handleVerifyCode(
      phone,
      (payload.code ?? '').trim(),
      payload.new_password ?? '',
      log,
      store,
      nowMs,
    )
  }
  return jsonError(400, 'unknown action')
}
