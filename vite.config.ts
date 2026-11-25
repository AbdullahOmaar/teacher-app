import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { readFileSync } from 'node:fs'

/*
 * نزع woff من البناء (COD-9 — 3A-383): ‏@fontsource يعلن لكل وزن
 * src بصيغتين (woff2 ثم woff تراثي) فيصدر Vite الملفين معاً؛ لا
 * متصفح حديث (منذ ~2017، وChrome/Android WebView ضمناً) يطلب woff
 * أبداً لأن woff2 أولاً في القائمة ومدعوم عنده — فالملفات الـ woff
 * وزن dist ميت (~275KB). الإضافة تحذف أصول .woff من الحزمة وتنزع
 * مرجعها من CSS المبني حتى لا يبقى مرجع معلّق، والتصيير حرفياً
 * بلا تغيير لأي متصفح مستهدف.
 */
function stripWoff(): Plugin {
  return {
    name: 'strip-woff',
    generateBundle(_options, bundle) {
      for (const [fileName, item] of Object.entries(bundle)) {
        if (fileName.endsWith('.woff')) {
          delete bundle[fileName]
        } else if (
          fileName.endsWith('.css') &&
          item.type === 'asset' &&
          typeof item.source === 'string'
        ) {
          item.source = item.source.replace(
            /,url\([^)]*?woff[^)]*?\)\s*format\(["']woff["']\)/g,
            '',
          )
        }
      }
    },
  }
}

/*
 * مصدر الإصدار الواحد (3A-312 — بند ٥): رقم إصدار التطبيق المعروض في
 * الإعدادات وفوتر الدخول يُقرأ من package.json وقت البناء ويُحقن ثابتاً
 * (__APP_VERSION__) — تحديث الرقم هنا وحده يكفي لكل مواضع العرض.
 *
 * وقت البناء (__BUILD_TIME__ — قاعدة المالك 2026-11-25): لحظة تشغيل
 * البناء نفسه بصيغة ISO تُحقن آلياً مع كل build فتعرض شاشات التطبيق
 * سطر «الإصدار X — نُشر [التاريخ والوقت]» من بيانات البناء الفعلية —
 * لا قيمة مكتوبة يدوياً في أي مكان، وكل نشر جديد يحمل وقته هو.
 */
const pkgVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version
const buildTime = new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [react(), tailwindcss(), stripWoff()],
  build: {
    rolldownOptions: {
      output: {
        /*
         * فصل البائعين (Phase 2 — الخطوة 12، قياساً لا تخميناً):
         * مكتبات الإطار مستقرة عبر النشرات بينما كود التطبيق يتغير كل
         * خطوة؛ فصلها في chunks ثابتة الأسماء/المحتوى يعني أن الزيارات
         * المتكررة (استخدام المدرس اليومي + SW بخاصية
         * Stale-While-Revalidate على /assets) لا تعيد تنزيلها إلا عند
         * ترقيتها فعلياً. لا نجمع lucide هنا عمداً: أيقوناته تُقسَّم
         * لكل شاشة، وتجميعها كان سيحمّل أيقونات كل الشاشات أولياً.
         */
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 30,
            },
            {
              name: 'supabase',
              test: /node_modules[\\/]@supabase[\\/]/,
              priority: 20,
            },
            {
              name: 'data-vendor',
              test: /node_modules[\\/](@tanstack|react-router|react-router-dom)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
})
