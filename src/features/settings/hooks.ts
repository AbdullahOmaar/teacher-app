import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TeacherSettingsRow } from '../../types/database'
import { fetchTeacherSettings } from '../auth/api'
import { HOME } from '../home/hooks'
import { INVALIDATION_SETS, invalidatePrefixes } from '../../lib/invalidate'
import {
  buildBackupDownload,
  buildCsvFile,
  downloadTextFile,
  fetchWhatsappConfig,
  importBackup,
  quickImportStudents,
  removeBrandLogo,
  sendWhatsappTest,
  setWhatsappToken,
  touchLastExportAt,
  updateMascotVisibility,
  updatePushDigestSettings,
  updateTeacherSettings,
  uploadBrandLogo,
  upsertWhatsappConfig,
  type BackupFile,
  type CsvKind,
  type TeacherSettingsInput,
  type WhatsappConfigInput,
} from './api'
import { confirmPhoneLink, requestPhoneLink } from '../auth/api'

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
      void invalidatePrefixes(qc, INVALIDATION_SETS.settings)
    },
  })
}

/**
 * حفظ إعدادات ملخص Push اليومي (0015) من بطاقة Push — تحديث جزئي
 * (تفعيل + وقت فقط) يحدّث كاش إعدادات الوحدة بصف القاعدة الجديد.
 */
export function useUpdatePushDigestSettings(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { enabled: boolean; time: string }) =>
      updatePushDigestSettings(teacherId, input),
    onSuccess: (row: TeacherSettingsRow) => {
      qc.setQueryData([SETTINGS, 'teacher-settings', teacherId], row)
      void invalidatePrefixes(qc, [SETTINGS])
    },
  })
}

/**
 * حفظ إظهار الماسكوت «دُفّي» (0028) من بطاقة «الماسكوت» — تحديث جزئي
 * (show_mascot فقط) يحدّث كاش إعدادات الوحدة بصف القاعدة الجديد، فتنعكس
 * الحالة فوراً على كل نقاط الظهور التي تقرأ نفس الكاش.
 */
export function useUpdateMascotVisibility(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (showMascot: boolean) => updateMascotVisibility(teacherId, showMascot),
    onSuccess: (row: TeacherSettingsRow) => {
      qc.setQueryData([SETTINGS, 'teacher-settings', teacherId], row)
      void invalidatePrefixes(qc, [SETTINGS])
    },
  })
}

/** إعداد واتساب السنتر (0026) — يقرأه قسم «واتساب» في الإعدادات فقط */
export function useWhatsappConfig(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [SETTINGS, 'whatsapp-config', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchWhatsappConfig(teacherId!),
  })
}

/** حفظ حقول واتساب غير السرية — يحدّث كاش القسم بالصف الجديد.
 * إبطال دقيق بمفتاح واحد مقصود (3A-377): إبطال بادئة 'settings'
 * كلها كان سيعيد جلب إعدادات المدرس وبطاقات أخرى بلا داعٍ. */
export function useUpsertWhatsappConfig(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: WhatsappConfigInput) => upsertWhatsappConfig(teacherId, input),
    onSuccess: (row) => {
      qc.setQueryData([SETTINGS, 'whatsapp-config', teacherId], row)
      void qc.invalidateQueries({ queryKey: [SETTINGS, 'whatsapp-config', teacherId] })
    },
  })
}

/**
 * كتابة/حذف التوكن (Vault) — بعده نبطّل كاش الإعداد حتى ينعكس
 * token_updated_at (حالة «محفوظ») في البطاقة فوراً.
 * (إبطال دقيق بمفتاح واحد مقصود — نفس سبب useUpsertWhatsappConfig.)
 */
export function useSetWhatsappToken(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (value: string) => setWhatsappToken(teacherId, value),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [SETTINGS, 'whatsapp-config', teacherId] })
    },
  })
}

/** إرسال كود تجريبي — بعده نبطّل الكاش لينعكس last_test_at وحدّ المعدل.
 * (إبطال دقيق بمفتاح واحد مقصود — نفس سبب useUpsertWhatsappConfig.) */
export function useSendWhatsappTest(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => sendWhatsappTest(teacherId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [SETTINGS, 'whatsapp-config', teacherId] })
    },
  })
}

/** طلب كود ربط الهاتف بالحساب (updateUser — الكود يصل عبر واتساب المدرس) */
export function useRequestPhoneLink() {
  return useMutation({
    mutationFn: (phoneE164: string) => requestPhoneLink(phoneE164),
  })
}

/**
 * تأكيد كود الربط — نجاحه يطلق حدث USER_UPDATED في AuthProvider
 * فينعكس الرقم المربوط في البطاقة تلقائياً بلا إبطال كاش يدوي.
 */
export function useConfirmPhoneLink() {
  return useMutation({
    mutationFn: (input: { phoneE164: string; code: string }) =>
      confirmPhoneLink(input.phoneE164, input.code),
  })
}

/** رفع/استبدال شعار الهوية — يبطل إعدادات الوحدة وكاش الهوية للأسطح */
export function useUploadBrandLogo(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadBrandLogo(teacherId, file),
    onSuccess: () => {
      void invalidatePrefixes(qc, INVALIDATION_SETS.settingsBrand)
    },
  })
}

/** حذف شعار الهوية — يبطل إعدادات الوحدة وكاش الهوية للأسطح */
export function useRemoveBrandLogo(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => removeBrandLogo(teacherId),
    onSuccess: () => {
      void invalidatePrefixes(qc, INVALIDATION_SETS.settingsBrand)
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
        void invalidatePrefixes(qc, [SETTINGS])
        // تنبيه النسخة في الرئيسية مفتاح فرعي دقيق ([HOME, 'alerts']) —
        // إبطال 'home' كلها كان سيعيد جلب كل بطاقات الرئيسية بلا داعٍ (3A-377)
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

/**
 * استيراد طلاب سريع من نص — يبطل كاش الطلاب/المجموعات والرئيسية (نفس عقد
 * الاستيراد الملفّي)؛ الاستيراد ينشئ طلاباً وتسجيلات فتُستخدم مجموعة
 * الطلاب الكاملة (INVALIDATION_SETS.students) لا [SG, HOME] وحدهما.
 */
export function useQuickImportStudents(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (text: string) => quickImportStudents(teacherId, text),
    onSuccess: () => {
      void invalidatePrefixes(qc, INVALIDATION_SETS.students)
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
