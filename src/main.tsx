import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// خط IBM Plex Sans Arabic مضمّن محلياً (woff2 عبر @fontsource) —
// بلا أي اعتماد على Google Fonts، فيعمل أوفلاين ومع PWA (بحث UIUX §4/§5)
import '@fontsource/ibm-plex-sans-arabic/400.css'
import '@fontsource/ibm-plex-sans-arabic/500.css'
import '@fontsource/ibm-plex-sans-arabic/600.css'
import '@fontsource/ibm-plex-sans-arabic/700.css'
// خطوط طباعة المستندات الاختيارية (مهمة 12 — ج16-1 / lib/printFonts):
// مضمّنة محلياً بنفس قرار الأوفلاين، والمتصفح لا يجلب ملفات أي خط إلا
// حين يُعرض نص به فعلاً (معاينة الإعدادات أو منطقة طباعة مختارة).
import '@fontsource/cairo/400.css'
import '@fontsource/cairo/700.css'
import '@fontsource/cairo/800.css'
import '@fontsource/tajawal/400.css'
import '@fontsource/tajawal/700.css'
import '@fontsource/tajawal/800.css'
import '@fontsource/almarai/400.css'
import '@fontsource/almarai/700.css'
import '@fontsource/almarai/800.css'
import '@fontsource/amiri/400.css'
import '@fontsource/amiri/700.css'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ui/ErrorBoundary.tsx'
import { installGlobalErrorHandlers } from './lib/errorReporter.ts'
// التقاط beforeinstallprompt مبكراً لبطاقة التثبيت في الإعدادات (خطوة 11)
import './lib/installPrompt'

// قياس أخطاء الإنتاج الداخلي (مهمة 11 — فجوة 21): ملتقطا النافذة
// العامان (خطأ غير مُعالج + وعد مرفوض) بجانب بلاغات حدّ الخطأ نفسه
installGlobalErrorHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* حدّ خطأ جذري (3A-302): أي انهيار تصيير يعرض رسالة عامة + تحديث
        بدل شاشة بيضاء — انظر components/ui/ErrorBoundary.tsx */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

/*
 * تسجيل Service Worker للـ PWA (خطوة 11) — إنتاج فقط (في التطوير يمنع
 * الـ SW التحديث الفوري للكود ويشتت التصحيح). ملف public/sw.js يدوي
 * ومحافظ: قشرة + أصول ثابتة فقط، لا كاش لأي API/Supabase أبداً،
 * والتنقلات Network-First فلا نسخة قديمة بعد أي نشر (انظر ترويسة sw.js).
 * فشل التسجيل غير قاتل: التطبيق يعمل كاملاً بدونه (بلا أوفلاين للقشرة).
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // تجاهل متعمّد: لا SW = تجربة ويب عادية
    })
  })
}
