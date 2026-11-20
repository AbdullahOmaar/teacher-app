/*
 * Service Worker — تطبيق المدرس (Phase 2، الخطوة 11)
 *
 * الاختيار: SW يدوي بسيط بدل vite-plugin-pwa/Workbox — احتياجنا ضيّق جداً
 * (قشرة تطبيق + أصول ثابتة) وقواعدنا صارمة (لا كاش لأي API أبداً)، فمكتبة
 * كاملة كانت ستضيف runtime وحزمة وتكويناً بلا مقابل، بينما ملف واحد صريح
 * يجعل كل قاعدة قابلة للمراجعة سطراً بسطر.
 *
 * الاستراتيجيات (مقصودة ومحافظة):
 * 1) التنقلات (فتح/تحديث أي صفحة): Network-First دائماً — نحاول الشبكة
 *    أولاً ونحدّث نسخة /index.html المخزنة، ولا نرجع للكاش إلا عند فشل
 *    الشبكة فعلاً (أوفلاين). هكذا لا يرى المستخدم نسخة قديمة من التطبيق
 *    بعد أي نشر جديد ما دام متصلاً — وهو خطر الـ SW الأشهر.
 * 2) الأصول الثابتة same-origin (JS/CSS مجزأة الأسماء بالبناء، الخطوط
 *    المحلية، الصور/الأيقونات): Stale-While-Revalidate — تُعرض من الكاش
 *    فوراً وتتحدث في الخلفية؛ أسماؤها المُجزّأة تجعل أي نسخة قديمة
 *    يتيمة بلا مرجع بعد تحديث index.html، فلا خطر تقادم فعلياً.
 * 3) لا اعتراض إطلاقاً لـ: أي طلب غير GET، وأي أصل خارجي (cross-origin)
 *    — وفي مقدمته *.supabase.co (بيانات/جلسات Supabase) وأي API آخر —
 *    فتلك تذهب للشبكة مباشرة كما لو لم يوجد SW، ولا تُخزَّن أي بيانات
 *    اعتماد أو جلسات أو بيانات طلاب في الكاش أبداً.
 * 4) التحديث الفوري: skipWaiting عند التثبيت + clients.claim عند التفعيل
 *    + حذف كل كاشات النسخ السابقة، فنسخة SW جديدة تحل فوراً بلا انتظار
 *    إغلاق كل التبويبات، ومع Network-First للتنقلات يصل النشر الجديد
 *    للمستخدم في أول تحديث صفحة وهو متصل.
 */

const CACHE_NAME = 'teacher-app-shell-v1'

/** قشرة التطبيق المُخزّنة عند التثبيت — أصول ثابتة فقط، بلا أي بيانات */
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/logo.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const fresh = await fetch(request)
    // نحدّث نسخة القشرة المخزنة لتعمل أوفلاين لاحقاً بأحدث إصدار وصلنا
    if (fresh.ok) {
      await cache.put('/index.html', fresh.clone())
    }
    return fresh
  } catch {
    // أوفلاين فعلاً: قشرة التطبيق المخزنة (SPA تتولى التوجيه داخلياً)
    const shell = (await cache.match('/index.html')) || (await cache.match('/'))
    return shell || Response.error()
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((res) => {
      if (res.ok) {
        void cache.put(request, res.clone())
      }
      return res
    })
    .catch(() => cached)
  return cached || network
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  // أي أصل خارجي — Supabase وأي API/خطوط/خدمات خارجية — لا اعتراض ولا كاش
  if (url.origin !== self.location.origin) return
  // الـ SW نفسه لا يُخزَّن ولا يُعترض
  if (url.pathname === '/sw.js') return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    SHELL_URLS.includes(url.pathname) ||
    ['script', 'style', 'font', 'image', 'manifest'].includes(request.destination)
  if (isStaticAsset) {
    event.respondWith(staleWhileRevalidate(request))
  }
  // أي GET آخر من نفس الأصل: يمر للشبكة كما هو بلا تدخل
})
