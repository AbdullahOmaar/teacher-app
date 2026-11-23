// ============================================================================
// تطبيق المدرس — Edge Function: send-whatsapp-message (3A-300)
// ----------------------------------------------------------------------------
// مدخل Deno فقط: المنطق كله في core.ts (نقي وقابل للمحاكاة محلياً).
// التصميم الكامل: goals/teacher-admin-app/files/WHATSAPP-OTP-DESIGN.md
// §٩ + migration ‏0045 (سجل القوالب وسجل الرسائل).
//
// verify_jwt مفعّل على مستوى المنصة لهذه الدالة: المستدعي مستخدم
// حقيقي بـ JWT من التطبيق، ثم يتحقق الكود من ملكية السنتر بعميل
// إدارة. الأسرار (أسماء فقط): WHATSAPP_MESSAGING_ENABLED
// (Kill switch المنصة — غير مضبوط = OFF)، SUPABASE_URL ‏،
// ومفاتيح المنصة المحقونة الجديدة: SUPABASE_PUBLISHABLE_KEYS لعميل
// التحقق من المستخدم وSUPABASE_SECRET_KEYS لعميل الإدارة (مدخل
// default في كليهما — وبرجوع للمحفوظين القدماء حتى يُعطَّلا).
// ترحيل المفاتيح 3A-695 — نمط نونو المثبت. توكن المدرس لا يمر هنا
// كنص إلا لحظة الإرسال من Vault عبر RPC داخلية بعميل الإدارة.
// ============================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  handleSendWhatsappMessage,
  type WhatsappMessageDeps,
  type WhatsappMessageEnv,
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

const deps: WhatsappMessageDeps = {
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
  isOwner: async (teacherId, userId) => {
    const { data, error } = await serviceClient()
      .from('teachers')
      .select('id')
      .eq('id', teacherId)
      .eq('owner_user_id', userId)
      .maybeSingle()
    return !error && Boolean(data)
  },
  loadConfig: async (teacherId) => {
    const { data, error } = await serviceClient()
      .from('teacher_whatsapp_config')
      .select('enabled, phone_number_id, token_vault_secret_id')
      .eq('teacher_id', teacherId)
      .maybeSingle()
    if (error || !data) return null
    return {
      enabled: Boolean(data.enabled),
      phoneNumberId: String(data.phone_number_id ?? ''),
      tokenPresent: Boolean(data.token_vault_secret_id),
    }
  },
  loadTemplate: async (teacherId, kind) => {
    const { data, error } = await serviceClient()
      .from('teacher_whatsapp_templates')
      .select('template_name, language, status')
      .eq('teacher_id', teacherId)
      .eq('kind', kind)
      .maybeSingle()
    if (error || !data) return null
    return {
      templateName: String(data.template_name ?? ''),
      language: String(data.language ?? 'ar'),
      status: String(data.status ?? 'unknown'),
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
  insertLog: async (row) => {
    const { data, error } = await serviceClient()
      .from('whatsapp_message_log')
      .insert({
        teacher_id: row.teacherId,
        kind: row.kind,
        template_name: row.templateName,
        recipient_phone: row.recipientPhone,
        status: 'queued',
      })
      .select('id')
      .single()
    if (error || !data) return null
    return String(data.id)
  },
  updateLog: async (logId, patch) => {
    const update: Record<string, unknown> = { status: patch.status }
    if (patch.metaMessageId) update.meta_message_id = patch.metaMessageId
    if (typeof patch.errorCode === 'number') update.error_code = patch.errorCode
    if (patch.errorMessage) update.error_message = patch.errorMessage
    await serviceClient().from('whatsapp_message_log').update(update).eq('id', logId)
  },
  // مهلة شبكة 10 ثوانٍ لنداء Graph — نفس تصليب دالتي الـ OTP
  fetchFn: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
  now: () => Date.now(),
}

Deno.serve((req: Request) => {
  const env: WhatsappMessageEnv = {
    WHATSAPP_MESSAGING_ENABLED: Deno.env.get('WHATSAPP_MESSAGING_ENABLED'),
    WHATSAPP_GRAPH_VERSION: Deno.env.get('WHATSAPP_GRAPH_VERSION'),
    WHATSAPP_GRAPH_BASE_URL: Deno.env.get('WHATSAPP_GRAPH_BASE_URL'),
  }
  return handleSendWhatsappMessage(req, env, deps, (msg) => console.log(msg))
})
