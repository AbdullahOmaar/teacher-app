// ===========================================================================
// مشترك داخلي لوحدة الإعدادات — ثوابت وأدوات تستخدمها وحدات api* المفصولة
// (الدفعة #7 / 3A-360 — COD-2: تقسيم settings/api.ts بحسب الأقسام، نقل
// حرفي). لا تُستورد هذه الوحدة إلا من وحدات الإعدادات نفسها؛ السطح العام
// للوحدة يبقى api.ts كما هو.
// ===========================================================================

export const SETTINGS_COLS =
  'teacher_id, whatsapp_template, center_share_percent, reminder_minutes, theme, brand_name, brand_logo_path, brand_accent, push_daily_digest_enabled, push_daily_digest_time, push_daily_digest_last_sent_on, mascot_accessory, show_mascot, portal_link_ttl_days, portal_guardian_show_attendance, portal_guardian_show_scores, portal_guardian_show_notes, portal_guardian_show_money, portal_guardian_show_groups, portal_student_show_schedule, portal_student_show_homework, portal_student_show_grades, portal_student_show_money, last_export_at, created_at, updated_at'

export function todayFileStamp(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// ---------------------------------------------------------------------------
// قراءة مُصفّحة — PostgREST يحدّ النتيجة بـ 1000 صف افتراضياً، والتصدير
// والنسخة لازم يكونا كاملين مهما كبرت البيانات.
// ---------------------------------------------------------------------------

export interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
}

export async function fetchPaged<T>(
  run: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await run(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}
