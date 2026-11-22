import { useRef, useState, type ChangeEvent } from 'react'
import { Card } from '../../components/ui/Card'
import { AlertTriangle, Check, ChevronDown, ChevronUp, DatabaseBackup, Download, Lock, Upload } from 'lucide-react'
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
import { t } from '../../i18n'

const BACKUP_DUE_MS = 30 * 24 * 60 * 60 * 1000

function lastExportLabel(iso: string | null | undefined): string {
  if (!iso) return t('settings.backupNoExport')
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return t('settings.backupLastExport', { date: formatDateLabel(iso.slice(0, 10)) })
}

/**
 * النسخ الاحتياطي (المواصفات §3.15 + §5.8) — الخطوة 10:
 * • تنزيل نسخة JSON كاملة لنطاق المدرس الحالي (26 جدول بيانات +
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
  const [showTables, setShowTables] = useState(false)
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
        <div className="type-section mb-1">{t('settings.backupOwnerOnlyTitle')}</div>
        <p className="text-muted text-[13.5px] mb-0">
          {t('settings.backupOwnerOnlyBody')}
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
          t('settings.backupDownloaded', { rowCount: file.rowCount, tableCount: file.tableCount, filename: file.filename }),
        ),
    })
  }

  const counts = validation?.counts ?? {}
  const countedTables = BACKUP_TABLES.filter((tok) => (counts[tok.key] ?? 0) > 0)

  return (
    <div>
      {/* حالة النسخ الاحتياطي */}
      <Card>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2"><DatabaseBackup size={22} className="text-primary" /> {t('settings.backupStatusTitle')}</h2>
        <p className="text-[13.5px] mt-0 mb-2">{lastExportLabel(lastExport)}</p>
        {backupDue ? (
          <p className="text-[13.5px] bg-warn/10 text-warn-text rounded-xl px-3 py-2 mb-0 mt-0 font-semibold">
            <span className="flex items-start gap-2"><AlertTriangle size={20} className="shrink-0" /> {t('settings.backupDueWarn')}</span>
          </p>
        ) : (
          <p className="text-[13.5px] text-muted mb-0 mt-0">
            {t('settings.backupFresh')}
          </p>
        )}
      </Card>

      {/* عمل نسخة */}
      <Card>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2"><Download size={22} className="text-primary" /> {t('settings.backupCreateTitle')}</h2>
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          {t('settings.backupContentsIntro')}
        </p>
        {/* قائمة الجداول مطوية خلف قسم قابل للطي (و-10) بدل فقرة
            جدار-نص بأسماء 26 جدولاً في سطر الكلام */}
        <button
          type="button"
          onClick={() => setShowTables((v) => !v)}
          aria-expanded={showTables}
          className="w-full flex items-center gap-2 bg-soft border border-border rounded-xl px-3 min-h-[44px] cursor-pointer text-text mb-3"
        >
          <span className="font-semibold text-[13.5px] flex-1 text-start">
            {t('settings.backupTablesToggle', { count: BACKUP_TABLES.length })}
          </span>
          {showTables ? (
            <ChevronUp size={18} className="text-muted shrink-0" />
          ) : (
            <ChevronDown size={18} className="text-muted shrink-0" />
          )}
        </button>
        {showTables && (
          <div className="text-[13.5px] mb-3">
            {BACKUP_TABLES.map((tok) => (
              <div key={tok.key} className="py-1 border-b border-border last:border-b-0">
                {tok.label}
              </div>
            ))}
          </div>
        )}
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          {t('settings.backupExclusions')}
        </p>
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          {t('settings.backupProofsNote')}
        </p>
        {downloadMsg && (
          <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{downloadMsg}</p>
        )}
        {download.isError && (
          <FormError
            message={download.error instanceof Error ? download.error.message : t('settings.backupCreateFailed')}
          />
        )}
        <Button full onClick={handleDownload} disabled={download.isPending}>
          {download.isPending ? t('settings.backupPreparing') : t('settings.backupCreateAction')}
        </Button>
      </Card>

      {/* الاستعادة / الاستيراد */}
      <Card>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2"><Upload size={22} className="text-primary" /> {t('settings.backupRestoreTitle')}</h2>
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          {t('settings.restoreIntroPre')} <b>{t('settings.restoreIntroBold')}</b>{t('settings.restoreIntroPost')}
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFile}
        />
        <Button full variant="soft" onClick={() => fileRef.current?.click()}>
          {t('settings.backupChooseFile')}
        </Button>

        <div className="mt-4">
          <Field label={t('settings.backupPasteLabel')}>
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
            {t('settings.backupCheckPasted')}
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
              <span className="inline-flex items-center gap-1.5"><Check size={18} className="text-ok-text" /> {t('settings.backupValid', { version: validation.backup.version })}{' '}</span>
              {validation.backup.exported_at
                ? formatDateLabel(validation.backup.exported_at.slice(0, 10))
                : '—'}
              {validation.backup.teacher_id && validation.backup.teacher_id !== teacherId
                ? t('settings.backupFromOther')
                : ''}
            </p>
            <div className="text-[13.5px] mb-3">
              {countedTables.map((tok) => (
                <div
                  key={tok.key}
                  className="flex justify-between py-1 border-b border-border last:border-b-0"
                >
                  <span>{tok.label}</span>
                  <b>{t('settings.backupRowCount', { count: counts[tok.key] ?? 0 })}</b>
                </div>
              ))}
              {validation.hasSettings && (
                <div className="flex justify-between py-1">
                  <span>{t('settings.backupSettingsRow')}</span>
                  <b>1</b>
                </div>
              )}
            </div>
            {importer.isError && (
              <FormError
                message={
                  importer.error instanceof Error ? importer.error.message : t('settings.importFailed')
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
                  {importer.isPending ? t('settings.importing') : t('settings.backupImportConfirm')}
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1"
                  disabled={importer.isPending}
                  onClick={() => setConfirming(false)}
                >
                  {t('settings.cancel')}
                </Button>
              </div>
            ) : (
              <Button full onClick={() => setConfirming(true)}>
                {t('settings.backupImportAction')}
              </Button>
            )}
          </div>
        )}

        {/* تقرير نتيجة الاستيراد */}
        {report && (
          <div className="mt-4">
            <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0 font-semibold">
              {t('settings.backupReportSummary', { imported: report.totalImported, skipped: report.totalSkipped })}
              {report.totalFailed > 0 ? t('settings.backupReportFailed', { count: report.totalFailed }) : ''}
              {report.settingsUpdated ? t('settings.backupReportSettings') : ''}
            </p>
            <div className="text-[13.5px] mb-2">
              {report.tables
                .filter((tok) => tok.imported + tok.skipped + tok.failed > 0)
                .map((tok) => (
                  <div
                    key={tok.key}
                    className="flex justify-between gap-2 py-1 border-b border-border last:border-b-0"
                  >
                    <span>{tok.label}</span>
                    <span className="text-muted">
                      {t('settings.backupRowCounts', { imported: tok.imported, skipped: tok.skipped })}
                      {tok.failed > 0 ? t('settings.backupRowFailed', { failed: tok.failed }) : ''}
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
              {t('settings.backupImportedNote')}
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}
