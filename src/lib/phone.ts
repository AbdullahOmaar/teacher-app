// ============================================================================
// أرقام الموبايل المصرية + علم قناة التفعيل عبر واتساب (P5-3 — 3A-300)
// ----------------------------------------------------------------------------
// التطبيع لصيغة E.164 يتم في العميل قبل أي طلب OTP حتى تصل الدالة
// والخادم رقماً واحداً مضبوطاً دائماً. بادئات الموبايل المصرية فقط
// (010/011/012/015) — الخطوط الأرضية والأرقام الأجنبية تُرفض هنا
// برسالة ودّية بدل فشل غامض عند الخادم.
// ============================================================================

/**
 * علم قناة الدخول برقم الهاتف (OTP عبر واتساب): مقفل افتراضياً ولا
 * يُفتح إلا بضبط VITE_WHATSAPP_OTP_ENABLED=true في بيئة البناء بعد
 * اكتمال أصول Meta عند المالك (WHATSAPP-OTP-DESIGN.md ‏§٧/§٨).
 * عند قفله لا يتغيّر أي سلوك مرئي في صفحة الدخول إطلاقاً.
 */
export const WHATSAPP_OTP_ENABLED =
  import.meta.env.VITE_WHATSAPP_OTP_ENABLED === 'true'

/**
 * علم قناة التأكيد عبر واتساب (3A-905 — تجهيز فقط، بلا إرسال):
 * مقفل افتراضياً، ويُفتح بضبط
 * ‏VITE_WHATSAPP_VERIFICATION_ENABLED=true في بيئة البناء فقط بعد
 * اكتمال أصول Meta عند المالك (رقم منصة + قالب Authentication) وقرار
 * ‏Q4. عند قفله لا يظهر قسم رقم التأكيد في بطاقة واتساب إطلاقاً —
 * العلم بوابة عرض للقناة وحدها، لا تفعيل للنظام: التفعيل الحقيقي
 * بيد أدمن المنصة عبر مفاتيح الاستحقاق (0060)، وواجهته في الخطوة 7
 * من خطة الأدمن.
 */
export const WHATSAPP_VERIFICATION_CHANNEL_ENABLED =
  import.meta.env.VITE_WHATSAPP_VERIFICATION_ENABLED === 'true'

/**
 * علم استرداد كلمة السر برمز واتساب (3A-927): مقفل افتراضياً، ولا
 * يُفتح إلا بضبط VITE_WHATSAPP_RECOVERY_ENABLED=true في بيئة البناء
 * بعد اكتمال تفعيل قناة المنصة خادمياً (أسرار Meta للمنصة + علم
 * ‏WHATSAPP_RECOVERY_ENABLED عند الدالة — docs/WHATSAPP-RECOVERY.md).
 * عند قفله لا يظهر خيار الاسترداد بواتساب في صفحة الاسترداد إطلاقاً
 * ويبقى الاسترداد بالإيميل هو المسار الوحيد كما هو اليوم.
 */
export const WHATSAPP_RECOVERY_ENABLED =
  import.meta.env.VITE_WHATSAPP_RECOVERY_ENABLED === 'true'

/** الجزء الوطني من رقم موبايل مصري: 10 أرقام تبدأ بـ 1 وبادئة صحيحة */
const EG_NATIONAL_RE = /^1[0125]\d{8}$/

/**
 * تطبيع رقم مصري مكتوب بأي صيغة شائعة إلى E.164 ‎(+20XXXXXXXXXX)‎:
 * يقبل 01xxxxxxxxx ‏، ‎+20…‎ ‏، 0020… ‏، 20… ‏، أو الجزء الوطني وحده،
 * مع مسافات/شرطات/أقواس. يعيد null لأي رقم غير صالح.
 */
export function normalizeEgyptianPhone(raw: string): string | null {
  let digits = raw.replace(/[\s\-()]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  if (!/^\d+$/.test(digits)) return null

  let national: string
  if (digits.startsWith('0020')) national = digits.slice(4)
  else if (digits.startsWith('20') && digits.length === 12) national = digits.slice(2)
  else if (digits.startsWith('0') && digits.length === 11) national = digits.slice(1)
  else if (digits.length === 10) national = digits
  else return null

  if (!EG_NATIONAL_RE.test(national)) return null
  return `+20${national}`
}

/** هل الرقم (بأي صيغة إدخال) رقم موبايل مصري صالح؟ */
export function isValidEgyptianMobile(raw: string): boolean {
  return normalizeEgyptianPhone(raw) !== null
}
