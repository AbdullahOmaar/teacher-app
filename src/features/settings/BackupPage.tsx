import { useRef, useState, type ChangeEvent } from 'react'
import { Card } from '../../components/ui/Card'
import { AlertTriangle, Check, DatabaseBackup, Download, Lock, Upload } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Field, FormError, TextArea } from '../../components/ui/form'
import { LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatDateLabel } from '../schedule/api'
import {
  BACKUP_TABLES,
  parseBackupJson,
  type BackupValidation,
  type ImportReport,
} from './api'
import { useDownloadBackup, useImportBackup, useTeacherSettings } from './hooks'

const BACKUP_DUE_MS = 30 * 24 * 60 * 60 * 1000

function lastExportLabel(iso: string | null | undefined): string {
  if (!iso) return 'لسه معملتش أي تصدير أو نسخة احتياطية'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `آخر تصدير/نسخة: ${formatDateLabel(iso.slice(0, 10))}`
}

/**
 * النسخ الاحتياطي (المواصفات §3.15 + §5.8) — الخطوة 10:
 * • تنزيل نسخة JSON كاملة لنطاق المدرس الحالي (21 جدول بيانات +
 *   إعداداته — النطاق والمستثنيات موثّقة في api.ts)، وتحديث
 *   last_export_at بعد التنزيل (يُطفئ تنبيه الـ 30 يوماً).
 * • الاستعادة = استيراد آمن بالدمج: تحقق من البنية والإصدار أولاً
 *   (قراءة جافة بلا أي كتابة)، عرض ملخص المحتوى، تأكيد صريح، ثم
 *   إدراج الجديد فقط داخل حساب المدرس الحالي وتخطّي الموجود —
 *   السلوك كاملاً موثّق في ترويسة importBackup في api.ts.
 * للمالك فقط بنمط قفل شاشة الفلوس (النسخة تشمل المالية كلها).
 */
