// ============================================================================
// تطبيق المدرس — Edge Function: send-whatsapp-otp (شريحة التفعيل من P5-3)
// ----------------------------------------------------------------------------
// مدخل Deno فقط: المنطق كله في core.ts (نقي وقابل للمحاكاة محلياً).
// قناة توصيل كود التفعيل عبر واتساب لـ Supabase Send SMS Hook —
// التصميم الكامل: goals/teacher-admin-app/files/WHATSAPP-OTP-DESIGN.md
//
// النموذج الاختياري per-teacher (0026): لا أصول Meta في أسرار المشروع.
// المدخل يحقن «مُحلِّل قناة» يقرأ قناة المدرس صاحب الحساب (user.id من
// حمولة الـ Hook) عبر RPC ‏resolve_whatsapp_channel_internal بالـ
// service role — الإعدادات من teacher_whatsapp_config والتوكن من
// Vault، والفكّ خادمياً فقط هنا. أسرار المنصة المستخدمة: سرّ توقيع
// الـ Hook + Kill switch فقط.
//
// verify_jwt معطّل على مستوى المنصة عمداً: مستدعي الـ Hook هو GoTrue
// نفسه ويحمل توقيع Standard Webhooks لا JWT مستخدم — البوابة هي
// التحقق من التوقيع داخل core.ts بسرّ SEND_SMS_HOOK_SECRET، وأي طلب
// بلا توقيع صالح يُرفض 401 قبل أي عمل (نفس نمط send-push القائم).
//
// الأسرار (Supabase project secrets — أسماء فقط، القيم لا تُكتب هنا):
// SEND_SMS_HOOK_SECRET ‏، WHATSAPP_OTP_ENABLED (Kill switch المنصة)،
// SUPABASE_URL ‏، SUPABASE_SERVICE_ROLE_KEY (تلقائية من المنصة).
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  handleSendWhatsappOtp,
  type ResolveChannelFn,
  type WhatsappChannel,
  type WhatsappOtpEnv,
} from './core.ts'

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

interface ChannelRow {
  teacher_id: string
  phone_number_id: string
  template_name: string
  template_language: string
  access_token: string
}

/** مُحلِّل القناة الإنتاجي: RPC داخلية واحدة بالـ service role */
const resolveChannel: ResolveChannelFn = async (userId: string) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data, error } = await supabase.rpc('resolve_whatsapp_channel_internal', {
    p_user_id: userId,
  })
  if (error) throw new Error(`channel rpc failed: ${error.message}`)
  const row = (Array.isArray(data) ? data[0] : data) as ChannelRow | undefined
  if (!row) return null
  const channel: WhatsappChannel = {
    teacherId: row.teacher_id,
    accessToken: row.access_token,
    phoneNumberId: row.phone_number_id,
    templateName: row.template_name,
    templateLang: row.template_language,
  }
  return channel
}

Deno.serve((req: Request) => {
  const env: WhatsappOtpEnv = {}
  for (const key of ENV_KEYS) env[key] = Deno.env.get(key)
  return handleSendWhatsappOtp(
    req,
    env,
    // مهلة شبكة صريحة 10 ثوانٍ لنداء Meta Graph (تصليب 3A-302): بلا مهلة
    // قد يعلّق نداء بطيء/معلّق خطافَ GoTrue حتى مهلته هو؛ الحدّ هنا يعيد
    // خطأ نظيفاً أولاً. المنطق في core.ts لا يمرّر signal أصلاً فدمجه هنا آمن.
    (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
    (msg) => console.log(msg),
    resolveChannel,
  )
})
