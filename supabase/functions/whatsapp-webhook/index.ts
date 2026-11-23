// ============================================================================
// تطبيق المدرس — Edge Function: whatsapp-webhook (3A-300)
// ----------------------------------------------------------------------------
// مدخل Deno فقط: المنطق كله في core.ts (نقي وقابل للمحاكاة محلياً).
// verify_jwt معطّل على مستوى المنصة لهذه الدالة عمداً: المتصل هو
// خوادم Meta لا مستخدمونا — البوابة هي توقيع Meta نفسه
// (X-Hub-Signature-256 بسرّ التطبيق) + سرّ تحقق الاشتراك، وكلاهما
// من أسرار المنصة (أسماء فقط): WHATSAPP_APP_SECRET ‏،
// WHATSAPP_WEBHOOK_VERIFY_TOKEN — غير مضبوطين الآن فالدالة خاملة.
// التحديثات بعميل service role على whatsapp_message_log (0045).
// ============================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  handleWhatsappWebhook,
  type WhatsappWebhookDeps,
  type WhatsappWebhookEnv,
} from './core.ts'

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

const deps: WhatsappWebhookDeps = {
  updateStatusByMetaId: async (metaMessageId, status, error) => {
    const update: Record<string, unknown> = { status }
    if (error) {
      update.error_code = error.code
      update.error_message = error.message
    }
    const { data, error: dbError } = await serviceClient()
      .from('whatsapp_message_log')
      .update(update)
      .eq('meta_message_id', metaMessageId)
      .select('id')
    if (dbError) return false
    return Array.isArray(data) && data.length > 0
  },
}

Deno.serve((req: Request) => {
  const env: WhatsappWebhookEnv = {
    WHATSAPP_APP_SECRET: Deno.env.get('WHATSAPP_APP_SECRET'),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
  }
  return handleWhatsappWebhook(req, env, deps, (msg) => console.log(msg))
})
