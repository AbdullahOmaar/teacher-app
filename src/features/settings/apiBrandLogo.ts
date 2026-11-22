import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import {
  BRAND_BUCKET,
  BRAND_LOGO_MAX_BYTES,
  BRAND_LOGO_MIME_EXT,
} from '../../lib/brand'

// ===========================================================================
// شعار الهوية البيضاء — bucket ‏brand-logos (الدفعة #7 / 3A-360 — COD-2:
// فُصلت من settings/api.ts بنقل حرفي؛ السطح العام يبقى عبر api.ts).
// ===========================================================================

// ---------------------------------------------------------------------------
// شعار الهوية — bucket ‏brand-logos (migration ‏0008): المسار دائماً
// «<teacher_id>/logo.<ext>»، والرفع/الاستبدال/الحذف للمالك فقط بسياسات
// Storage (لا سياسة لمساعد ولا كتابة لـ anon). الرفع يحدّث
// brand_logo_path في نفس الخطوة؛ واستبدال بامتداد مختلف يحذف الملف
// القديم حتى لا تتراكم يتامى في مجلد المدرس.
// ---------------------------------------------------------------------------

/** رفع/استبدال شعار السنتر — يعيد مسار الشعار الجديد */
export async function uploadBrandLogo(teacherId: string, file: File): Promise<string> {
  const ext = BRAND_LOGO_MIME_EXT[file.type]
  if (!ext) throw new Error(t('settings.settingsApiLogoFormatInvalid'))
  if (file.size > BRAND_LOGO_MAX_BYTES) {
    throw new Error(t('settings.settingsApiLogoTooLarge'))
  }
  const supa = db()
  const { data: current } = await supa
    .from('teacher_settings')
    .select('brand_logo_path')
    .eq('teacher_id', teacherId)
    .maybeSingle()
  const oldPath =
    (current as unknown as { brand_logo_path?: string | null } | null)?.brand_logo_path ?? null

  const path = `${teacherId}/logo.${ext}`
  const { error: upErr } = await supa.storage
    .from(BRAND_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true })
  if (upErr) throw new Error(t('settings.settingsApiLogoUploadFailedApi'))

  const { error } = await supa
    .from('teacher_settings')
    .upsert(
      { teacher_id: teacherId, brand_logo_path: path },
      { onConflict: 'teacher_id' },
    )
  if (error) throw error

  if (oldPath && oldPath !== path) {
    // تنظيف الملف القديم best-effort — فشله لا يلغي نجاح الاستبدال
    await supa.storage.from(BRAND_BUCKET).remove([oldPath]).then(
      () => {},
      () => {},
    )
  }
  return path
}

/** حذف شعار السنتر نهائياً (الملف + المسار) — السقوط للشعار الافتراضي */
export async function removeBrandLogo(teacherId: string): Promise<void> {
  const supa = db()
  const { data: current } = await supa
    .from('teacher_settings')
    .select('brand_logo_path')
    .eq('teacher_id', teacherId)
    .maybeSingle()
  const path =
    (current as unknown as { brand_logo_path?: string | null } | null)?.brand_logo_path ?? null
  const { error } = await supa
    .from('teacher_settings')
    .upsert(
      { teacher_id: teacherId, brand_logo_path: null },
      { onConflict: 'teacher_id' },
    )
  if (error) throw error
  if (path) {
    await supa.storage.from(BRAND_BUCKET).remove([path]).then(
      () => {},
      () => {},
    )
  }
}
