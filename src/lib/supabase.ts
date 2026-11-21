import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { t } from '../i18n'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** هل تم ضبط متغيرات بيئة Supabase؟ */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  // وضع تجريبي بلا اتصال: التطبيق يعمل كواجهة فقط ولا يقرأ/يكتب أي بيانات.
  console.warn(t('common.supabaseEnvMissing'))
}

/** عميل Supabase — يكون null في الوضع التجريبي (بلا متغيرات بيئة). */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null

/**
 * عميل جاهز للاستخدام أو رمي خطأ واضح (COD-4): نقطة الدخول الوحيدة
 * لملفات api بدل نسخة `db()` مكررة في كل وحدة. في الوضع التجريبي
 * (بلا متغيرات بيئة) يرمي بدل إرجاع null حتى لا تتسرب استعلامات فارغة.
 */
export function db(): SupabaseClient {
  if (!supabase) throw new Error(t('common.supabaseNotConnected'))
  return supabase
}
