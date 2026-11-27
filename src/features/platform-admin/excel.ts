// ===========================================================================
// استيراد/تصدير Excel لأدمن المنصة (مهمة 23 — 3A-898، آخر باقيها):
// تصدير قائمة مساحات العمل .xlsx حقيقية + استيراد جماعي لقائمة السماح
// من .xlsx/.csv عبر read-excel-file / write-excel-file / papaparse —
// المكتبات الثلاث موجودة أصلاً في الاعتماديات (نمط استيراد الطلاب
// نفسه)، فلا مكتبة جديدة هنا إطلاقاً.
//
// الإدراج يمرّ حصراً عبر addAllowlistEntry القائمة في panel.ts
// (إدراج مباشر بسياسات أدمن 0057 على main؛ وPR #51 يعيد توجيه
// الدالة نفسها إلى RPC الموثّق platform_allowlist_add من 0066 —
// فيرث الاستيراد مسار التدقيق تلقائياً بلا أي تغيير هنا عند الدمج).
// لا مهاجرة جديدة ولا RPC جديد في هذه الخطوة — وبالتالي لا قسم
// authz جديد (قسم 0057 يغطي RLS السماح، وقسم 0066 يغطي
// log_platform_audit عند هبوط #51).
// ===========================================================================

import { INVITE_EMAIL_RE } from '../auth/api'
import { t } from '../../i18n'
import { db } from '../../lib/supabase'
import { isValidEgyptianMobile } from '../../lib/phone'
import { addAllowlistEntry, type PlatformWorkspace } from './panel'
import { planLabel } from './labels'
import type { Json } from '../../types/database'

/** حدود حماية — نفس حدود استيراد الطلاب حرفياً (5MB و1000 صف) */
export const EXCEL_MAX_FILE_BYTES = 5 * 1024 * 1024
export const EXCEL_MAX_DATA_ROWS = 1000

export type AllowlistImportField = 'email' | 'phone' | 'note'

export interface ParsedAllowlistFile {
  fileName: string
  /** صف الترويسات كما في الملف (نصوص) */
  headers: string[]
  /** صفوف البيانات الخام بعد الترويسات — كل صف مصفوفة خلايا */
  rawRows: unknown[][]
}

/** صف سماح جاهز للإدراج — البريد بصيغة صغيرة، الهاتف كما كُتب مقصوصاً */
export interface AllowlistRowEntry {
  email: string | null
  phone: string | null
  note: string | null
}

export type AllowlistRowInvalidReason = 'no-contact' | 'bad-email' | 'bad-phone'

export type AllowlistImportRowStatus = 'added' | 'duplicate' | 'invalid' | 'failed'

/** نتيجة صف واحد غير مضاف — الصفوف المضافة لا تُسرد (الملخص يكفيها) */
export interface AllowlistImportDetail {
  /** رقم الصف في الملف (الترويسات صف 1) */
  row: number
  status: 'duplicate' | 'invalid' | 'failed'
  reason?: AllowlistRowInvalidReason | 'duplicate' | 'failed'
}

export interface AllowlistImportSummary {
  added: number
  duplicates: number
  invalid: number
  failed: number
  details: AllowlistImportDetail[]
}

// ---------------------------------------------------------------------------
// التطبيع والتحقق — نفس قواعد قائمة السماح (0057) واستيراد الطلاب
// ---------------------------------------------------------------------------

/**
 * تطبيع رقم هاتف من خلية ملف: أرقام فقط + استعادة الصفر الأول
 * الذي يسقطه Excel عندما تكون الخلية رقمية (0100… تصبح 100…).
 * نفس خوارزمية normalizePhone في students/import/logic.ts — مكررة
 * هنا عمداً حتى تبقى وحدة الأدمن مغلقة على نفسها بلا استيراد
 * عبر-فيتشر. التخزين بصيغة 010… كما تُكتب يدوياً: بوابة 0057
 * تقارن الهاتف مقصوصاً حرفياً، فأي تطبيع لـ E.164 كان سيكسر
 * المطابقة — انظر PLATFORM-ADMIN-EXCEL.md.
 */
export function normalizeAllowlistPhone(raw: unknown): string {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.startsWith('0020')) d = '0' + d.slice(4)
  else if (d.startsWith('20') && d.length === 12) d = '0' + d.slice(2)
  else if (d.length === 10 && d.startsWith('1')) d = '0' + d
  return d
}

/** بريد صالح؟ نفس تعبير الدعوات INVITE_EMAIL_RE المستعمل في التطبيق */
export function isValidAllowlistEmail(value: string): boolean {
  return INVITE_EMAIL_RE.test(value.trim())
}

