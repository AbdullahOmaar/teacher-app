import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import { isValidAccent } from '../../lib/brand'
import type { TeacherSettingsRow } from '../../types/database'
import type { ThemeMode } from '../../hooks/useTheme'
import { SETTINGS_COLS } from './apiShared'

// ===========================================================================
// قلب إعدادات المدرس — teacher_settings (الدفعة #7 / 3A-360 — COD-2:
// فُصلت من settings/api.ts بنقل حرفي؛ السطح العام يبقى عبر api.ts).
// ===========================================================================

export const THEME_MODES: { code: ThemeMode; label: string }[] = [
  { code: 'auto', label: t('settings.settingsApiThemeAuto') },
  { code: 'light', label: t('settings.settingsApiThemeLight') },
  { code: 'dark', label: t('settings.settingsApiThemeDark') },
]

export const REMINDER_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 0, label: t('settings.settingsApiReminderNone') },
  { minutes: 15, label: t('settings.settingsApiReminder15') },
  { minutes: 30, label: t('settings.settingsApiReminder30') },
  { minutes: 60, label: t('settings.settingsApiReminder60') },
]

export const REMINDER_VALUES = [0, 15, 30, 60]

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'auto' || v === 'light' || v === 'dark'
}

// ---------------------------------------------------------------------------
// إعدادات المدرس — teacher_settings (صف واحد لكل مدرس، RLS للمالك فقط)
// ---------------------------------------------------------------------------

export interface TeacherSettingsInput {
  whatsapp_template: string
  center_share_percent: number
  reminder_minutes: number
  theme: ThemeMode
  /** الهوية البيضاء (0008) — كلها اختيارية: null = هوية التطبيق الافتراضية */
  brand_name: string | null
  brand_logo_path: string | null
  brand_accent: string | null
  /**
   * ملخص Push اليومي (0015) — اختياريان هنا لأن الحفظ الكامل للإعدادات
   * قد يأتي من شاشات لا تعرفهما؛ غيابهما = إبقاء قيم القاعدة كما هي
   * (انظر updateTeacherSettings)، وبطاقة Push تحفظهما منفصلين عبر
   * updatePushDigestSettings. الوقت بصيغة 'HH:MM' بتوقيت القاهرة.
   */
  push_daily_digest_enabled?: boolean
  push_daily_digest_time?: string
}

/** وقت ملخص صالح؟ 'HH:MM' (24 ساعة) — نفس ما يقبله عمود time في القاعدة */
export function isValidDigestTime(v: unknown): v is string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
}

/** حفظ الإعدادات القابلة للتحرير — upsert آمن التكرار على مفتاح teacher_id */
export async function updateTeacherSettings(
  teacherId: string,
  input: TeacherSettingsInput,
): Promise<TeacherSettingsRow> {
  const tpl = input.whatsapp_template.trim()
  if (!tpl) throw new Error(t('settings.settingsApiWaTemplateEmpty'))
  if (
    !Number.isFinite(input.center_share_percent) ||
    input.center_share_percent < 0 ||
    input.center_share_percent > 100
  ) {
    throw new Error(t('settings.settingsApiCentreShareRange'))
  }
  if (!REMINDER_VALUES.includes(input.reminder_minutes)) {
    throw new Error(t('settings.settingsApiReminderInvalid'))
  }
  if (!isThemeMode(input.theme)) throw new Error(t('settings.settingsApiThemeInvalid'))

  // الهوية البيضاء: الاسم يُقصّ (فارغ = null = افتراضي) وبحد أقصى 80 حرفاً
  // (نفس قيد المخطط)، واللهجة #RRGGBB فقط أو null — التحقق هنا حتى لا
  // تصل قيمة مكسورة لأي سطح عرض (كارت/إيصال/بوابة).
  const brandName = input.brand_name?.trim() ? input.brand_name.trim() : null
  if (brandName && brandName.length > 80) {
    throw new Error(t('settings.settingsApiBrandNameTooLong'))
  }
  const brandAccent =
    input.brand_accent == null ? null : input.brand_accent.trim().toLowerCase()
  if (brandAccent !== null && !isValidAccent(brandAccent)) {
    throw new Error(t('settings.settingsApiAccentInvalid'))
  }
  const brandLogoPath = input.brand_logo_path?.trim()
    ? input.brand_logo_path.trim()
    : null
  // مسار الشعار لا يُقبل إلا داخل مجلد المدرس نفسه (نفس قيد سياسات Storage)
  if (brandLogoPath && !brandLogoPath.startsWith(`${teacherId}/`)) {
    throw new Error(t('settings.settingsApiLogoPathInvalid'))
  }

  if (
    input.push_daily_digest_time !== undefined &&
    !isValidDigestTime(input.push_daily_digest_time)
  ) {
    throw new Error(t('settings.settingsApiDigestTimeInvalid'))
  }

  const { data, error } = await db()
    .from('teacher_settings')
    .upsert(
      {
        teacher_id: teacherId,
        whatsapp_template: tpl,
        center_share_percent: input.center_share_percent,
        reminder_minutes: input.reminder_minutes,
        theme: input.theme,
        brand_name: brandName,
        brand_logo_path: brandLogoPath,
        brand_accent: brandAccent,
        // ملخص Push اليومي (0015): يُكتب فقط إن مرّره المستدعي صراحة —
        // غيابه يبقي قيمة القاعدة (upsert يكتب الأعمدة الممرّرة فقط)
        ...(input.push_daily_digest_enabled !== undefined
          ? { push_daily_digest_enabled: input.push_daily_digest_enabled }
          : {}),
        ...(input.push_daily_digest_time !== undefined
          ? { push_daily_digest_time: input.push_daily_digest_time }
          : {}),
      },
      { onConflict: 'teacher_id' },
    )
    .select(SETTINGS_COLS)
    .single()
  if (error) throw error
  const row = data
  return { ...row, center_share_percent: Number(row.center_share_percent) || 0 }
}

