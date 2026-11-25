/**
 * ثوابت البناء المعروضة للمستخدم — تُحقن وقت البناء عبر define في
 * vite.config.ts (مصدر واحد: 3A-312 بند ٥ + قاعدة المالك 2026-11-25).
 * لا تُعرّف القيم في أي مكان آخر.
 */
/** رقم إصدار التطبيق من package.json */
declare const __APP_VERSION__: string
/** لحظة البناء بصيغة ISO — تُحقن آلياً عند كل build، لا تُكتب يدوياً أبداً */
declare const __BUILD_TIME__: string
