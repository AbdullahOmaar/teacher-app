// ===========================================================================
// التميمة الحية (migration ‏0017) — الشخصية المرافقة للتطبيق: مخلوق دائري
// ودود يظهر بلون لهجة السنتر (teacher_settings.brand_accent) وبإكسسوار
// يختاره المدرس (teacher_settings.mascot_accessory). لا اسم للشخصية في
// أي نص واجهة بعد — «Mascot» اسم داخلي للمكوّن والأنواع فقط.
//
// القيم الخمس مغلقة بقيد في المخطط نفسه، والتحقق هنا حتى لا تصل قيمة
// مكسورة (نسخة قديمة/استيراد) لأي سطح عرض — أي قيمة غير معروفة تسقط
// لـ 'none' بلا كسر، بنفس فلسفة isValidAccent في lib/brand.
// ===========================================================================

export type MascotAccessory = 'none' | 'glasses' | 'grad-cap' | 'tie' | 'scarf'

export const MASCOT_ACCESSORIES: { code: MascotAccessory; label: string }[] = [
  { code: 'none', label: 'بدون إكسسوار' },
  { code: 'glasses', label: 'نضارة' },
  { code: 'grad-cap', label: 'كاب تخرج' },
  { code: 'tie', label: 'كرافتة وقلم' },
  { code: 'scarf', label: 'شال' },
]

const ACCESSORY_VALUES: readonly string[] = MASCOT_ACCESSORIES.map((a) => a.code)

export function isMascotAccessory(v: unknown): v is MascotAccessory {
  return typeof v === 'string' && ACCESSORY_VALUES.includes(v)
}

/** أي قيمة خام (قاعدة/حمولة بوابة/استيراد) → إكسسوار صالح أو 'none' */
export function toMascotAccessory(v: unknown): MascotAccessory {
  return isMascotAccessory(v) ? v : 'none'
}

/**
 * لون جسم التميمة الافتراضي عند غياب لهجة السنتر — نيلي لوحة الشخصية
 * المعتمدة (#3D4FA3 تقريباً). عند وجود لهجة سنتر صالحة تتلوّن التميمة
 * بها بدلاً منه (تُمرَّر للمكوّن كما هي بعد تحقق isValidAccent).
 */
export const MASCOT_DEFAULT_COLOR = '#3d4fa3'
