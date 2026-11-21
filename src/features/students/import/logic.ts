/**
 * منطق استيراد الطلاب من Excel/CSV — دوال نقية بلا أي اعتماد على المتصفح
 * أو Supabase أو مكتبة القراءة (قابلة للاختبار منفردة):
 * • تطبيع الترويسات ورسم خريطة الأعمدة (مطابقة تلقائية عربي/إنجليزي).
 * • تحويل الصفوف الخام (مصفوفة خلايا) لسجلات طالب مُطبَّعة.
 * • كشف التكرار والتحقق — قواعد التكرار الموثّقة:
 *   1) الكود: إن وُجد في الصف وطابق public_code لطالب حالي (بعد التطبيع:
 *      قصّ + أحرف كبيرة + إزالة بادئة #) ⇒ تكرار.
 *   2) موبايل الطالب: إن وُجد وطابق — بعد تطبيع الرقم المصري (أرقام فقط،
 *      إزالة 0020/20 الدولية وإعادة الصفر) — موبايل طالب حالي ⇒ تكرار.
 *      موبايل ولي الأمر ليس مفتاح تكرار وحده (إخوة يتشاركونه شرعياً).
 *   3) داخل الملف نفسه: نفس الكود أو نفس موبايل الطالب لصف سابق ⇒ تكرار
 *      (يُشار لرقم أول صف).
 * • أخطاء تمنع الحفظ: غياب الاسم، سعر خاص غير رقمي/سالب، أو موبايل
 *   موجود لكن أرقامه خارج 7–15 رقماً.
 * أعمدة القالب هي نفس أسماء أعمدة تصدير الطلاب في وحدة الإعدادات
 * (settings/api ‏buildStudentsCsv) قدر الإمكان حتى يتوافق التصدير مع
 * الاستيراد ذهاباً وإياباً، + عمود اختياري «سعر خاص» للتسجيل.
 */

import { t } from '../../../i18n'

export type ImportField =
  | 'name'
  | 'code'
  | 'grade'
  | 'school'
  | 'phone'
  | 'guardian_name'
  | 'guardian_phone'
  | 'group_name'
  | 'level_note'
  | 'price_override'

export const IMPORT_FIELDS: { field: ImportField; label: string }[] = [
  { field: 'name', label: t('students.impFieldName') },
  { field: 'code', label: t('students.impFieldCode') },
  { field: 'grade', label: t('students.impFieldGrade') },
  { field: 'school', label: t('students.impFieldSchool') },
  { field: 'phone', label: t('students.impFieldPhone') },
  { field: 'guardian_name', label: t('students.impFieldGuardianName') },
  { field: 'guardian_phone', label: t('students.impFieldGuardianPhone') },
  { field: 'group_name', label: t('students.impFieldGroupName') },
  { field: 'level_note', label: t('students.impFieldLevelNote') },
  { field: 'price_override', label: t('students.impFieldPriceOverride') },
]

/** ترويسات القالب بالترتيب — تطابق تصدير الطلاب + «سعر خاص» أخيراً */
export const TEMPLATE_HEADERS = [
  'الكود',
  'الاسم',
  'الصف',
  'المدرسة',
  'موبايل الطالب',
  'ولي الأمر',
  'موبايل ولي الأمر',
  'المجموعة',
  'ملاحظة المستوى',
  'سعر خاص',
]

/** صف المثال الوحيد في القالب — واضح أنه مثال من الاسم نفسه */
export const TEMPLATE_EXAMPLE_ROW = [
  '',
  'مثال: أحمد محمد علي',
  '3 ثانوي',
  'مدرسة النور الثانوية',
  '01001234567',
  'محمد علي',
  '01112223334',
  '',
  'مستواه كويس في الجبر',
  '',
]

