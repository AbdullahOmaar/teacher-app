/**
 * حماية CAPTCHA اختيارية لنموذج التسجيل (F5 من اختبار سند الأمني —
 * docs/SECURITY-F1-F6.md).
 *
 * التصميم باختيار واعٍ: الحماية **مطفأة افتراضياً** ولا تتغيّر بها أي
 * تجربة قائمة (الديمو يبقى كما هو بقرار المالك). تُفعَّل في بيئة
 * الإنتاج فقط بضبط مفتاح الموقع العام في بيئة البناء:
 *
 *   VITE_CAPTCHA_SITE_KEY=<site key من Cloudflare Turnstile>
 *
 * والمفتاح السري المقابل يُضبط في لوحة Supabase (Authentication →
 * Bot and Abuse Protection → CAPTCHA) — لا يعيش أي سر في هذا الريبو
 * أبداً. المزوّد المرجعي هو Cloudflare Turnstile (مجاني) لأن Supabase
 * Auth يدعمه أصلاً عبر options.captchaToken؛ وhCaptcha مدعوم من
 * Supabase أيضاً لكن سكربته تختلف — التبديل بينهما تغيير هنا فقط.
 *
 * عقد التوكن: الودجت يرسم داخل حاوية النموذج، والتوكن يصل عبر
 * callback ويُمرَّر إلى signUpWithEmail → auth.signUp. التوكن صالح
 * لاستخدام واحد؛ بعد أي محاولة تسجيل (نجاحاً أو فشلاً) يُعاد ضبط
 * الودجت حتى لا يُعاد استخدام توكن مستهلَك.
 */

export interface CaptchaConfig {
  enabled: boolean
  siteKey: string | null
}

/** قراءة الإعداد من بيئة البناء — نقية وقابلة للاختبار. */
export function captchaConfig(
  env: Record<string, unknown> = import.meta.env as Record<string, unknown>,
): CaptchaConfig {
  const raw = env.VITE_CAPTCHA_SITE_KEY
  const siteKey = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
  return { enabled: siteKey !== null, siteKey }
}

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
    },
  ) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
let scriptPromise: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      script.onload = () => {
        if (window.turnstile) resolve(window.turnstile)
        else reject(new Error('turnstile api missing after load'))
      }
      script.onerror = () => reject(new Error('turnstile script failed to load'))
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

/**
 * رسم ودجت Turnstile داخل الحاوية وإرجاع معرّفه (أو null عند أي فشل
 * تحميل — الفشل هنا لا يكسر التسجيل بصمت: المتصل يعرض رسالة مصممة).
 * onToken تُستدعى بالتوكن عند نجاح التحدي وبـ null عند انتهائه/خطئه.
 */
export async function renderCaptcha(
  container: HTMLElement,
  siteKey: string,
  onToken: (token: string | null) => void,
): Promise<string | null> {
  try {
    const api = await loadTurnstile()
    return api.render(container, {
      sitekey: siteKey,
      callback: (token) => onToken(token),
      'expired-callback': () => onToken(null),
      'error-callback': () => onToken(null),
    })
  } catch {
    return null
  }
}

/** إعادة ضبط ودجت (توكن مستهلَك بعد محاولة) — آمنة عند غياب الودجت. */
export function resetCaptcha(widgetId: string | null): void {
  if (widgetId && window.turnstile) {
    try {
      window.turnstile.reset(widgetId)
    } catch {
      // ودجت أُزيل أصلاً — لا شيء يُعاد ضبطه
    }
  }
}

/** إزالة ودجت عند فكّ المكوّن. */
export function removeCaptcha(widgetId: string | null): void {
  if (widgetId && window.turnstile) {
    try {
      window.turnstile.remove(widgetId)
    } catch {
      // تجاهل: الحاوية نفسها تُفكّ مع المكوّن
    }
  }
}
