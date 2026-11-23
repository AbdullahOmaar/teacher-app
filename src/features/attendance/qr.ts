import type { RosterStudent } from './api'

/**
 * منطق QR الحضور — دوال نقية معزولة قابلة للاختبار (خطوة 4، Phase 2).
 *
 * قيمة الـ QR على كارت الطالب الرقمي هي `students.public_code` حرفياً
 * (StudentCardSheet يولّد QRCode.toDataURL(student.public_code)) —
 * كود عشوائي من 8 أحرف من الأبجدية ABCDEFGHJKMNPQRSTUVWXYZ23456789
 * (بلا أحرف ملتبسة: لا 0/O ولا 1/I/L، انظر generate_public_code في 0001).
 * الماسح يقرأ نفس القيمة بالضبط؛ التطبيع هنا تسامحي فقط مع ما قد يضيفه
 * قارئ/طباعة حول القيمة (مسافات، حالة أحرف، بادئة # من العرض القديم)،
 * والمطابقة النهائية دقيقة ضد أكواد قائمة الحصة الحالية فقط.
 */

/** تطبيع نص ممسوح/مكتوب يدوياً إلى صورة الكود القابلة للمقارنة — null لو فارغ */
export function normalizeScannedCode(raw: string): string | null {
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  if (s.startsWith('#')) s = s.slice(1)
  s = s.replace(/\s+/g, '').toUpperCase()
  return s.length > 0 ? s : null
}

/**
 * مطابقة نص ممسوح بطالب في قائمة الحصة الحالية (roster).
 * ترجع الطالب أو null — كود غير معروف أو طالب غير مسجّل في هذه الحصة
 * يُعاملان بنفس الطريقة: لا تسجيل (قرار الخطوة 4).
 */
export function findStudentByCode(
  roster: Pick<RosterStudent, 'id' | 'name' | 'public_code'>[],
  raw: string,
): Pick<RosterStudent, 'id' | 'name' | 'public_code'> | null {
  const code = normalizeScannedCode(raw)
  if (!code) return null
  return roster.find((s) => normalizeScannedCode(s.public_code) === code) ?? null
}

/**
 * كبح تكرار نفس الكود أثناء بقاء الكارت أمام الكاميرا: قارئ ZXing يطلق
 * النتيجة مع كل إطار ناجح، فنتجاهل نفس الكود داخل نافذة التهدئة حتى لا
 * تتكرر التغذية الراجعة/الاهتزاز لنفس الطالب. أكواد مختلفة لا تُكبح أبداً
 * (مسح متتابع سريع عند الباب).
 */
const SCAN_COOLDOWN_MS = 3000

export function shouldAcceptScan(
  last: { code: string; at: number } | null,
  raw: string,
  now: number,
  cooldownMs: number = SCAN_COOLDOWN_MS,
): boolean {
  const code = normalizeScannedCode(raw)
  if (!code) return false
  if (!last) return true
  if (last.code !== code) return true
  return now - last.at >= cooldownMs
}
