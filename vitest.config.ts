import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// إعداد Vitest (موجة التحسينات W2): اختبارات وحدات للدوال النقية الحرجة
// (فوترة/معرّضون/متأخرات/تنسيقات) + اختبارات مكوّنات خفيفة بـ Testing Library.
// بيئة jsdom للمكوّنات؛ اختبارات الدوال النقية لا تعتمد على DOM أصلاً.
export default defineConfig({
  // ثوابت البناء في بيئة الاختبار (3A-914): vite.config.ts يحقن
  // __APP_VERSION__ / __BUILD_TIME__ عبر define في بناء الإنتاج،
  // لكن Vitest يقرأ vitest.config.ts وحده ولا يدمج vite.config.ts —
  // فأي اختبار يصيّر مكوّناً يستدعي versionStampLine() (فوتر الدخول)
  // كان يقع بـ ReferenceError. نفس المصدر هنا: الإصدار من
  // package.json، ووقت بناء ثابت حتمي حتى لا يعتمد أي اختبار على
  // ساعة الحائط — لا قيمة معروضة يدوياً في أي موضع.
  define: {
    __APP_VERSION__: JSON.stringify(
      (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version,
    ),
    __BUILD_TIME__: JSON.stringify('2026-01-01T00:00:00.000Z'),
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      // قياس تغطية (3A-302 — §6): يُشغَّل بـ npm run test:coverage فقط،
      // لا بوابة صلبة بعد — خط الأساس الأوّلي يُقاس ويُوثَّق في
      // STANDARDS-COMPLIANCE.md، وأي بوابة على الأسطر المتغيرة تحتاج
      // أدوات diff-cover في CI (متابعة R6).
      provider: 'v8',
      reporter: ['text-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/i18n/ar/**',
        'src/types/**',
        'src/main.tsx',
      ],
    },
  },
})
