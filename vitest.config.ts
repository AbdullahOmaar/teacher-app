import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// إعداد Vitest (موجة التحسينات W2): اختبارات وحدات للدوال النقية الحرجة
// (فوترة/معرّضون/متأخرات/تنسيقات) + اختبارات مكوّنات خفيفة بـ Testing Library.
// بيئة jsdom للمكوّنات؛ اختبارات الدوال النقية لا تعتمد على DOM أصلاً.
export default defineConfig({
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
