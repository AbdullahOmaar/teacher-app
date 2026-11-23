// ============================================================================
// تطبيق المدرس — Edge Function: send-whatsapp-message (3A-300)
// ----------------------------------------------------------------------------
// مدخل Deno فقط: المنطق كله في core.ts (نقي وقابل للمحاكاة محلياً).
// التصميم الكامل: goals/teacher-admin-app/files/WHATSAPP-OTP-DESIGN.md
// §٩ + migration ‏0045 (سجل القوالب وسجل الرسائل).
//
// verify_jwt مفعّل على مستوى المنصة لهذه الدالة: المستدعي مستخدم
// حقيقي بـ JWT من التطبيق، ثم يتحقق الكود من ملكية السنتر بعميل
// service role. الأسرار (أسماء فقط): WHATSAPP_MESSAGING_ENABLED
// (Kill switch المنصة — غير مضبوط = OFF)، SUPABASE_URL ‏،
// SUPABASE_ANON_KEY ‏، SUPABASE_SERVICE_ROLE_KEY (تلقائية من
// المنصة). توكن المدرس لا يمر هنا كنص إلا لحظة الإرسال من Vault
// عبر RPC داخلية بالـ service role.
// ============================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  handleSendWhatsappMessage,
  type WhatsappMessageDeps,
  type WhatsappMessageEnv,
} from './core.ts'

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

const deps: WhatsappMessageDeps = {
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
