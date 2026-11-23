// ============================================================================
// تطبيق المدرس — Edge Function: send-whatsapp-test (3A-300، نموذج 0026)
// ----------------------------------------------------------------------------
// مدخل Deno فقط: المنطق كله في core.ts (نقي وقابل للمحاكاة محلياً).
// «إرسال كود تجريبي» من إعدادات المدرس — التصميم الكامل:
// goals/teacher-admin-app/files/WHATSAPP-OTP-DESIGN.md §٧/§٨.
//
// verify_jwt مفعّل على مستوى المنصة لهذه الدالة (عكس دالة الـ Hook):
// المستدعي مستخدم حقيقي بـ JWT من التطبيق، والمنصة تتحقق منه قبل
// التنفيذ، ثم يتحقق الكود من ملكية السنتر بعميل إدارة.
//
// الأسرار (أسماء فقط): WHATSAPP_OTP_ENABLED (Kill switch المنصة)،
// SUPABASE_URL ‏، ومفاتيح المنصة المحقونة الجديدة:
// SUPABASE_PUBLISHABLE_KEYS لعميل التحقق من المستخدم
// وSUPABASE_SECRET_KEYS لعميل الإدارة (مدخل default في كليهما —
// وبرجوع للمحفوظين القدماء حتى يُعطَّلا). ترحيل المفاتيح 3A-695 —
// نمط نونو المثبت. توكن المدرس لا يمر هنا كنص إلا لحظة الإرسال
// من Vault عبر RPC داخلية بعميل الإدارة.
// ============================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  handleSendWhatsappTest,
  type WhatsappTestDeps,
  type WhatsappTestEnv,
} from './core.ts'

// مفاتيح المشروع الجديدة — تحقنها المنصة JSON بأسمائها في
// SUPABASE_SECRET_KEYS (السرية) وSUPABASE_PUBLISHABLE_KEYS (القابلة
// للنشر). مفتاح كل نوع هو 'default'، وبغيابه نرجع للمحفوظ القديم
// المقابل (صالح حتى تعطيل القديم).
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
    return {} // بيئة بلا مفاتيح جديدة — يبقى الرجوع للقديم وحده
  }
}
const SERVICE_KEY = injectedKeys('SUPABASE_SECRET_KEYS')['default'] ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PUBLISHABLE_KEY = injectedKeys('SUPABASE_PUBLISHABLE_KEYS')['default'] ??
  Deno.env.get('SUPABASE_ANON_KEY') ?? ''

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    SERVICE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

const deps: WhatsappTestDeps = {
  getUserId: async (req) => {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return null
    const anon = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      PUBLISHABLE_KEY,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    )
    const { data, error } = await anon.auth.getUser()
    if (error || !data.user) return null
    return data.user.id
  },
  loadOwnedTeacher: async (teacherId, userId) => {
    const { data, error } = await serviceClient()
      .from('teachers')
      .select('phone')
      .eq('id', teacherId)
      .eq('owner_user_id', userId)
      .maybeSingle()
    if (error || !data) return null
    return { phone: data.phone as string | null }
  },
  loadConfig: async (teacherId) => {
    const { data, error } = await serviceClient()
      .from('teacher_whatsapp_config')
      .select(
        'enabled, phone_number_id, template_name, template_language, token_vault_secret_id, last_test_at',
      )
      .eq('teacher_id', teacherId)
      .maybeSingle()
    if (error || !data) return null
    return {
      enabled: Boolean(data.enabled),
      phoneNumberId: String(data.phone_number_id ?? ''),
      templateName: String(data.template_name ?? 'otp_code'),
      templateLang: String(data.template_language ?? 'ar'),
      tokenPresent: Boolean(data.token_vault_secret_id),
      lastTestAt: (data.last_test_at as string | null) ?? null,
    }
  },
  getToken: async (teacherId) => {
    const { data, error } = await serviceClient().rpc(
      'get_teacher_whatsapp_token_internal',
      { p_teacher_id: teacherId },
    )
    if (error || typeof data !== 'string' || !data) return null
    return data
  },
  markTested: async (teacherId) => {
    await serviceClient()
      .from('teacher_whatsapp_config')
      .update({ last_test_at: new Date().toISOString() })
      .eq('teacher_id', teacherId)
  },
  // مهلة شبكة 10 ثوانٍ لنداء Graph — نفس تصليب 3A-302 في دالة الـ Hook
  fetchFn: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
  now: () => Date.now(),
  randomCode: () => String(Math.floor(100000 + Math.random() * 900000)),
}

Deno.serve((req: Request) => {
  const env: WhatsappTestEnv = {
    WHATSAPP_OTP_ENABLED: Deno.env.get('WHATSAPP_OTP_ENABLED'),
    WHATSAPP_GRAPH_VERSION: Deno.env.get('WHATSAPP_GRAPH_VERSION'),
    WHATSAPP_GRAPH_BASE_URL: Deno.env.get('WHATSAPP_GRAPH_BASE_URL'),
  }
  return handleSendWhatsappTest(req, env, deps, (msg) => console.log(msg))
})
