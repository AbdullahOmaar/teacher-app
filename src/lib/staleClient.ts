/**
 * إشارة «عميل قديم» المشتركة (3A-903 — طبقة ألرت التحديث، مطلب
 * المالك 2026-11-26 20:06): مخزن وحدوي صغير بنمط useOfflineSync —
 * يُقرأ من مكوّن الألرت بـ useSyncExternalStore ويُغذّى من مصدرين
 * قائمين أصلاً بلا تكرار منطق:
 *  ١) حارس النسخة (lib/versionGuard): بناء الخادم مختلف وبقي مختلفاً
 *     بعد إعادة التحميل الشافية الواحدة — الشفاء الصامت لم يأخذ،
 *     فالكلمة الآن للمستخدم عبر الألرت.
 *  ٢) مترجم أخطاء المصادقة (features/auth/api): خطأ من فئة المفتاح
 *     القديم (isStaleClientError) — الخادم نفسه يقول إن النسخة أقدم
 *     من هجرة المفاتيح.
 * الحالة أحادية الاتجاه داخل الجلسة: لا تُصفَّر أبداً — الخروج منها
 * الوحيد هو إعادة تحميل كاملة تأتي بالبناء الجديد (عندها لا تُرفع
 * من الأساس)، فلا وميض ولا إخفاء ممكن.
 */

let stale = false
const listeners = new Set<() => void>()

/** رفع الإشارة (لا أثر عند تكرار الرفع) وإشعار المشتركين */
export function markStaleClient(): void {
  if (stale) return
  stale = true
  for (const l of listeners) l()
}

/** لقطة المخزن لـ useSyncExternalStore — مرجع ثابت (قيمة بدائية) */
export function getStaleClientSnapshot(): boolean {
  return stale
}

export function subscribeStaleClient(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** تصفير صريح لدعم الاختبارات فقط — لا يُستدعى من كود الإنتاج أبداً */
export function resetStaleClientForTests(): void {
  stale = false
  for (const l of listeners) l()
}
