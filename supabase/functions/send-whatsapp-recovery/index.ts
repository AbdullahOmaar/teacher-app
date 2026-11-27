// ============================================================================
// تطبيق المدرس — Edge Function: send-whatsapp-recovery (3A-927)
// ----------------------------------------------------------------------------
// مدخل Deno فقط: المنطق كله في core.ts (نقي وقابل للمحاكاة محلياً).
// استرداد كلمة السر برمز واتساب على قناة المنصة — التصميم الكامل:
// docs/WHATSAPP-RECOVERY.md
//
// قناة المنصة: الإرسال بأصول Meta في أسرار المشروع (رقم المنصة)، لا
// بحلّ قناة مدرس — قرار المدير 2026-11-27 (المقفول بره قد لا تملك
// قناته وجوداً). المخزن هنا يركب على جدول whatsapp_recovery_codes
// ودالتي 0070 الداخليتين بالـ service role حصراً.
//
// verify_jwt معطّل على مستوى المنصة عمداً عند النشر: المستدعي
// مستخدم مقفول بره حسابه بلا أي JWT — البوابات هي Kill switch +
// حدود المعدل + تجزئة الكود + سقف المحاولات + الردود المحايدة داخل
// core.ts (نفس تعليل send-push وsend-whatsapp-otp الموثّق). النشر
// يجب أن يضبط verify_jwt=false لهذه الدالة تحديداً.
//
// الأسرار (Supabase project secrets — أسماء فقط، القيم لا تُكتب هنا):
// WHATSAPP_RECOVERY_ENABLED (Kill switch)، WHATSAPP_ACCESS_TOKEN،
// WHATSAPP_PHONE_NUMBER_ID (رقم المنصة)، WHATSAPP_RECOVERY_TEMPLATE_NAME
// (اختياري — يرجع لاسم قالب OTP ثم 'otp_code')، SUPABASE_URL، ومفتاح
// الإدارة السري الجديد من SUPABASE_SECRET_KEYS المحقونة من المنصة
// (مدخل default — وبرجوع للمحفوظ القديم SUPABASE_SERVICE_ROLE_KEY
// حتى يُعطَّل). ترحيل المفاتيح 3A-695.
// ============================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  handleSendWhatsappRecovery,
  type ActiveRecoveryCode,
  type RecoveryStore,
  type WhatsappRecoveryEnv,
} from './core.ts'

const ENV_KEYS = [
  'WHATSAPP_RECOVERY_ENABLED',
  'WHATSAPP_RECOVERY_MOCK',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_RECOVERY_TEMPLATE_NAME',
  'WHATSAPP_OTP_TEMPLATE_NAME',
  'WHATSAPP_OTP_TEMPLATE_LANG',
  'WHATSAPP_GRAPH_VERSION',
  'WHATSAPP_GRAPH_BASE_URL',
] as const

// مفاتيح المشروع السرية الجديدة (sb_secret_*) — نفس نمط
// send-whatsapp-otp: مفتاح الإدارة 'default' وبغيابه القديم المحقون.
function secretKeys(): Record<string, string> {
  try {
    const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
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
const SERVICE_KEY = secretKeys()['default'] ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** مخزن الإنتاج: جدول 0070 + دالتاه الداخليتان + Admin API */
const store: RecoveryStore = {
  async findUserIdByPhone(phone: string) {
    const supabase = adminClient()
    const { data, error } = await supabase.rpc('find_auth_user_id_by_phone_internal', {
      p_phone: phone,
    })
    if (error) throw new Error(`phone lookup rpc failed: ${error.message}`)
    return (data as string | null) ?? null
  },

  async listRecentCodeTimes(phone: string, sinceMs: number) {
    const supabase = adminClient()
    const { data, error } = await supabase
      .from('whatsapp_recovery_codes')
      .select('created_at')
      .eq('phone', phone)
      .gte('created_at', new Date(sinceMs).toISOString())
      .order('created_at', { ascending: false })
    if (error) throw new Error(`recent codes query failed: ${error.message}`)
    return (data ?? []).map((row) => new Date(row.created_at as string).getTime())
  },

  async invalidateActiveCodes(phone: string) {
    const supabase = adminClient()
    const { error } = await supabase
      .from('whatsapp_recovery_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('phone', phone)
      .is('consumed_at', null)
    if (error) throw new Error(`invalidate codes failed: ${error.message}`)
  },

  async insertCode(phone: string, codeHash: string, expiresAtMs: number) {
    const supabase = adminClient()
    const { error } = await supabase.from('whatsapp_recovery_codes').insert({
      phone,
      code_hash: codeHash,
      expires_at: new Date(expiresAtMs).toISOString(),
    })
    if (error) throw new Error(`insert code failed: ${error.message}`)
  },

  async getActiveCode(phone: string) {
    const supabase = adminClient()
    const { data, error } = await supabase
      .from('whatsapp_recovery_codes')
      .select('id, code_hash, expires_at, attempts')
      .eq('phone', phone)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) throw new Error(`active code query failed: ${error.message}`)
    const row = (data ?? [])[0] as
      | { id: string; code_hash: string; expires_at: string; attempts: number }
      | undefined
    if (!row) return null
    const active: ActiveRecoveryCode = {
      id: row.id,
      codeHash: row.code_hash,
      expiresAtMs: new Date(row.expires_at).getTime(),
      attempts: row.attempts,
    }
    return active
  },

  async incrementAttempts(id: string) {
    const supabase = adminClient()
    const { data, error } = await supabase.rpc('increment_recovery_attempts_internal', {
      p_code_id: id,
    })
    if (error) throw new Error(`increment attempts rpc failed: ${error.message}`)
    return (data as number | null) ?? 0
  },

  async consumeCode(id: string) {
    const supabase = adminClient()
    const { error } = await supabase
      .from('whatsapp_recovery_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', id)
      .is('consumed_at', null)
    if (error) throw new Error(`consume code failed: ${error.message}`)
  },

  async updateUserPassword(userId: string, newPassword: string) {
    const supabase = adminClient()
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    })
    if (error) throw new Error(`admin password update failed: ${error.message}`)
  },
}

Deno.serve((req: Request) => {
  const env: WhatsappRecoveryEnv = {}
  for (const key of ENV_KEYS) env[key] = Deno.env.get(key)
  return handleSendWhatsappRecovery(
    req,
    env,
    // مهلة شبكة صريحة 10 ثوانٍ لنداء Meta Graph (تصليب 3A-302) —
    // نفس نمط send-whatsapp-otp
    (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
    (msg) => console.log(msg),
    store,
  )
})
