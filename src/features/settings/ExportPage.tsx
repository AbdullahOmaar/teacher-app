import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Banknote, Calculator, CalendarCheck2, DatabaseBackup, FileDown, FileSpreadsheet, FileUp, Lock, NotebookPen, ReceiptText, Users, type LucideIcon } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Field, FormError, TextArea } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { CSV_KINDS, type CsvKind } from './api'
import { useExportCsv, useQuickImportStudents } from './hooks'
import { t } from '../../i18n'

/**
 * تصدير واستيراد (المواصفات §3.14 + §5.8) — الخطوة 10:
 * • تصدير CSV للجداول الستة (الخمسة في المرجع + الطلاب) كملفات تُنزَّل
 *   فعلياً من المتصفح بترميز UTF-8 BOM حتى تفتح سليمة في Excel العربي،
 *   وكل تنزيل ناجح يحدّث teacher_settings.last_export_at (عقد تنبيه
 *   النسخ الاحتياطي في الرئيسية/الإشعارات).
 * • استيراد طلاب سريع من نص «الاسم, الموبايل, المجموعة» لكل سطر.
 * • النسخة الاحتياطية JSON الكاملة واستيرادها في شاشة /backup.
 * الشاشة للمالك فقط بنمط قفل شاشة الفلوس: جداول التصدير تشمل المالية
 * (فواتير/دفعات/مصروفات) المحجوبة عن المساعد في RLS نفسها.
 */
const KIND_ICONS: Record<CsvKind, LucideIcon> = {
  students: Users,
  invoices: ReceiptText,
  payments: Banknote,
  attendance: CalendarCheck2,
  scores: NotebookPen,
  expenses: Calculator,
}

export function ExportPage() {
  const teacher = useCurrentTeacher()
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : ''

  const exportCsv = useExportCsv(teacherId)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [lastKind, setLastKind] = useState<{ kind: CsvKind; label: string } | null>(null)
  const [exportErr, setExportErr] = useState<string | null>(null)

  const [importText, setImportText] = useState('')
  const quickImport = useQuickImportStudents(teacherId)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!exportMsg && !importMsg) return
    const tok = setTimeout(() => {
      setExportMsg(null)
      setImportMsg(null)
    }, 6000)
    return () => clearTimeout(tok)
  }, [exportMsg, importMsg])

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  if (!isOwner) {
    return (
      <Card className="text-center py-10">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
          <Lock size={28} />
        </div>
        <div className="type-section mb-1">{t('settings.exportOwnerOnlyTitle')}</div>
        <p className="text-muted text-[13.5px] mb-0">
          {t('settings.exportOwnerOnlyBody')}
        </p>
      </Card>
    )
  }

  const handleExport = (kind: CsvKind, label: string) => {
    setLastKind({ kind, label })
    setExportMsg(null)
    setExportErr(null)
    exportCsv.mutate(kind, {
      onSuccess: (file) =>
        setExportMsg(t('settings.exportDownloaded', { label, rowCount: file.rowCount, filename: file.filename })),
      onError: (err) =>
        setExportErr(err instanceof Error ? err.message : t('settings.exportCreateFailed')),
    })
  }

  const handleQuickImport = () => {
    setImportMsg(null)
    quickImport.mutate(importText, {
      onSuccess: (res) => {
        const parts = [t('settings.importCreated', { count: res.created })]
        if (res.enrolled > 0) parts.push(t('settings.importEnrolled', { count: res.enrolled }))
        if (res.skippedLines > 0) parts.push(t('settings.importSkipped', { count: res.skippedLines }))
        if (res.errors.length > 0) parts.push(t('settings.importFailedLines', { count: res.errors.length }))
        setImportMsg(parts.join(t('settings.joinSeparator')))
        if (res.created > 0) setImportText('')
      },
    })
  }

  const pendingKind = exportCsv.isPending ? exportCsv.variables : undefined

  return (
    <div>
      <Card>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2"><FileUp size={22} className="text-primary" /> {t('settings.exportCsvTitle')}</h2>
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          {t('settings.exportCsvIntro')}
        </p>
        {exportMsg && (
          <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{exportMsg}</p>
        )}
        {exportErr && (
          <div className="mb-3">
            <ErrorState
              message={exportErr}
              onRetry={
                lastKind ? () => handleExport(lastKind.kind, lastKind.label) : undefined
              }
            />
          </div>
        )}
        {CSV_KINDS.map((item) => (
          <div
            key={item.kind}
            className="flex items-center gap-3 py-2.5 border-b border-border last:border-b-0"
          >
            <span className="w-10 h-10 rounded-xl bg-soft text-primary flex items-center justify-center shrink-0">
              {(() => {
                const KindIcon = KIND_ICONS[item.kind]
                return <KindIcon size={24} />
              })()}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-[15px]">{item.label}</span>
              <span className="block text-muted text-[12px]">{item.hint}</span>
            </span>
            <Button
              variant="soft"
              className="min-h-[48px] px-3 text-[13.5px] shrink-0"
              disabled={exportCsv.isPending}
              onClick={() => handleExport(item.kind, item.label)}
            >
              {pendingKind === item.kind ? t('settings.exportPreparing') : t('settings.download')}
            </Button>
          </div>
        ))}
      </Card>

      <Card>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2"><FileDown size={22} className="text-primary" /> {t('settings.quickImportTitle')}</h2>
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          {t('settings.quickIntroPre')} <b>{t('settings.quickIntroFormat')}</b> {t('settings.quickIntroPost')}
        </p>
        <Field label={t('settings.quickImportListLabel')}>
          <TextArea
            rows={6}
            dir="auto"
            placeholder={t('settings.quickImportPlaceholder')}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
        </Field>
        {importMsg && (
          <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{importMsg}</p>
        )}
        {quickImport.isError && (
          <FormError
            message={quickImport.error instanceof Error ? quickImport.error.message : t('settings.importFailed')}
          />
        )}
        {quickImport.data && quickImport.data.errors.length > 0 && (
          <div className="text-[12px] text-bad-text bg-bad/5 rounded-xl px-3 py-2 mb-3">
            {quickImport.data.errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
        <Button
          full
          onClick={handleQuickImport}
          disabled={quickImport.isPending || !importText.trim()}
        >
          {quickImport.isPending ? t('settings.importing') : t('settings.quickImportAction')}
        </Button>
      </Card>

      <Card>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2"><FileSpreadsheet size={22} className="text-primary" /> {t('settings.fileImportTitle')}</h2>
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          {t('settings.fileImportIntro')}
        </p>
        <Link to="/students?import=1">
          <Button full variant="soft">
            {t('settings.fileImportOpen')}
          </Button>
        </Link>
      </Card>

      <Card>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2"><DatabaseBackup size={22} className="text-primary" /> {t('settings.backupCardTitle')}</h2>
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          {t('settings.backupCardBody')}
        </p>
        <Link to="/backup">
          <Button full variant="soft">
            {t('settings.backupCardAction')}
          </Button>
        </Link>
      </Card>
    </div>
  )
}