// ---------------------------------------------------------------------------
// خريطة الترويسات — أسماء بديلة عربية/إنجليزية لكل حقل
// ---------------------------------------------------------------------------

const HEADER_ALIASES: Record<AllowlistImportField, string[]> = {
  email: [
    'البريد الإلكتروني',
    'البريد الالكتروني',
    'الإيميل',
    'الايميل',
    'البريد',
    'email',
    'e-mail',
    'mail',
    'e-mail address',
    'email address',
  ],
  phone: [
    'الموبايل',
    'الهاتف',
    'رقم الموبايل',
    'رقم الهاتف',
    'رقم الجوال',
    'الجوال',
    'phone',
    'mobile',
    'tel',
    'telephone',
    'phone number',
    'mobile number',
  ],
  note: [
    'ملاحظة',
    'ملاحظات',
    'ملاحظه',
    'note',
    'notes',
    'remark',
    'remarks',
    'comment',
  ],
}

/** تطبيع ترويسة للمقارنة: قصّ، لاتيني صغير، إزالة علامات طرفية */
function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[#*_«»"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const ALIAS_INDEX = new Map<string, AllowlistImportField>()
for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
  AllowlistImportField,
  string[],
][]) {
  for (const a of aliases) ALIAS_INDEX.set(normalizeHeader(a), field)
}

/**
 * رسم خريطة الأعمدة تلقائياً: لكل عمود في الملف الحقل المطابق أو null
 * (يُتجاهل). أول عمود يفوز عند تنافس عمودين على نفس الحقل — نفس نمط
 * autoMapHeaders في students/import/logic.ts.
 */
export function autoMapAllowlistHeaders(
  headers: unknown[],
): (AllowlistImportField | null)[] {
  const used = new Set<AllowlistImportField>()
  return headers.map((h) => {
    const field = ALIAS_INDEX.get(normalizeHeader(h))
    if (!field || used.has(field)) return null
    used.add(field)
    return field
  })
}

/**
 * تحقق صف واحد بعد رسم الخريطة: البريد يُخزَّن بصيغة صغيرة (نفس
 * تطبيع RPC الموثّق في 0066 ومقارنة البوابة)، والهاتف يُخزَّن كما
 * كُتب مقصوصاً بعد استعادة صفره. صف بلا بريد ولا هاتف صالحين
 * مرفوض مع السبب — لا إدراج جزئي أبداً.
 */
export function validateAllowlistRow(
  cells: unknown[],
  mapping: (AllowlistImportField | null)[],
):
  | { ok: true; entry: AllowlistRowEntry }
  | { ok: false; reason: AllowlistRowInvalidReason } {
  let email: string | null = null
  let phone: string | null = null
  let note: string | null = null
  for (let i = 0; i < mapping.length; i++) {
    const field = mapping[i]
    if (!field) continue
    const raw = cells[i]
    const text = String(raw ?? '').trim()
    if (field === 'email') email = text === '' ? null : text.toLowerCase()
    if (field === 'phone') phone = text === '' ? null : normalizeAllowlistPhone(text)
    if (field === 'note') note = text === '' ? null : text
  }
  if (email === null && phone === null) return { ok: false, reason: 'no-contact' }
  if (email !== null && !isValidAllowlistEmail(email)) {
    return { ok: false, reason: 'bad-email' }
  }
  if (phone !== null && !isValidEgyptianMobile(phone)) {
    return { ok: false, reason: 'bad-phone' }
  }
  return { ok: true, entry: { email, phone, note } }
}

// ---------------------------------------------------------------------------
// قراءة الملف — xlsx (أول ورقة) أو csv (نفس فك ترميز استيراد الطلاب)
// ---------------------------------------------------------------------------

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
    throw new Error(t('platformAdmin.excelFileUnreadable'))
  }
  const first = sheets[0]
  if (!first) throw new Error(t('platformAdmin.excelFileNoSheet'))
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
    throw new Error(t('platformAdmin.excelFileUnreadable'))
  }
  return result.data
}

/**
 * قراءة ملف استيراد قائمة السماح (.xlsx أو .csv) — نفس حدود استيراد
 * الطلاب: ملف ≤ 5MB و≤ 1000 صف بيانات. الأخطاء كلها رسائل قاموس
 * مصممة — لا نص خام من المكتبات يصل للواجهة أبداً.
 */
