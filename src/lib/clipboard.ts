/**
 * نسخ نص إلى الحافظة (PAT-8 — توحيد النمط المكرر ×4).
 *
 * المواقع الأربعة السابقة (EnrolLinkCard / PortalLinkSheet /
 * StudentPortalLinkSheet / SettingsPage) كانت تكرر الشكل نفسه حرفياً:
 * writeText ← setCopied(true) + مهلة ثانيتين ← catch صامت أو خطأ خاص.
 * هذه الوحدة هي النسخة الوحيدة: ترجع true عند النجاح وfalse عند أي
 * فشل (حافظة غير متاحة / رفض الإذن / بيئة غير آمنة) — والمتصل يقرر
 * رسالته وحالته، بلا منطق نسخ مكرر في أي مكان.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = globalThis.navigator?.clipboard
    if (!clipboard) return false
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
