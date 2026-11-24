// نقطة فحص الصحة — فجوة 23 من تقييم الـ45 (مهمة Phase 2 رقم 2).
//
// تُبنى كدالة Vercel Serverless من مجلد api/ تلقائياً، وتُخدَم على /health.
// ملاحظة توجيه مهمة: إعادة كتابة الـSPA في vercel.json تستثني api/ صراحةً
// (المصدر ‎/((?!api/).*)‎) — فبدون الاستثناء تلتقط إعادة الكتابة الشاملة
// ‎/(.*)‎ طلب /health وتقدّم index.html بدل الدالة (تحقق تجريبي على نشر
// معاينة PR #8 في 2026-11-24، ثم أُصلح واعتُمد الاستثناء).
// الغرض: هدف ثابت لخدمة مراقبة uptime خارجية (HTTP 200 + كلمة "ok")،
// وفحص حي خفيف لوصول Supabase Auth دون أي بيانات مستخدمين أو أسرار:
// المفتاح المستخدم هو المفتاح القابل للنشر (publishable) العام أصلاً.
// صفر اعتماديات جديدة (سياسة الاعتماديات §9): أنواع بنيوية دنيا بدل
// حزمة @vercel/node.

type HealthRequest = {
  method?: string
}

type HealthResponse = {
  status: (code: number) => HealthResponse
  setHeader: (name: string, value: string) => void
  json: (body: Record<string, unknown>) => void
}

// يطابق "version" في package.json — يُحدَّث مع كل إصدار (نظام الفيز/الإصدار).
const APP_VERSION = '1.0.0'
const SUPABASE_TIMEOUT_MS = 3000

async function checkSupabase(): Promise<'ok' | 'unreachable' | 'not_configured'> {
  const url = process.env.VITE_SUPABASE_URL
  const publishableKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !publishableKey) return 'not_configured'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS)
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: publishableKey },
      signal: controller.signal,
    })
    return res.ok ? 'ok' : 'unreachable'
  } catch {
    // مصير واضح: أي فشل شبكة/مهلة = Supabase غير قابل للوصول من الدالة.
    return 'unreachable'
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req: HealthRequest, res: HealthResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ status: 'method_not_allowed' })
    return
  }
  const supabase = await checkSupabase()
  const degraded = supabase === 'unreachable'
  res.status(degraded ? 503 : 200).json({
    status: degraded ? 'degraded' : 'ok',
    app: 'teacher-app',
    version: APP_VERSION,
    time: new Date().toISOString(),
    checks: { supabase },
  })
}
