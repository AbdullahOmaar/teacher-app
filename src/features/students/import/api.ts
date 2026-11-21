import { supabase } from '../../../lib/supabase'
import type { StudentInput, StudentRow } from '../../../types/database'
import { createStudent, upsertEnrollment } from '../api'
import type { ClassifiedRow } from './logic'
import { t } from '../../../i18n'

/**
 * حفظ الاستيراد من الملف — يعيد استخدام مسارات وحدة الطلاب حرفياً:
 * إنشاء الطالب عبر createStudent، والتسجيل عبر upsertEnrollment
 * (نفس دوال الاستيراد النصي السريع ونموذج الطالب).
 * الاستثناء الوحيد الموثّق: إن حمل الصف كوداً غير مكرر، يُدرج الطالب
 * بنفس أعمدة createStudent + ‏public_code صراحة (الـ trigger في المخطط
 * يحترم الكود المُمرَّر ولا يولّد غيره إلا عند الفراغ) — حتى يتوافق
 * التصدير ثم الاستيراد ذهاباً وإياباً بلا فقدان أكواد.
 * فشل أي صف (إنشاء أو تسجيل) لا يوقف بقية الصفوف أبداً.
 */

export interface FileImportItem {
  classified: ClassifiedRow
  /** تضمين صف مكرر قسراً باختيار المدرس في المعاينة */
  includeDuplicate: boolean
}

export interface FileImportResult {
  created: number
  enrolled: number
  skipped: number
  failed: number
  errors: string[]
}

const STUDENT_COLS =
  'id, teacher_id, public_code, name, grade, school, paused, phone, guardian_name, guardian_phone, level_note, created_at, updated_at'

async function createStudentWithCode(
  teacherId: string,
  input: StudentInput,
  code: string,
): Promise<StudentRow> {
  if (!supabase) throw new Error(t('students.impApiSupabaseNotLinked'))
  const { data, error } = await supabase
    .from('students')
    .insert({ teacher_id: teacherId, public_code: code, ...input })
    .select(STUDENT_COLS)
    .single()
  if (error) throw error
  return data as unknown as StudentRow
}

export async function importStudentsFromFile(
  teacherId: string,
  items: FileImportItem[],
  groupId: string | null,
): Promise<FileImportResult> {
  const result: FileImportResult = { created: 0, enrolled: 0, skipped: 0, failed: 0, errors: [] }

  for (const item of items) {
    const { row, status, price_override } = item.classified
    const shouldImport =
      status === 'ready' || (status === 'duplicate' && item.includeDuplicate)
    if (!shouldImport) {
      result.skipped += 1
      continue
    }
    // ولي الأمر الافتراضي مثل الاستيراد النصي (§5.8): «ولي أمر {أول اسم}»
    const input: StudentInput = {
      name: row.name,
      grade: row.grade,
      school: row.school,
      phone: row.phone,
      guardian_name: row.guardian_name ?? t('students.impApiGuardianDefault', { firstName: row.name.split(/\s+/)[0] }),
      guardian_phone: row.guardian_phone,
      level_note: row.level_note,
      paused: false,
    }
    try {
      const student = row.code
        ? await createStudentWithCode(teacherId, input, row.code)
        : await createStudent(teacherId, input)
      result.created += 1
      if (groupId) {
        try {
          await upsertEnrollment(teacherId, {
            student_id: student.id,
            group_id: groupId,
            price_override,
            prepaid_sessions: null,
          })
          result.enrolled += 1
        } catch (err) {
          result.errors.push(
            t('students.impApiEnrollFailed', { name: row.name, message: err instanceof Error ? err.message : t('students.impApiUnknownError') }),
          )
        }
      }
    } catch (err) {
      result.failed += 1
      result.errors.push(
        t('students.impApiRowFailed', { row: row.rowNumber, name: row.name, message: err instanceof Error ? err.message : t('students.impApiAddFailed') }),
      )
    }
  }
  return result
}