export async function parseAllowlistFile(file: File): Promise<ParsedAllowlistFile> {
  if (file.size > EXCEL_MAX_FILE_BYTES) {
    throw new Error(t('platformAdmin.excelFileTooLarge'))
  }
  const lower = file.name.toLowerCase()
  const isCsv = lower.endsWith('.csv')
  if (!isCsv && !lower.endsWith('.xlsx')) {
    throw new Error(t('platformAdmin.excelFileUnsupported'))
  }
  const aoa = isCsv ? await readCsvRows(file) : await readXlsxRows(file)
  if (aoa.length === 0) throw new Error(t('platformAdmin.excelFileNoHeaders'))
  const headers = (aoa[0] ?? []).map((h) => String(h ?? '').trim())
  const rawRows = aoa.slice(1)
  if (rawRows.length > EXCEL_MAX_DATA_ROWS) {
    throw new Error(
      t('platformAdmin.excelFileTooManyRows', {
        count: rawRows.length,
        max: EXCEL_MAX_DATA_ROWS,
      }),
    )
  }
  return { fileName: file.name, headers, rawRows }
}

// ---------------------------------------------------------------------------
// التصدير — قائمة مساحات العمل .xlsx حقيقية
// ---------------------------------------------------------------------------

/** ختم تاريخ اليوم YYYY-MM-DD — محلي عمداً حتى تبقى الوحدة مغلقة */
function todayStamp(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** تاريخ للعرض في التصدير — فارغ/غير صالح يظهر شرطة بدل Invalid Date */
function formatExportDate(value: string): string {
  if (value === '') return '—'
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return '—'
  return new Date(value).toLocaleDateString('ar-EG')
}

/**
 * صفوف تصدير مساحات العمل (نقية وقابلة للاختبار): الترويسات ثم صف
 * لكل مساحة من البيانات التي يراها الأدمن أصلاً — بلا أي قراءة
 * خادمية جديدة. تواريخ العرض نصوص عربية منسقة، لا خلايا تاريخ.
 */
export function buildWorkspacesXlsxRows(workspaces: PlatformWorkspace[]): {
  headers: string[]
  rows: (string | number)[][]
} {
  const headers = [
    t('platformAdmin.excelColName'),
    t('platformAdmin.excelColEmail'),
    t('platformAdmin.excelColPlan'),
    t('platformAdmin.excelColStatus'),
    t('platformAdmin.excelColStudents'),
    t('platformAdmin.excelColLastActivity'),
    t('platformAdmin.excelColCreated'),
  ]
  const rows = workspaces.map((w) => [
    w.displayName,
    w.ownerEmail,
    planLabel(w.planSlug),
    w.accountActivated
      ? t('platformAdmin.statusActivated')
      : t('platformAdmin.statusDeactivated'),
    w.studentsCount,
    w.lastActivityAt === null
      ? t('platformAdmin.noActivity')
      : formatExportDate(w.lastActivityAt),
    formatExportDate(w.createdAt),
  ])
  return { headers, rows }
}

/** بناء ملف تصدير مساحات العمل كـ Blob (مفصول عن التنزيل ليُختبَر) */
export async function buildWorkspacesXlsxBlob(
  workspaces: PlatformWorkspace[],
): Promise<Blob> {
  const { headers, rows } = buildWorkspacesXlsxRows(workspaces)
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  return writeXlsxFile([headers, ...rows], {
    sheet: t('platformAdmin.excelSheetWorkspaces'),
    columns: [
      { width: 24 },
      { width: 30 },
      { width: 12 },
      { width: 12 },
      { width: 10 },
      { width: 16 },
      { width: 16 },
    ],
  }).toBlob()
}

/** تنزيل تصدير مساحات العمل — اسم الملف بتاريخ اليوم */
export async function downloadWorkspacesXlsx(
  workspaces: PlatformWorkspace[],
): Promise<void> {
  const blob = await buildWorkspacesXlsxBlob(workspaces)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `مساحات-العمل-${todayStamp()}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------------------------------------------------------------------------
// قالب الاستيراد — ترويسات فقط، بلا صف مثال عمداً
// ---------------------------------------------------------------------------

/**
 * بناء قالب استيراد قائمة السماح كـ Blob: الترويسات المتفق عليها
 * فقط. صف المثال مُستبعد عمداً: أي صف مثال ببريد صالح الشكل كان
 * سيُستورَد كصف سماح حقيقي يفتح التسجيل لصاحبه — خطر لا يُقبل
 * في قائمة تحكم مَن يُنشئ حساباً.
 */
export async function buildAllowlistTemplateXlsxBlob(): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  return writeXlsxFile(
    [
      [
        t('platformAdmin.excelTemplateColEmail'),
        t('platformAdmin.excelTemplateColPhone'),
        t('platformAdmin.excelTemplateColNote'),
      ],
    ],
    {
      sheet: t('platformAdmin.excelSheetAllowlist'),
      columns: [{ width: 30 }, { width: 16 }, { width: 24 }],
    },
  ).toBlob()
}

/** تنزيل قالب استيراد قائمة السماح */
export async function downloadAllowlistTemplateXlsx(): Promise<void> {
  const blob = await buildAllowlistTemplateXlsxBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'قالب-استيراد-قائمة-السماح.xlsx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------------------------------------------------------------------------
// تشغيل الاستيراد — صفاً صفاً بنتيجة لكل صف
// ---------------------------------------------------------------------------

export type ExcelAuditAction = 'allowlist_imported' | 'workspaces_exported'

/**
 * تدقيق Excel عبر log_platform_audit() (0066) — best-effort عمداً:
 * الدالة غائبة حتى تطبيق 0066 عند بوابة التجميد، والتدقيق لا يجوز
 * أن يكسر مساراً ناجحاً أصلاً. الفشل يُبتلع بمصير موثق هنا
 * (لا إعادة رمي ولا رسالة للمستخدم)؛ نتيجة الفعل نفسها هي
 * مصدر الحقيقة — نفس نمط logMfaAudit / logDeviceAudit.
 */
export async function logExcelAudit(
  action: ExcelAuditAction,
  details?: Record<string, Json>,
): Promise<void> {
  try {
    const { error } = await db().rpc('log_platform_audit', {
      p_action: action,
      p_target_teacher_id: null,
      p_details: details ?? {},
    })
    if (error) throw error
  } catch {
    // مقصود: التدقيق best-effort حتى 0066 — انظر التعليق أعلاه.
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23505'
  )
}

/**
 * تشغيل استيراد قائمة السماح صفاً صفاً — لا يرمي أبداً: كل صف ينتهي
 * بإحدى النتائج الأربع (مضاف / مكرر / غير صالح / فشل). المكرر
 * يُكتشف أولاً ضد القائمة الحالية وضد ما أُضيف في هذه الدفعة
 * نفسها (بريد بصيغة صغيرة، هاتف مقصوص)؛ وقيد التفرد في القاعدة
 * (lower(email) / phone) شبكة أمان لسباق إضافة موازٍ — خطأ 23505
 * يُصنَّف مكرراً لا فشلاً. الصفوف الفارغة تماماً تُتخطى بصمت.
 * أرقام الصفوف كما في الملف (الترويسات صف 1).
 */
export async function runAllowlistImport(
  parsed: ParsedAllowlistFile,
  existing: { email: string | null; phone: string | null }[],
  addEntry: (input: {
    email: string
    phone: string
    note: string
  }) => Promise<void> = addAllowlistEntry,
): Promise<AllowlistImportSummary> {
  const mapping = autoMapAllowlistHeaders(parsed.headers)
  const seenEmails = new Set(
    existing
      .map((e) => (e.email ?? '').trim().toLowerCase())
      .filter((e) => e !== ''),
  )
  const seenPhones = new Set(
    existing.map((e) => (e.phone ?? '').trim()).filter((p) => p !== ''),
  )
  const summary: AllowlistImportSummary = {
    added: 0,
    duplicates: 0,
    invalid: 0,
    failed: 0,
    details: [],
  }
  for (let i = 0; i < parsed.rawRows.length; i++) {
    const cells = parsed.rawRows[i] ?? []
    const rowNo = i + 2
    if (cells.every((c) => String(c ?? '').trim() === '')) continue
    const validated = validateAllowlistRow(cells, mapping)
    if (!validated.ok) {
      summary.invalid += 1
      summary.details.push({
        row: rowNo,
        status: 'invalid',
        reason: validated.reason,
      })
      continue
    }
    const { entry } = validated
    const emailKey = entry.email ?? ''
    const phoneKey = entry.phone ?? ''
    if (
      (emailKey !== '' && seenEmails.has(emailKey)) ||
      (phoneKey !== '' && seenPhones.has(phoneKey))
    ) {
      summary.duplicates += 1
      summary.details.push({ row: rowNo, status: 'duplicate', reason: 'duplicate' })
      continue
    }
    try {
      await addEntry({
        email: entry.email ?? '',
        phone: entry.phone ?? '',
        note: entry.note ?? '',
      })
      summary.added += 1
      if (emailKey !== '') seenEmails.add(emailKey)
      if (phoneKey !== '') seenPhones.add(phoneKey)
    } catch (error) {
      if (isUniqueViolation(error)) {
        summary.duplicates += 1
        summary.details.push({ row: rowNo, status: 'duplicate', reason: 'duplicate' })
        if (emailKey !== '') seenEmails.add(emailKey)
        if (phoneKey !== '') seenPhones.add(phoneKey)
      } else {
        summary.failed += 1
        summary.details.push({ row: rowNo, status: 'failed', reason: 'failed' })
      }
    }
  }
  return summary
}
