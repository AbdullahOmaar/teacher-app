import { useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, FileText, Upload } from 'lucide-react'
import { Sheet } from '../../../components/ui/Sheet'
import { Button } from '../../../components/ui/Button'
import { Field, FormError, Select } from '../../../components/ui/form'
import type { GroupRow, StudentRow } from '../../../types/database'
import {
  autoMapHeaders,
  classifyRows,
  isTemplateExampleRow,
  rowsToStudents,
  IMPORT_FIELDS,
  type ClassifiedRow,
  type ImportField,
} from './logic'
import {
  downloadTemplateCsv,
  downloadTemplateXlsx,
  parseStudentFile,
  type ParsedFile,
} from './parseFile'
import { useImportStudentsFile } from './hooks'
import { t } from '../../../i18n'

interface StudentImportSheetProps {
  onClose: () => void
  teacherId: string
  groups: GroupRow[]
  /** طلاب المدرس الحاليون — أساس كشف التكرار (الكود + الموبايل) */
  students: StudentRow[]
}

type Step = 'pick' | 'preview' | 'done'

const STATUS_UI: Record<ClassifiedRow['status'], { label: string; cls: string }> = {
  ready: { label: t('students.importStatusReady'), cls: 'bg-ok-soft text-ok-text border-ok/30' },
  duplicate: { label: t('students.importStatusDuplicate'), cls: 'bg-warn-soft text-warn-text border-warn/40' },
  error: { label: t('students.importStatusError'), cls: 'bg-bad-soft text-bad-text border-bad/30' },
}

/**
 * استيراد الطلاب من Excel/CSV (Phase 2 خطوة 9): اختيار ملف ← معاينة
 * كاملة قبل أي حفظ (حالة كل صف + رسم أعمدة قابل للتعديل + اختيار
 * مجموعة) ← حفظ بنفس مسارات إنشاء الطالب/التسجيل في وحدة الطلاب.
 * الصفوف المكررة مستبعدة افتراضياً مع زر تضمين صريح لكل صف، وأخطاء
 * الصفوف لا توقف بقية الاستيراد أبداً.
 */