/** أسماء بديلة شائعة لكل حقل (تُطبَّع قبل المقارنة بـ normalizeHeader) */
const HEADER_ALIASES: Record<ImportField, string[]> = {
  name: ['الاسم', 'اسم الطالب', 'name', 'student name', 'student', 'full name'],
  code: ['الكود', 'كود الطالب', 'code', 'student code', 'public code', 'id'],
  grade: ['الصف', 'المرحلة', 'الصف الدراسي', 'grade', 'level', 'class'],
  school: ['المدرسة', 'school'],
  phone: [
    'موبايل الطالب',
    'هاتف الطالب',
    'رقم الطالب',
    'الموبايل',
    'الهاتف',
    'الرقم',
    'phone',
    'mobile',
    'student phone',
    'student mobile',
  ],
  guardian_name: ['ولي الأمر', 'اسم ولي الأمر', 'guardian', 'guardian name', 'parent', 'parent name'],
  guardian_phone: [
    'موبايل ولي الأمر',
    'هاتف ولي الأمر',
    'رقم ولي الأمر',
    'guardian phone',
    'guardian mobile',
    'parent phone',
    'parent mobile',
  ],
  group_name: ['المجموعة', 'المجموعات', 'اسم المجموعة', 'group', 'group name', 'groups'],
  level_note: ['ملاحظة المستوى', 'ملاحظات', 'ملاحظة', 'notes', 'note', 'level note', 'level notes', 'remarks'],
  price_override: ['سعر خاص', 'السعر الخاص', 'السعر', 'price', 'price override', 'custom price'],
}

/** تطبيع ترويسة للمقارنة: قصّ، مسافات موحدة، لاتيني صغير، إزالة # و* وعلامات ترقيم طرفية */
export function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[#*_«»"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const ALIAS_INDEX = new Map<string, ImportField>()
for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ImportField, string[]][]) {
  for (const a of aliases) ALIAS_INDEX.set(normalizeHeader(a), field)
}

/**
 * رسم خريطة الأعمدة تلقائياً: لكل عمود في الملف الحقل المطابق أو null
 * (يُتجاهل). أول عمود يفوز عند تنافس عمودين على نفس الحقل.
 */
export function autoMapHeaders(headers: unknown[]): (ImportField | null)[] {
  const used = new Set<ImportField>()
  return headers.map((h) => {
    const field = ALIAS_INDEX.get(normalizeHeader(h))
    if (!field || used.has(field)) return null
    used.add(field)
    return field
  })
}

/**
 * تطبيع رقم هاتف: أرقام فقط + فك الصيغة الدولية المصرية + استعادة
 * الصفر الأول المفقود: Excel/CSV يحوّل خلية الموبايل الرقمية لرقم
 * فتسقط الـ 0 (0100… تصبح 100… ‏— 10 أرقام تبدأ بـ 1 = موبايل مصري
 * بلا صفره). يُستخدم للمقارنة وللتخزين معاً حتى تكون الأرقام المستوردة
 * بنفس صيغة المدخلة يدوياً.
 */
export function normalizePhone(raw: unknown): string {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.startsWith('0020')) d = '0' + d.slice(4)
  else if (d.startsWith('20') && d.length === 12) d = '0' + d.slice(2)
  else if (d.length === 10 && d.startsWith('1')) d = '0' + d
  return d
}

/** تطبيع كود طالب للمقارنة */
export function normalizeCode(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/^#+/, '')
    .toUpperCase()
}

