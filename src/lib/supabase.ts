import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** هل تم ضبط متغيرات بيئة Supabase؟ */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  // وضع تجريبي بلا اتصال: التطبيق يعمل كواجهة فقط ولا يقرأ/يكتب أي بيانات.
  console.warn(
    '[تطبيق المدرس] متغيرات VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY غير موجودة — ' +
      'التطبيق يعمل في وضع تجريبي بلا اتصال بـ Supabase. انسخ .env.example إلى .env واملأ القيم.',
  )
}

/** عميل Supabase — يكون null في الوضع التجريبي (بلا متغيرات بيئة). */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null
