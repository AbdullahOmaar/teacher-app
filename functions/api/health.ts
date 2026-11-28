// نقطة فحص الصحة — نسخة Cloudflare Pages Functions من api/health.ts.
//
// على Vercel تُبنى api/health.ts كدالة Serverless ومسارها ‎/api/health‎؛
// وعلى Cloudflare Pages يحمل هذا الملف نفس المسار كدالة Pages
// (functions/api/health.ts ← ‎/api/health‎)، ويصله ‎/health‎ عبر قاعدة
// ‎/health‎ في public/_redirects التي تسبق مظلة الـSPA — تماماً كما في
// vercel.json. الحمولة وحالات الاستجابة مطابقة للأصل سطراً بسطر:
// ‎200 {status:"ok"}‎، و503 {status:"degraded"} عند تعذّر وصول Supabase،
// و405 {status:"method_not_allowed"} لغير GET/HEAD، وCache-Control:
// no-store على كل رد. أي تعديل على المنطق يُجرى في الملفين معاً.
// صفر اعتماديات جديدة (سياسة الاعتماديات §9): أنواع بنيوية دنيا بدل
// حزمة @cloudflare/workers-types، ومتغيرات البيئة من سياق الدالة
// (env) بدل process.env — وهو الفرق الشكلي الوحيد عن الأصل.

type HealthEnv = {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

type HealthContext = {
  request: Request
  env: HealthEnv
}

// يطابق "version" في package.json — يُحدَّث مع كل إصدار (نظام الفيز/الإصدار).
const APP_VERSION = '1.0.0'
const SUPABASE_TIMEOUT_MS = 3000

async function checkSupabase(env: HealthEnv): Promise<'ok' | 'unreachable' | 'not_configured'> {
  const url = env.VITE_SUPABASE_URL
  const publishableKey = env.VITE_SUPABASE_ANON_KEY
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

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  })
}

async function handleHealth(context: HealthContext): Promise<Response> {
  const { request, env } = context
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse(405, { status: 'method_not_allowed' })
  }
  const supabase = await checkSupabase(env)
  const degraded = supabase === 'unreachable'
  return jsonResponse(degraded ? 503 : 200, {
    status: degraded ? 'degraded' : 'ok',
    app: 'teacher-app',
    version: APP_VERSION,
    time: new Date().toISOString(),
    checks: { supabase },
  })
}

// GET وHEAD بنفس معالجة الأصل (المنصة تحذف جسم رد HEAD كما في Vercel)،
// وonRequest يلتقط بقية الطرق فيرد عليها 405 من نفس المعالج.
export const onRequestGet = handleHealth
export const onRequestHead = handleHealth
export const onRequest = handleHealth
