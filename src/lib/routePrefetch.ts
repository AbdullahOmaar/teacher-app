/**
 * جلب حزم المسارات مقدماً (3A-312 — بند ٢): صفحات التطبيق كسولة
 * (React.lazy) فكانت أول ضغطة على أي وجهة تدفع ثمن جلب حزمتها
 * وتحليلها كاملاً بعد الضغطة (مقاساً: 730ms للجدول و1207ms للتحليلات
 * على CPU مخنوق ×4 ولو بلا شبكة — وعلى شبكة الموبايل الحقيقية يُضاف
 * زمن النقل). الحل: تسخين الحزمة قبل الضغطة —
 *  • عند بدء اللمس (pointerdown) على عنصر التنقّل نفسه: كسب زمن
 *    اللمسة كاملاً قبل اكتمال النقرة.
 *  • عند خمول الصفحة (requestIdleCallback): تسخين وجهات «المزيد»
 *    تسلسلياً واحدةً تلو الأخرى بلا إغراق للشبكة.
 * الجلب هنا يستدعي نفس import() الخاص بالمسار؛ المتصفح يحلّ الاستدعاء
 * الثاني من كاش الوحدات فلا تنزيل مكرر، وReact.lazy يجد الحزمة جاهزة.
 * فشل جلب تسخيني (شبكة عابرة) لا يكسر شيئاً: يُنسى المسار فيُعاد عند
 * لمسته/تنقّله الحقيقي.
 */

type RouteLoader = () => Promise<unknown>

const loaders = new Map<string, RouteLoader>()
const started = new Set<string>()

/** تسجيل محمّلات المسارات — تُستدعى مرة من App.tsx عند الإقلاع */
export function registerRouteLoaders(map: Record<string, RouteLoader>): void {
  for (const [path, loader] of Object.entries(map)) {
    loaders.set(path, loader)
  }
}

/** تسخين حزمة مسار واحد (بلا تكرار، وبلا أثر عند الفشل) */
export function prefetchRoute(path: string): void {
  const loader = loaders.get(path)
  if (!loader || started.has(path)) return
  started.add(path)
  void loader().catch(() => {
    started.delete(path)
  })
}

/**
 * تسخين قائمة مسارات عند الخمول — تسلسلي (واحدة كل دورة خمول) حتى لا
 * تنافس الحزم بعضها ولا بيانات الصفحة الجارية. يرجع دالة إلغاء لفك
 * التركيب.
 */
export function prefetchRoutesIdle(paths: string[]): () => void {
  let cancelled = false
  let index = 0
  const step = () => {
    if (cancelled || index >= paths.length) return
    prefetchRoute(paths[index])
    index += 1
    schedule()
  }
  const schedule = () => {
    if (cancelled || index >= paths.length) return
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(step, { timeout: 2500 })
    } else {
      window.setTimeout(step, 250)
    }
  }
  schedule()
  return () => {
    cancelled = true
  }
}
