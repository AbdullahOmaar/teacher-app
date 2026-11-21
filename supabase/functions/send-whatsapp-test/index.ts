// ============================================================================
// تطبيق المدرس — Edge Function: send-whatsapp-test (3A-300، نموذج 0026)
// ----------------------------------------------------------------------------
// مدخل Deno فقط: المنطق كله في core.ts (نقي وقابل للمحاكاة محلياً).
// «إرسال كود تجريبي» من إعدادات المدرس — التصميم الكامل:
// goals/teacher-admin-app/files/WHATSAPP-OTP-DESIGN.md §٧/§٨.
//
// verify_jwt مفعّل على مستوى المنصة لهذه الدالة (عكس دالة الـ Hook):
// المستدعي مستخدم حقيقي بـ JWT من التطبيق، والمنصة تتحقق منه قبل
// التنفيذ، ثم يتحقق الكود من ملكية السنتر بعميل service role.
//
// الأسرار (أسماء فقط): WHATSAPP_OTP_ENABLED (Kill switch المنصة)،
// SUPABASE_URL ‏، SUPABASE_ANON_KEY ‏، SUPABASE_SERVICE_ROLE_KEY
// (تلقائية من المنصة). توكن المدرس لا يمر هنا كنص إلا لحظة الإرسال
// من Vault عبر RPC داخلية بالـ service role.
// ============================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  handleSendWhatsappTest,
  type WhatsappTestDeps,
  type WhatsappTestEnv,
} from './core.ts'

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

const deps: WhatsappTestDeps = {
  getUserId: async (req) => {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return null
    const anon = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
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
  fetchFn: (input, init) => fetch(input, init),
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
