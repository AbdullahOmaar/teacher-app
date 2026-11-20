import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TeacherSettingsRow } from '../../types/database'
import { fetchTeacherSettings } from '../auth/api'
import { HOME } from '../home/hooks'
import { INV } from '../invoices/hooks'
import { MONEY } from '../money/hooks'
import { SG } from '../students/hooks'
import {
  buildBackupDownload,
  buildCsvFile,
  downloadTextFile,
  importBackup,
  quickImportStudents,
  touchLastExportAt,
  updateTeacherSettings,
  type BackupFile,
  type CsvKind,
  type TeacherSettingsInput,
} from './api'

/** كل مفاتيح وحدة الإعدادات/التصدير تبدأ بـ 'settings' */
export const SETTINGS = 'settings'

export function useTeacherSettings(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [SETTINGS, 'teacher-settings', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchTeacherSettings(teacherId!),
  })
}

/**
 * حفظ الإعدادات يبطل: إعدادات هذه الوحدة، كاش الفلوس (نسبة السنتر تدخل
 * view ‏monthly_profit)، وكاش الفواتير (قالب الواتساب يقرؤه مودال الإيصال)،
 * وكاش الرئيسية (بطاقة التنبيهات/المحصّل تتأثر بنسبة السنتر).
 */
export function useUpdateTeacherSettings(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TeacherSettingsInput) => updateTeacherSettings(teacherId, input),
    onSuccess: (row: TeacherSettingsRow) => {
      qc.setQueryData([SETTINGS, 'teacher-settings', teacherId], row)
      void qc.invalidateQueries({ queryKey: [SETTINGS] })
      void qc.invalidateQueries({ queryKey: [MONEY] })
      void qc.invalidateQueries({ queryKey: [INV] })
      void qc.invalidateQueries({ queryKey: [HOME] })
    },
  })
}

/**
 * بعد أي تصدير/نسخة ناجح: تحديث last_export_at يغيّر تنبيه backup في
 * الرئيسية والإشعارات (نفس مفتاح كاش [HOME, 'alerts'…])، فنبطلهما مع
 * إعدادات هذه الوحدة حتى تنطفي الشارة فوراً.
 */
function useAfterSuccessfulExport() {
  const qc = useQueryClient()
  return (teacherId: string) => {
    void touchLastExportAt(teacherId)
      .catch(() => {
        // فشل تحديث الطابع لا يلغي نجاح التنزيل نفسه — التنبيه سيبقى
        // ظاهراً حتى التصدير التالي، وهو السلوك الآمن.
      })
      .finally(() => {
        void qc.invalidateQueries({ queryKey: [SETTINGS] })
        void qc.invalidateQueries({ queryKey: [HOME, 'alerts'] })
      })
  }
}

/** تصدير CSV لجدول واحد: بناء → تنزيل فعلي → تحديث last_export_at */
export function useExportCsv(teacherId: string) {
  const afterExport = useAfterSuccessfulExport()
  return useMutation({
    mutationFn: async (kind: CsvKind) => {
      const file = await buildCsvFile(teacherId, kind)
      downloadTextFile(file.filename, file.content, 'text/csv;charset=utf-8')
      return file
    },
    onSuccess: () => afterExport(teacherId),
  })
}

/** تنزيل نسخة JSON كاملة: بناء → تنزيل فعلي → تحديث last_export_at */
export function useDownloadBackup(teacherId: string) {
  const afterExport = useAfterSuccessfulExport()
  return useMutation({
    mutationFn: async () => {
      const file = await buildBackupDownload(teacherId)
      downloadTextFile(file.filename, file.content, 'application/json;charset=utf-8')
      return file
    },
    onSuccess: () => afterExport(teacherId),
  })
}

/** استيراد طلاب سريع من نص — يبطل كاش الطلاب/المجموعات والرئيسية */
export function useQuickImportStudents(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (text: string) => quickImportStudents(teacherId, text),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [SG] })
      void qc.invalidateQueries({ queryKey: [HOME] })
    },
  })
}

/**
 * استيراد نسخة JSON — بعده تُبطل كل كاشات الاستعلامات في التطبيق
 * (invalidateQueries بلا مفتاح) لأن الاستيراد قد يمس أي وحدة.
 */
export function useImportBackup(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (backup: BackupFile) => importBackup(teacherId, backup),
    onSuccess: () => {
      void qc.invalidateQueries()
    },
  })
}
