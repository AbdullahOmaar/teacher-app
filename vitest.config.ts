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
  },
})
