/**
 * حارس النسخة (3A-903 — شفاء ذاتي للعملاء القدامى): نسخة مثبتة قديمة
 * قد تظل تخدم قشرة/حزمة ما قبل أي هجرة (عامل الخدمة الأول كان يرجع
 * للقشرة المخزنة عند أي فشل شبكة ويخدم الأصول Stale-While-Revalidate،
 * فتُبعث الحزمة القديمة كاملة في أي فتح متعثر). هذا الحارس يقارن ختم
 * بناء العميل الجاري (__BUILD_TIME__) بختم ما يخدمه الخادم فعلاً
 * (version.json يولّده البناء نفسه — انظر vite.config.ts)، وعند
 * الاختلاف يمسح كل الكاشات ويلغي تسجيل عمال الخدمة ويعيد التحميل
 * مرة واحدة فقط لكل زوج نسخ — فلا حلقة أبداً.
 *
 * حدوده الصادقة: عميل أقدم من هذا الحارس نفسه لا يحتويه، فلا يشفى
 * إلا يدوياً — ورسالة «نسختك قديمة» المصممة في translateAuthError
 * (features/auth/api) هي شبكة الأمان التي تشرح له الحل.
 *
 * طبقة الألرت (مطلب المالك 2026-11-26 20:06): إن بقي البناء مختلفاً
 * بعد إعادة التحميل الشافية الواحدة (الشفاء الصامت لم يأخذ)، يرفع
 * الحارس إشارة «عميل قديم» (lib/staleClient) فيعرض مكوّن UpdateAlert
 * ألرتاً ثابتاً بزر تحديث فعلي — لا خطأ خام ولا سكوت.
 */
import { markStaleClient } from './staleClient'

export type VersionAction = 'reload' | 'none'

/**
 * قرار الحارس النقي: إعادة تحميل شافية فقط عندما يوجد ختم بعيد
 * صالح ويختلف عن ختمنا ولم نعد التحميل لهذا الزوج من قبل.
 */
export function decideVersionAction(
  localBuild: string,
  remoteBuild: string | null | undefined,
  alreadyReloaded: boolean,
): VersionAction {
  if (alreadyReloaded) return 'none'
  if (!localBuild || !remoteBuild) return 'none'
  return remoteBuild !== localBuild ? 'reload' : 'none'
}

/** مفتاح علامة «أعدنا التحميل لهذا الزوج» — sessionStorage يعيش عبر إعادة التحميل داخل نفس جلسة التبويب فيمنع أي حلقة */
export const VERSION_RELOAD_MARK_KEY = 'mister.versionGuard.reloadedFor'

/** معرّف زوج النسخ (محلي ← بعيد) الذي تُحفظ به علامة إعادة التحميل */
export function versionPairKey(localBuild: string, remoteBuild: string): string {
  return `${localBuild}->${remoteBuild}`
}

/**
 * تشغيل الحارس عند بدء التطبيق (إنتاج فقط من المتصل في main.tsx).
 * فشل صامت موثّق: الجلب بـ no-store حتى لا يقرأ ختماً مخزناً؛ أي فشل
 * (شبكة/JSON/تخزين جلسة/مسح) يترك التطبيق كما هو تماماً — الحارس
 * تحسين شفاء اختياري، وكسر بدء التشغيل بسببه ممنوع، ورسالة النسخة
 * القديمة المصممة هي المسار عندها.
 */
export async function runVersionGuard(): Promise<void> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return
    const data: unknown = await res.json()
    const remoteRaw =
      typeof data === 'object' && data !== null
        ? (data as { buildTime?: unknown }).buildTime
        : undefined
    const remoteBuild = typeof remoteRaw === 'string' ? remoteRaw : null
    const pair = remoteBuild ? versionPairKey(__BUILD_TIME__, remoteBuild) : ''
    const alreadyReloaded = remoteBuild
      ? window.sessionStorage.getItem(VERSION_RELOAD_MARK_KEY) === pair
      : false
    if (decideVersionAction(__BUILD_TIME__, remoteBuild, alreadyReloaded) !== 'reload') {
      // بناء مختلف وبقينا عليه بعد إعادة التحميل الشافية لهذا الزوج:
      // الشفاء الصامت لم يأخذ — ارفع إشارة الألرت (مطلب المالك 20:06)
      if (remoteBuild && remoteBuild !== __BUILD_TIME__ && alreadyReloaded) markStaleClient()
      return
    }
    // العلامة قبل إعادة التحميل حتماً — وإلا صارت الحلقة ممكنة
    window.sessionStorage.setItem(VERSION_RELOAD_MARK_KEY, pair)
    await purgeShellCaches()
    window.location.reload()
  } catch {
    // إسقاط صامت مقصود وموثّق أعلاه: لا إعادة محاولة ولا كسر تشغيل
  }
}

/** مسح كاشات القشرة كلها + إلغاء تسجيل عمال الخدمة كلهم — خطوة التهيئة المشتركة بين الشفاء الصامت وزر التحديث */
export async function purgeShellCaches(): Promise<void> {
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  }
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((r) => r.unregister()))
  }
}

/**
 * رابط إعادة التحميل كاسر الكاش: يضيف/يستبدل وسم `__v` بختم فريد فيبقى
 * أحدث طلب تنقّل خارج أي كاش HTTP وسيط، مع حفظ باقي الاستعلام والهاش.
 */
export function cacheBustedUrl(href: string, stamp: string): string {
  const url = new URL(href)
  url.searchParams.set('__v', stamp)
  return url.toString()
}

/**
 * إجراء زر «تحديث التطبيق» في ألرت النسخة القديمة (3A-903): بضغطة
 * واحدة — مسح الكاشات وإلغاء تسجيل عمال الخدمة ثم تنقّل قسري لرابط
 * كاسر للكاش، فلا يبقى بين المستخدم وأحدث بناء أي طبقة تخزين.
 * التنقّل قابل للحقن لاختبار الإجراء بلا تنقّل فعلي.
 */
export async function forceClientUpdate(
  navigate: (url: string) => void = (url) => window.location.replace(url),
): Promise<void> {
  await purgeShellCaches()
  navigate(cacheBustedUrl(window.location.href, String(Date.now())))
}
