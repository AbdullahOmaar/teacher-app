// ============================================================================
// تطبيق المدرس — Edge Function: send-whatsapp-otp (شريحة التفعيل من P5-3)
// ----------------------------------------------------------------------------
// مدخل Deno فقط: المنطق كله في core.ts (نقي وقابل للمحاكاة محلياً).
// قناة توصيل كود التفعيل عبر واتساب لـ Supabase Send SMS Hook —
// التصميم الكامل: goals/teacher-admin-app/files/WHATSAPP-OTP-DESIGN.md
//
// verify_jwt معطّل على مستوى المنصة عمداً: مستدعي الـ Hook هو GoTrue
// نفسه ويحمل توقيع Standard Webhooks لا JWT مستخدم — البوابة هي
// التحقق من التوقيع داخل core.ts بسرّ SEND_SMS_HOOK_SECRET، وأي طلب
// بلا توقيع صالح يُرفض 401 قبل أي عمل (نفس نمط send-push القائم).
//
// الأسرار (Supabase project secrets — أسماء فقط، القيم لا تُكتب هنا):
// SEND_SMS_HOOK_SECRET ‏، WHATSAPP_OTP_ENABLED ‏، WHATSAPP_ACCESS_TOKEN ‏،
// WHATSAPP_PHONE_NUMBER_ID ‏، WHATSAPP_OTP_TEMPLATE_NAME ‏،
// WHATSAPP_OTP_TEMPLATE_LANG ‏، WHATSAPP_GRAPH_VERSION
// ============================================================================

import { handleSendWhatsappOtp, type WhatsappOtpEnv } from './core.ts'

const ENV_KEYS = [
  'SEND_SMS_HOOK_SECRET',
  'WHATSAPP_OTP_ENABLED',
  'WHATSAPP_OTP_MOCK',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_OTP_TEMPLATE_NAME',
  'WHATSAPP_OTP_TEMPLATE_LANG',
  'WHATSAPP_GRAPH_VERSION',
  'WHATSAPP_GRAPH_BASE_URL',
] as const

Deno.serve((req: Request) => {
  const env: WhatsappOtpEnv = {}
  for (const key of ENV_KEYS) env[key] = Deno.env.get(key)
  return handleSendWhatsappOtp(req, env, (input, init) => fetch(input, init), (msg) =>
    console.log(msg),
  )
})
