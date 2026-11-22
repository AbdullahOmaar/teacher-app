import { t } from '../../i18n'
import { createStudent, upsertEnrollment } from '../students/api'
import { fetchGroups } from '../groups/api'

// ===========================================================================
// استيراد طلاب سريع (نص) (الدفعة #7 / 3A-360 — COD-2: فُصلت من
// settings/api.ts بنقل حرفي؛ السطح العام يبقى عبر api.ts).
// ===========================================================================

// ===========================================================================
// استيراد طلاب سريع (نص) — المرجع §3.14 + §5.8: كل سطر
// «الاسم, الموبايل, اسم المجموعة»؛ المجموعة تُطابَق باحتواء الاسم
// (includes في أي اتجاه) وإلا تُستخدم أول مجموعة؛ الطالب الجديد ولي
// أمره الافتراضي «ولي أمر {أول اسم}» وبقية الحقول فارغة، وكوده يولّده
// trigger المخطط (لا أكواد تسلسلية كما حذّر المرجع §7).
// ===========================================================================

export interface QuickImportResult {
  created: number
  enrolled: number
  skippedLines: number
  errors: string[]
}

export async function quickImportStudents(
  teacherId: string,
  text: string,
): Promise<QuickImportResult> {
  const result: QuickImportResult = { created: 0, enrolled: 0, skippedLines: 0, errors: [] }
  const groups = await fetchGroups(teacherId)
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(',').map((p) => p.trim())
    const name = parts[0] ?? ''
    if (!name) {
      result.skippedLines += 1
      continue
    }
    const phone = parts[1] ? parts[1] : null
    const groupText = parts[2] ?? ''
    try {
      const student = await createStudent(teacherId, {
        name,
        grade: null,
        school: null,
        phone,
        guardian_name: t('settings.settingsApiGuardianDefault', { firstName: name.split(/\s+/)[0] }),
        guardian_phone: null,
        level_note: null,
        paused: false,
      })
      result.created += 1
      const match =
        (groupText
          ? groups.find((g) => g.name.includes(groupText) || groupText.includes(g.name))
          : undefined) ?? groups[0]
      if (match) {
        await upsertEnrollment(teacherId, {
          student_id: student.id,
          group_id: match.id,
          price_override: null,
          prepaid_sessions: null,
        })
        result.enrolled += 1
      }
    } catch (err) {
      result.errors.push(
        t('settings.settingsApiQuickImportLineError', { name, message: err instanceof Error ? err.message : t('settings.settingsApiAddFailed') }),
      )
    }
  }
  return result
}