export function BackupPage() {
  const teacher = useCurrentTeacher()
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : ''

  const settingsQ = useTeacherSettings(teacherId || undefined, isOwner)
  const download = useDownloadBackup(teacherId)
  const importer = useImportBackup(teacherId)

  const fileRef = useRef<HTMLInputElement>(null)
  const [pasteText, setPasteText] = useState('')
  const [validation, setValidation] = useState<BackupValidation | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null)
  const [nowMs] = useState(() => Date.now())

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  if (!isOwner) {
    return (
      <Card className="text-center py-10">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
          <Lock size={28} />
        </div>
        <div className="type-section mb-1">النسخ الاحتياطي للمالك فقط</div>
        <p className="text-muted text-[13.5px] mb-0">
          النسخة الاحتياطية فيها كل بيانات الحساب بما فيها المالية، وهي محجوبة عن حساب المساعد في
          قاعدة البيانات نفسها (RLS) وليس في الواجهة فقط.
        </p>
      </Card>
    )
  }

  const lastExport = settingsQ.data?.last_export_at ?? null
  const backupDue =
    !lastExport || nowMs - new Date(lastExport).getTime() >= BACKUP_DUE_MS

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const text = await file.text()
    setReport(null)
    setConfirming(false)
    setValidation(parseBackupJson(text))
  }

  const handlePasteCheck = () => {
    setReport(null)
    setConfirming(false)
    setValidation(parseBackupJson(pasteText))
  }

  const handleImport = () => {
    if (!validation?.ok || !validation.backup) return
    importer.mutate(validation.backup, {
      onSuccess: (res) => {
        setReport(res)
        setValidation(null)
        setConfirming(false)
        setPasteText('')
      },
    })
  }

  const handleDownload = () => {
    setDownloadMsg(null)
    download.mutate(undefined, {
      onSuccess: (file) =>
        setDownloadMsg(
          `تم تنزيل النسخة — ${file.rowCount} صف من ${file.tableCount} جدول + إعداداتك (${file.filename}) احفظ الملف في مكان آمن.`,
        ),
    })
  }

  const counts = validation?.counts ?? {}
  const countedTables = BACKUP_TABLES.filter((t) => (counts[t.key] ?? 0) > 0)

  return (
    <div>
      {/* حالة النسخ الاحتياطي */}
      <Card>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2"><DatabaseBackup size={22} className="text-primary" /> حالة النسخ الاحتياطي</h2>
        <p className="text-[13.5px] mt-0 mb-2">{lastExportLabel(lastExport)}</p>
        {backupDue ? (
          <p className="text-[13.5px] bg-warn/10 text-warn-text rounded-xl px-3 py-2 mb-0 mt-0 font-semibold">
            <span className="flex items-start gap-2"><AlertTriangle size={20} className="shrink-0" /> مفيش نسخة احتياطية حديثة — اعمل نسخة دلوقتي واحفظها بره التطبيق (ملفاتك أو بريدك).</span>
          </p>
        ) : (
          <p className="text-[13.5px] text-muted mb-0 mt-0">
            النسخة حديثة (أقل من 30 يوم) — تنبيه النسخ الاحتياطي هيظهر تاني بعد 30 يوم من آخر
            تصدير.
          </p>
        )}
      </Card>

      {/* عمل نسخة */}
      <Card>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2"><Download size={22} className="text-primary" /> عمل نسخة احتياطية الآن</h2>
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          ملف JSON واحد فيه: {BACKUP_TABLES.map((t) => t.label).join('، ')}، وإعدادات المدرس.
          مش داخل في النسخة: فريق المساعدين وروابط بوابة ولي الأمر (بتتعمل من جديد عند الحاجة) —
          وبياناتك محفوظة سحابياً أصلاً، النسخة دي طبقة أمان إضافية في إيدك.
        </p>
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          تنبيه عن إثباتات الدفع: النسخة فيها صفوف الإثباتات (المبلغ والطريقة والحالة) بس —
          صور الإثباتات نفسها محفوظة في مخزن ملفات منفصل (Storage) ومش جزء من ملف JSON، فلو
          استعدت النسخة على حساب أو بيئة جديدة هتلاقي بيانات الإثباتات موجودة لكن صورها ممكن
          متظهرش هناك لأن مساراتها بتشير لملفات مش منقولة مع النسخة.
        </p>
        {downloadMsg && (
          <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{downloadMsg}</p>
        )}
        {download.isError && (
          <FormError
            message={download.error instanceof Error ? download.error.message : 'تعذّر إنشاء النسخة.'}
          />
        )}
        <Button full onClick={handleDownload} disabled={download.isPending}>
          {download.isPending ? 'جارٍ تجهيز النسخة…' : 'عمل نسخة الآن وتنزيلها'}
        </Button>
      </Card>

      {/* الاستعادة / الاستيراد */}
      <Card>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2"><Upload size={22} className="text-primary" /> استعادة من نسخة</h2>
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          الاستيراد <b>بيضيف الجديد بس</b>: أي صف موجود عندك بنفس المعرّف بيتخطى، ومفيش أي حذف أو
          كتابة فوق بياناتك الحالية أو أي حساب تاني — كل حاجة بتتزرع في حسابك إنت بس. الأول
          بنتحقق من الملف ونوريك ملخصه، وبعدين بتأكد بنفسك قبل أي كتابة.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFile}
        />
        <Button full variant="soft" onClick={() => fileRef.current?.click()}>
          اختيار ملف نسخة (JSON)
        </Button>

        <div className="mt-4">
          <Field label="أو الصق نص النسخة هنا">
            <TextArea
              rows={4}
              dir="ltr"
              placeholder='{"format": "teacher-app-backup", ...}'
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
          </Field>
          <Button
            full
            variant="ghost"
            onClick={handlePasteCheck}
            disabled={!pasteText.trim()}
          >
            التحقق من النسخة الملصوقة
          </Button>
        </div>

        {/* نتيجة التحقق */}
        {validation && !validation.ok && (
          <div className="mt-4 text-[13.5px] bg-bad/5 text-bad-text rounded-xl px-3 py-2">
            {validation.errors.map((e, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                {e}
              </div>
            ))}
          </div>
        )}
        {validation?.ok && validation.backup && (
          <div className="mt-4">
            <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">
              <span className="inline-flex items-center gap-1.5"><Check size={18} className="text-ok-text" /> النسخة سليمة — إصدار {validation.backup.version} · صُدّرت{' '}</span>
              {validation.backup.exported_at
                ? formatDateLabel(validation.backup.exported_at.slice(0, 10))
                : '—'}
              {validation.backup.teacher_id && validation.backup.teacher_id !== teacherId
                ? ' · من حساب تاني — هتتزرع في حسابك الحالي بمعرّفاتها'
                : ''}
            </p>
            <div className="text-[13.5px] mb-3">
              {countedTables.map((t) => (
                <div
                  key={t.key}
                  className="flex justify-between py-1 border-b border-border last:border-b-0"
                >
                  <span>{t.label}</span>
                  <b>{counts[t.key]} صف</b>
                </div>
              ))}
              {validation.hasSettings && (
                <div className="flex justify-between py-1">
                  <span>إعدادات المدرس (هتندمج في إعداداتك)</span>
                  <b>1</b>
                </div>
              )}
            </div>
            {importer.isError && (
              <FormError
                message={
                  importer.error instanceof Error ? importer.error.message : 'تعذّر الاستيراد.'
                }
              />
            )}
            {confirming ? (
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  className="flex-1"
                  disabled={importer.isPending}
                  onClick={handleImport}
                >
                  {importer.isPending ? 'جارٍ الاستيراد…' : 'أيوه، استورد دلوقتي'}
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1"
                  disabled={importer.isPending}
                  onClick={() => setConfirming(false)}
                >
                  إلغاء
                </Button>
              </div>
            ) : (
              <Button full onClick={() => setConfirming(true)}>
                استيراد النسخة (تخطّي الموجود)
              </Button>
            )}
          </div>
        )}

        {/* تقرير نتيجة الاستيراد */}
        {report && (
          <div className="mt-4">
            <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0 font-semibold">
              خلص الاستيراد — أُضيف {report.totalImported} صف جديد · اتخطى {report.totalSkipped}{' '}
              موجود بالفعل
              {report.totalFailed > 0 ? ` · فشل ${report.totalFailed} صف` : ''}
              {report.settingsUpdated ? ' · إعدادات المدرس اتحدثت' : ''}
            </p>
            <div className="text-[13.5px] mb-2">
              {report.tables
                .filter((t) => t.imported + t.skipped + t.failed > 0)
                .map((t) => (
                  <div
                    key={t.key}
                    className="flex justify-between gap-2 py-1 border-b border-border last:border-b-0"
                  >
                    <span>{t.label}</span>
                    <span className="text-muted">
                      +{t.imported} جديد · {t.skipped} متخطى
                      {t.failed > 0 ? ` · ${t.failed} فشل` : ''}
                    </span>
                  </div>
                ))}
            </div>
            {report.errorSamples.length > 0 && (
              <div className="text-[12px] text-bad-text bg-bad/5 rounded-xl px-3 py-2">
                {report.errorSamples.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
            <p className="text-[12px] text-muted mb-0">
              تم تحديث كل شاشات التطبيق بالبيانات المستوردة تلقائياً.
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}
