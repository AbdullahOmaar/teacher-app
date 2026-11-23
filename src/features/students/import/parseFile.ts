/**
 * قراءة ملفات Excel/CSV وكتابة القالب — عبر مكتبات مُصانة على npm
 * ومحمّلة كسولاً (`import(...)` داخل الدوال فقط)، فتخرج في chunk
 * منفصل لا يُجلب إلا عند فتح الاستيراد أو تنزيل القالب:
 * • read-excel-file — قراءة xlsx (أول ورقة) لقيم خام.
 * • write-excel-file — كتابة قالب xlsx (نفس المكتبة الشقيقة).
 * • papaparse — قراءة csv (مع فك ترميز utf-8 وبديل windows-1256
 *   لملفات Excel العربي القديم).
 *
 * قرار 3A-301 — استبدال SheetJS ‏(xlsx@0.18.5) الذي كان هنا قبلاً:
 * الإصدار 0.18.5 (آخر ما نُشر على npm) مصاب بثغرتين High معروفتين
 * على مسار القراءة تحديداً — وهو مسار ملفات غير موثوقة من المستخدم:
 * GHSA-4r6h-8v6p-xvw6 ‏(تلويث بروتوتايب، أُصلحت في 0.19.3) و
 * GHSA-5pgg-2g8v-p4x9 ‏(ReDoS، أُصلحت في 0.20.2). الإصلاحات موجودة
 * فقط على CDN الناشر، وسجلّا OSV/GHSA بلا حد «مُصلَح» — أي نسخة
 * باسم xlsx تظل موسومة عند بوابة OSV مهما ارتفعت. فكان الاستبدال
 * بمكتبات مُصانة بسجل نظيف هو المسار القياسي. الثمن الموثّق:
 * دعم صيغة .xls القديمة (BIFF) سقط — تبقى xlsx وcsv وهما ما تعد
 * به نصوص الواجهة أصلاً. مكسب جانبي مقاس: الحزمة الكسولة ‏~150KB
 * ‏gzip بدل ~316KB الخاصة بـ SheetJS.
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
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_DATA_ROWS = 1000

/** خلية تاريخ من Excel → نص تاريخ ISO ‏(yyyy-mm-dd) بدل كائن Date */
function normalizeCell(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return v
}

/** قراءة أول ورقة في ملف xlsx لقيم خام (نص/رقم/منطقي/تاريخ) */
async function readXlsxRows(file: File): Promise<unknown[][]> {
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  let sheets
  try {
    sheets = await readXlsxFile(file)
  } catch {
    throw new Error(t('students.impFileUnreadable'))
  }
  const first = sheets[0]
  if (!first) throw new Error(t('students.impFileNoSheet'))
  return first.data.map((row) => row.map(normalizeCell))
}

/** فك ترميز نص CSV: ‏BOM/utf-8 أولاً، وبديل windows-1256 لملفات Excel العربي */
async function decodeCsvText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1256').decode(bytes)
  }
}

/** قراءة ملف csv لصفوف خام (كل القيم نصوص — الأصفار البادئة محفوظة) */
async function readCsvRows(file: File): Promise<unknown[][]> {
  const text = await decodeCsvText(file)
  const { default: Papa } = await import('papaparse')
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false })
  if (result.data.length === 0 && result.errors.length > 0) {
    throw new Error(t('students.impFileUnreadable'))
  }
  return result.data
}

export async function parseStudentFile(file: File): Promise<ParsedFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(t('students.impFileTooLarge'))
  }
  const lower = file.name.toLowerCase()
  const isCsv = lower.endsWith('.csv')
  if (!isCsv && !lower.endsWith('.xlsx')) {
    throw new Error(t('students.impFileUnsupported'))
  }
  const aoa = isCsv ? await readCsvRows(file) : await readXlsxRows(file)
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

/** بناء قالب Excel كـ Blob (مفصول عن التنزيل ليمكن اختباره) */
export async function buildTemplateXlsxBlob(): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  return writeXlsxFile([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE_ROW], {
    sheet: 'الطلاب',
    columns: TEMPLATE_HEADERS.map((h) => ({ width: Math.max(14, h.length + 6) })),
  }).toBlob()
}

/** تنزيل قالب Excel جاهز: الترويسات المتفق عليها + صف مثال واحد واضح */
export async function downloadTemplateXlsx(): Promise<void> {
  const blob = await buildTemplateXlsxBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'قالب-استيراد-الطلاب.xlsx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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