function cellText(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

/** سجل طالب مُستخرج من صف واحد بعد تطبيق خريطة الأعمدة */
export interface ParsedStudentRow {
  /** رقم الصف في الملف (1 = أول صف بيانات بعد الترويسات) */
  rowNumber: number
  name: string
  code: string | null
  grade: string | null
  school: string | null
  phone: string | null
  guardian_name: string | null
  guardian_phone: string | null
  group_name: string | null
  level_note: string | null
  /** نص السعر الخاص كما في الخلية (التحقق الرقمي في مرحلة التصنيف) */
  price_raw: string | null
}

/** تحويل صفوف خام (بعد صف الترويسات) لسجلات — الصفوف الفارغة تماماً تُتخطى */
export function rowsToStudents(
  rawRows: unknown[][],
  mapping: (ImportField | null)[],
): ParsedStudentRow[] {
  const out: ParsedStudentRow[] = []
  rawRows.forEach((cells, idx) => {
    const values = new Map<ImportField, string>()
    mapping.forEach((field, colIdx) => {
      if (!field) return
      const text = cellText(cells[colIdx])
      if (text) values.set(field, text)
    })
    if (values.size === 0) return
    const get = (f: ImportField) => values.get(f) ?? null
    const phoneNorm = (f: ImportField) => {
      const v = get(f)
      if (!v) return null
      return normalizePhone(v) || v
    }
    out.push({
      rowNumber: idx + 1,
      name: get('name') ?? '',
      code: get('code'),
      grade: get('grade'),
      school: get('school'),
      phone: phoneNorm('phone'),
      guardian_name: get('guardian_name'),
      guardian_phone: phoneNorm('guardian_phone'),
      group_name: get('group_name'),
      level_note: get('level_note'),
      price_raw: get('price_override'),
    })
  })
  return out
}

export type RowStatus = 'ready' | 'duplicate' | 'error'

export interface ClassifiedRow {
  row: ParsedStudentRow
  status: RowStatus
  /** سبب التكرار/الخطأ بالعربي — فارغ للجاهز */
  reason: string
  /** السعر الخاص المحلّل (null = سعر المجموعة الافتراضي) */
  price_override: number | null
}

/** الحد الأدنى/الأقصى المقبول لأرقام هاتف موجودة في الصف */
export function isPlausiblePhone(normalized: string): boolean {
  return normalized.length >= 7 && normalized.length <= 15
}

/**
 * تصنيف كل صف: خطأ ← تكرار (قاعدة بيانات ثم داخل الملف) ← جاهز.
 * existing: طلاب المدرس الحاليون (نحتاج الكود والموبايل فقط).
 */
export function classifyRows(
  rows: ParsedStudentRow[],
  existing: { public_code: string; phone: string | null }[],
): ClassifiedRow[] {
  const existingByCode = new Map<string, string>()
  const existingByPhone = new Map<string, string>()
  for (const s of existing) {
    const code = normalizeCode(s.public_code)
    if (code) existingByCode.set(code, s.public_code)
    const phone = normalizePhone(s.phone)
    if (phone) existingByPhone.set(phone, phone)
  }
  const seenCodes = new Map<string, number>()
  const seenPhones = new Map<string, number>()

  return rows.map((row) => {
    // — أخطاء بنيوية أولاً
    if (!row.name) {
      return { row, status: 'error' as RowStatus, reason: t('students.impReasonNameEmpty'), price_override: null }
    }
    let price: number | null = null
    if (row.price_raw != null && row.price_raw !== '') {
      const n = Number(String(row.price_raw).replace(/[,،\s]/g, ''))
      if (!Number.isFinite(n) || n < 0) {
        return {
          row,
          status: 'error' as RowStatus,
          reason: t('students.impReasonPriceInvalid', { price: row.price_raw }),
          price_override: null,
        }
      }
      price = n
    }
    if (row.phone) {
      const np = normalizePhone(row.phone)
      if (!isPlausiblePhone(np)) {
        return {
          row,
          status: 'error' as RowStatus,
          reason: t('students.impReasonPhoneInvalid', { phone: row.phone }),
          price_override: price,
        }
      }
    }

    // — تكرار ضد قاعدة البيانات
    const code = normalizeCode(row.code)
    if (code && existingByCode.has(code)) {
      return {
        row,
        status: 'duplicate' as RowStatus,
        reason: t('students.impReasonCodeExists', { code: row.code ?? '' }),
        price_override: price,
      }
    }
    const phone = normalizePhone(row.phone)
    if (phone && existingByPhone.has(phone)) {
      return {
        row,
        status: 'duplicate' as RowStatus,
        reason: t('students.impReasonPhoneExists', { phone: row.phone ?? '' }),
        price_override: price,
      }
    }

    // — تكرار داخل الملف نفسه
    if (code && seenCodes.has(code)) {
      return {
        row,
        status: 'duplicate' as RowStatus,
        reason: t('students.impReasonDupCodeInFile', { row: seenCodes.get(code) ?? 0 }),
        price_override: price,
      }
    }
    if (phone && seenPhones.has(phone)) {
      return {
        row,
        status: 'duplicate' as RowStatus,
        reason: t('students.impReasonDupPhoneInFile', { row: seenPhones.get(phone) ?? 0 }),
        price_override: price,
      }
    }
    if (code) seenCodes.set(code, row.rowNumber)
    if (phone) seenPhones.set(phone, row.rowNumber)

    return { row, status: 'ready' as RowStatus, reason: '', price_override: price }
  })
}

/** هل يبدو صف المثال في القالب؟ (حتى لا يُستورد لو رفعه المدرس كما هو) */
export function isTemplateExampleRow(row: ParsedStudentRow): boolean {
  return row.name.startsWith('مثال:')
}