/**
 * حفظ إعدادات ملخص Push اليومي وحدها (0015) — upsert جزئي بنمط
 * touchLastExportAt: يكتب التفعيل والوقت فقط ولا يمسّ أي عمود آخر،
 * وpush_daily_digest_last_sent_on لا يُكتب من العميل أبداً (علامة
 * ادعاء يديرها مرسِل الملخص في القاعدة لمنع التكرار).
 */
export async function updatePushDigestSettings(
  teacherId: string,
  input: { enabled: boolean; time: string },
): Promise<TeacherSettingsRow> {
  if (!isValidDigestTime(input.time)) {
    throw new Error(t('settings.settingsApiDigestTimeInvalid'))
  }
  const { data, error } = await db()
    .from('teacher_settings')
    .upsert(
      {
        teacher_id: teacherId,
        push_daily_digest_enabled: input.enabled,
        push_daily_digest_time: input.time,
      },
      { onConflict: 'teacher_id' },
    )
    .select(SETTINGS_COLS)
    .single()
  if (error) throw error
  const row = data
  return { ...row, center_share_percent: Number(row.center_share_percent) || 0 }
}

/**
 * حفظ إظهار الماسكوت «دُفّي» وحده (0028 — MASCOT-PLAN §٦) — upsert
 * جزئي بنمط updatePushDigestSettings: يكتب show_mascot فقط ولا يمسّ
 * أي عمود آخر. عند الإيقاف يختفي دُفّي من كل نقاط الظهور ويرجع لوجو
 * التحميل/السبلاش للكتاب الأصلي (انظر components/mascot).
 */
export async function updateMascotVisibility(
  teacherId: string,
  showMascot: boolean,
): Promise<TeacherSettingsRow> {
  const { data, error } = await db()
    .from('teacher_settings')
    .upsert({ teacher_id: teacherId, show_mascot: showMascot }, { onConflict: 'teacher_id' })
    .select(SETTINGS_COLS)
    .single()
  if (error) throw error
  const row = data
  return { ...row, center_share_percent: Number(row.center_share_percent) || 0 }
}

/**
 * تحديث last_export_at لدلوقتي — عقد تنبيه النسخ الاحتياطي (§5.7):
 * يُستدعى بعد نجاح أي تصدير CSV أو تنزيل نسخة JSON فقط، لا عند الفشل.
 * upsert حتى يعمل إن لم يوجد صف إعدادات بعد (بقية الأعمدة لها defaults).
 */
export async function touchLastExportAt(teacherId: string): Promise<void> {
  const { error } = await db()
    .from('teacher_settings')
    .upsert(
      { teacher_id: teacherId, last_export_at: new Date().toISOString() },
      { onConflict: 'teacher_id' },
    )
  if (error) throw error
}
