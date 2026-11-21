import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

/*
 * مصدر الإصدار الواحد (3A-312 — بند ٥): رقم إصدار التطبيق المعروض في
 * الإعدادات وفوتر الدخول يُقرأ من package.json وقت البناء ويُحقن ثابتاً
 * (__APP_VERSION__) — تحديث الرقم هنا وحده يكفي لكل مواضع العرض.
 */
const pkgVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  plugins: [react(), tailwindcss()],
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
