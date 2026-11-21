/**
 * قراءة ملفات Excel/CSV وكتابة القالب — عبر SheetJS ‏(xlsx) المحمّلة
 * كسولاً: `import('xlsx')` داخل الدوال فقط، فتخرج المكتبة في chunk
 * منفصل لا يُجلب إلا عند فتح الاستيراد أو تنزيل القالب، ولا تثقل
 * الحزمة الرئيسية. اختيار المكتبة وحجمها موثّقان في تقرير الخطوة:
 * xlsx@0.18.5 ‏(SheetJS) — ‏862KB مصغّرة (~316KB ‏gzip) في الـ chunk
 * الكسول فقط؛ تدعم قراءة وكتابة xlsx + csv بواجهة واحدة مجرّبة.
 * بدائل أخف (read-excel-file) قُراءة فقط وكانت ستلزمنا بمكتبة كتابة
 * ثانية للقالب، ففُضّلت مكتبة واحدة للاتجاهين.
 */
import { TEMPLATE_EXAMPLE_ROW, TEMPLATE_HEADERS } from './logic'
import { csvEsc } from '../../../lib/csv'
import { t } from '../../../i18n'

export interface ParsedFile {
  fileName: string
  /** صف الترويسات كما في الملف (نصوص) */
  headers: string[]
  /** صفوف البيانات الخام بعد الترويسات — كل صف مصفوفة خلايا */
  rawRows: unknown[][]
}

/** حدود حماية: ملف ≤ 5MB و≤ 1000 صف بيانات — فوق ذلك رسالة واضحة */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const MAX_DATA_ROWS = 1000

export async function parseStudentFile(file: File): Promise<ParsedFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(t('students.impFileTooLarge'))
  }
  const lower = file.name.toLowerCase()
  if (!/\.(xlsx|xls|csv)$/.test(lower)) {
    throw new Error(t('students.impFileUnsupported'))
  }
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  let wb
  try {
    wb = XLSX.read(buf, { type: 'array' })
  } catch {
    throw new Error(t('students.impFileUnreadable'))
  }
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error(t('students.impFileNoSheet'))
  const sheet = wb.Sheets[sheetName]
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  })
  if (aoa.length === 0) throw new Error(t('students.impFileNoHeaders'))
  const headers = (aoa[0] ?? []).map((h) => String(h ?? '').trim())
  const rawRows = aoa.slice(1)
  if (rawRows.length > MAX_DATA_ROWS) {
    throw new Error(
      t('students.impFileTooManyRows', { count: rawRows.length, max: MAX_DATA_ROWS }),
    )
  }
  return { fileName: file.name, headers, rawRows }
}

/** تنزيل قالب Excel جاهز: الترويسات المتفق عليها + صف مثال واحد واضح */
export async function downloadTemplateXlsx(): Promise<void> {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE_ROW])
  ws['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(14, h.length + 6) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'الطلاب')
  XLSX.writeFile(wb, 'قالب-استيراد-الطلاب.xlsx')
}

/** تنزيل نفس القالب بصيغة CSV (نفس هروب وBOM تصدير الإعدادات لفتح عربي سليم) */
export function downloadTemplateCsv(): void {
  const content =
    '\uFEFF' +
    [TEMPLATE_HEADERS, TEMPLATE_EXAMPLE_ROW].map((r) => r.map(csvEsc).join(',')).join('\r\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'قالب-استيراد-الطلاب.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
