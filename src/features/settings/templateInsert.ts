// ===========================================================================
// إدراج مفتاح متغير في نص قالب رسالة الإيصال عند المؤشر (ملاحظات المالك
// 2026-11-28 — بند ٣): دالة صافية بلا أي اعتماد على الـDOM — بتاخد النص
// وموضع التحديد الحالي وترجع النص الجديد وموضع المؤشر بعد الإدراج،
// والمكوّن مسؤول عن تطبيقها على الـtextarea وإرجاع التركيز والمؤشر.
// غياب تحديد صالح (المستخدم لم يلمس النص بعد) = إلحاق في الآخر.
// ===========================================================================

export function insertTemplateKey(
  text: string,
  key: string,
  selStart: number | null,
  selEnd: number | null,
): { value: string; caret: number } {
  const valid =
    selStart !== null &&
    selEnd !== null &&
    selStart >= 0 &&
    selEnd >= selStart &&
    selStart <= text.length
  if (!valid) {
    const value = text + key
    return { value, caret: value.length }
  }
  const end = Math.min(selEnd, text.length)
  const value = text.slice(0, selStart) + key + text.slice(end)
  return { value, caret: selStart + key.length }
}