export function StudentImportSheet({ onClose, teacherId, groups, students }: StudentImportSheetProps) {
  const [step, setStep] = useState<Step>('pick')
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [mapping, setMapping] = useState<(ImportField | null)[]>([])
  const [groupId, setGroupId] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [templateBusy, setTemplateBusy] = useState(false)
  /** تضمين/استبعاد يدوي لكل صف برقم الصف — الافتراضي من حالته */
  const [includeOverride, setIncludeOverride] = useState<Record<number, boolean>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const importFile = useImportStudentsFile(teacherId)

  const classified = useMemo<ClassifiedRow[]>(() => {
    if (!parsed) return []
    const rows = rowsToStudents(parsed.rawRows, mapping)
    const base = classifyRows(
      rows,
      students.map((s) => ({ name: s.name, public_code: s.public_code, phone: s.phone })),
    )
    // صف مثال القالب لا يُستورد أبداً إن رُفع كما هو
    return base.map((c) =>
      isTemplateExampleRow(c.row)
        ? { ...c, status: 'error' as const, reason: t('students.importExampleRowReason') }
        : c,
    )
  }, [parsed, mapping, students])

  const counts = useMemo(
    () => ({
      ready: classified.filter((c) => c.status === 'ready').length,
      duplicate: classified.filter((c) => c.status === 'duplicate').length,
      error: classified.filter((c) => c.status === 'error').length,
    }),
    [classified],
  )

  const isIncluded = (c: ClassifiedRow) => {
    if (c.status === 'error') return false
    const override = includeOverride[c.row.rowNumber]
    if (override != null) return override
    return c.status === 'ready'
  }
  const importCount = classified.filter(isIncluded).length
  const hasNameColumn = mapping.includes('name')

  const onFileChosen = async (file: File | undefined) => {
    if (!file) return
    setParsing(true)
    setParseError(null)
    try {
      const result = await parseStudentFile(file)
      setParsed(result)
      setMapping(autoMapHeaders(result.headers))
      setIncludeOverride({})
      setStep('preview')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : t('students.importParseErrorFallback'))
    } finally {
      setParsing(false)
    }
  }

  const onDownloadTemplate = async (kind: 'xlsx' | 'csv') => {
    setTemplateBusy(true)
    try {
      if (kind === 'xlsx') await downloadTemplateXlsx()
      else downloadTemplateCsv()
    } catch {
      setParseError(t('students.importTemplateError'))
    } finally {
      setTemplateBusy(false)
    }
  }

  const doImport = () => {
    const items = classified.map((c) => ({
      classified: c,
      includeDuplicate: c.status === 'duplicate' && isIncluded(c),
    }))
    importFile.mutate(
      { items, groupId: groupId || null },
      { onSuccess: () => setStep('done') },
    )
  }

  const result = importFile.data

  return (
    <Sheet
      open
      title={t('students.importTitle')}
      onClose={onClose}
      footer={
        step === 'preview' ? (
          <div className="flex gap-2">
            <Button
              full
              onClick={doImport}
              disabled={importFile.isPending || importCount === 0 || !hasNameColumn}
            >
              <Upload size={18} />
              {importFile.isPending ? t('students.importImporting') : t('students.importImportBtn', { count: importCount })}
            </Button>
            <Button variant="ghost" onClick={() => setStep('pick')} disabled={importFile.isPending}>
              {t('shell.back')}
            </Button>
          </div>
        ) : (
          <Button full variant={step === 'done' ? 'primary' : 'ghost'} onClick={onClose}>
            {step === 'done' ? t('invoices.sheetOk') : t('groups.cancel')}
          </Button>
        )
      }
    >
      {step === 'pick' && (
        <div>
          <p className="text-muted text-[13.5px] mt-0 mb-3">
            {t('students.importIntro')}
          </p>
          <h4 className="type-section mb-2">{t('students.importTemplateTitle')}</h4>
          <p className="text-muted text-[13.5px] mt-0 mb-2">
            {t('students.importTemplateHint')}
          </p>
          <div className="flex gap-2 mb-4">
            <Button variant="soft" className="flex-1" disabled={templateBusy} onClick={() => void onDownloadTemplate('xlsx')}>
              <FileSpreadsheet size={20} /> {t('students.importTemplateExcel')}
            </Button>
            <Button variant="soft" className="flex-1" disabled={templateBusy} onClick={() => void onDownloadTemplate('csv')}>
              <FileText size={20} /> {t('students.importTemplateCsv')}
            </Button>
          </div>

          <h4 className="type-section mb-2">{t('students.importPickTitle')}</h4>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              void onFileChosen(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <Button full onClick={() => fileInputRef.current?.click()} disabled={parsing}>
            <Upload size={20} />
            {parsing ? t('students.importReadingFile') : t('students.importPickFileBtn')}
          </Button>
          {parseError && (
            <div className="mt-3">
              <FormError message={parseError} />
            </div>
          )}
        </div>
      )}

      {step === 'preview' && parsed && (
        <div>
          <p className="text-[13.5px] mt-0 mb-2">
            {t('students.importFilePrefix')}<b>{parsed.fileName}</b>{t('students.importFileSuffix', { count: classified.length })}
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="type-badge bg-ok-soft text-ok-text border border-ok/30 rounded-full px-2.5 py-1">{t('students.importReadyBadge', { count: counts.ready })}</span>
            <span className="type-badge bg-warn-soft text-warn-text border border-warn/40 rounded-full px-2.5 py-1">{t('students.importDuplicateBadge', { count: counts.duplicate })}</span>
            <span className="type-badge bg-bad-soft text-bad-text border border-bad/30 rounded-full px-2.5 py-1">{t('students.importErrorBadge', { count: counts.error })}</span>
          </div>

          <Field label={t('students.importGroupLabel')}>
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">{t('students.importNoGroupOption')}</option>
              {groups
                .filter((g) => g.archived_at == null)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {t('students.importGroupOption', { name: g.name, price: g.price })}
                  </option>
                ))}
            </Select>
          </Field>
          {groupId && (
            <p className="text-muted text-[12px] mt-0 mb-3">
              {t('students.importGroupNote')}
            </p>
          )}

          <h4 className="type-section mb-2">{t('students.importMappingTitle')}</h4>
          {!hasNameColumn && (
            <FormError message={t('students.importNoNameColumnError')} />
          )}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {parsed.headers.map((h, colIdx) => (
              <label key={colIdx} className="block">
                <span className="block text-[12px] text-muted font-semibold mb-1 truncate">
                  {t('students.importColumnLabel', { header: h || t('students.importColumnFallback', { index: colIdx + 1 }) })}
                </span>
                <Select
                  value={mapping[colIdx] ?? ''}
                  onChange={(e) => {
                    const v = (e.target.value || null) as ImportField | null
                    setMapping((prev) => {
                      const next = [...prev]
                      // حقل واحد لا يُربط بعمودين
                      return next.map((f, i) => (i === colIdx ? v : f === v && v != null ? null : f))
                    })
                  }}
                  className="min-h-[48px] text-[13.5px]"
                >
                  <option value="">{t('students.importIgnoreColumn')}</option>
                  {IMPORT_FIELDS.map((f) => (
                    <option key={f.field} value={f.field}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>

          <h4 className="type-section mb-2">{t('students.importPreviewTitle')}</h4>
          <div className="border border-border rounded-xl overflow-auto max-h-[46vh] mb-3">
            <table className="w-full text-[13.5px] border-collapse min-w-[520px]">
              <thead className="sticky top-0 bg-soft">
                <tr>
                  <th className="text-start px-2 py-2 font-bold">{t('students.importColInclude')}</th>
                  <th className="text-start px-2 py-2 font-bold">{t('students.importColName')}</th>
                  <th className="text-start px-2 py-2 font-bold">{t('students.importColPhoneCode')}</th>
                  <th className="text-start px-2 py-2 font-bold">{t('students.importColStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {classified.map((c) => {
                  const ui = STATUS_UI[c.status]
                  const included = isIncluded(c)
                  return (
                    <tr key={c.row.rowNumber} className="border-t border-border align-top">
                      <td className="px-2 py-1">
                        <label className="flex items-center justify-center min-h-[48px] min-w-[48px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={included}
                            disabled={c.status === 'error'}
                            onChange={(e) =>
                              setIncludeOverride((prev) => ({
                                ...prev,
                                [c.row.rowNumber]: e.target.checked,
                              }))
                            }
                            className="w-5 h-5 accent-primary"
                          />
                        </label>
                      </td>
                      <td className="px-2 py-2">
                        <span className="font-semibold">{c.row.name || '—'}</span>
                        <span className="block text-muted text-[12px]">{t('students.importRowLine', { row: c.row.rowNumber })}{c.row.grade ? t('students.metaItem', { value: c.row.grade ?? '' }) : ''}</span>
                      </td>
                      <td className="px-2 py-2" dir="auto">
                        {c.row.phone ?? ''}
                        {c.row.phone && c.row.code ? ' · ' : ''}
                        {c.row.code ?? ''}
                        {!c.row.phone && !c.row.code ? '—' : ''}
                      </td>
                      <td className="px-2 py-2">
                        <span className={`type-badge border rounded-full px-2 py-0.5 whitespace-nowrap ${ui.cls}`}>
                          {ui.label}
                        </span>
                        {c.reason && (
                          <span className="block text-muted text-[12px] mt-1">{c.reason}</span>
                        )}
                        {c.status === 'duplicate' && (
                          <span className="block text-muted text-[12px]">
                            {included ? t('students.importDuplicateIncluded') : t('students.importDuplicateExcluded')}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {importFile.isError && (
            <FormError
              message={importFile.error instanceof Error ? importFile.error.message : t('students.importErrorFallback')}
            />
          )}
        </div>
      )}

      {step === 'done' && result && (
        <div>
          <p className="text-[15px] font-bold mt-0 mb-2">{t('students.importDoneTitle')}</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="type-badge bg-ok-soft text-ok-text border border-ok/30 rounded-full px-2.5 py-1">{t('students.importCreatedBadge', { count: result.created })}</span>
            {result.enrolled > 0 && (
              <span className="type-badge bg-soft text-primary border border-border rounded-full px-2.5 py-1">{t('students.importEnrolledBadge', { count: result.enrolled })}</span>
            )}
            <span className="type-badge bg-warn-soft text-warn-text border border-warn/40 rounded-full px-2.5 py-1">{t('students.importSkippedBadge', { count: result.skipped })}</span>
            {result.failed > 0 && (
              <span className="type-badge bg-bad-soft text-bad-text border border-bad/30 rounded-full px-2.5 py-1">{t('students.importFailedBadge', { count: result.failed })}</span>
            )}
          </div>
          {result.errors.length > 0 && (
            <div className="text-[12px] text-bad-text bg-bad/5 rounded-xl px-3 py-2 mb-3">
              {result.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
          <p className="text-muted text-[13.5px]">
            {t('students.importDoneNote')}
          </p>
        </div>
      )}
    </Sheet>
  )
}
