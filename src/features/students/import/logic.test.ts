import { describe, expect, it } from 'vitest'
import { classifyRows, type ParsedStudentRow } from './logic'
import { t } from '../../../i18n'

const row = (over: Partial<ParsedStudentRow> & { rowNumber: number }): ParsedStudentRow => ({
  name: '',
  code: null,
  grade: null,
  school: null,
  phone: null,
  guardian_name: null,
  guardian_phone: null,
  group_name: null,
  level_note: null,
  price_raw: null,
  ...over,
})

const existing = [
  { name: 'أحمد محمد علي', public_code: 'K7X2P9QW', phone: '01001234567' },
  { name: 'سارة علي', public_code: 'AB12CD34', phone: null },
]

describe('classifyRows — كشف التكرار (3A-913)', () => {
  it('كود مطابق لطالب حالي ⇒ duplicate', () => {
    const [c] = classifyRows([row({ rowNumber: 1, name: 'غيره', code: 'k7x2p9qw' })], existing)
    expect(c.status).toBe('duplicate')
    expect(c.reason).toBe(t('students.impReasonCodeExists', { code: 'k7x2p9qw' }))
  })
  it('موبايل مطابق لطالب حالي ⇒ duplicate', () => {
    const [c] = classifyRows(
      [row({ rowNumber: 1, name: 'غيره', phone: '01001234567' })],
      existing,
    )
    expect(c.status).toBe('duplicate')
  })
  it('مكرر داخل الملف بنفس الكود/الموبايل ⇒ duplicate للثاني فقط', () => {
    const out = classifyRows(
      [
        row({ rowNumber: 1, name: 'أ', phone: '01112223334' }),
        row({ rowNumber: 2, name: 'ب', phone: '01112223334' }),
      ],
      [],
    )
    expect(out.map((c) => c.status)).toEqual(['ready', 'duplicate'])
    expect(out[1].reason).toBe(t('students.impReasonDupPhoneInFile', { row: 1 }))
  })
  it('قاعدة 4: صف بلا كود ولا موبايل بنفس اسم طالب حالي ⇒ duplicate', () => {
    const [c] = classifyRows([row({ rowNumber: 1, name: 'أحمد محمد علي' })], existing)
    expect(c.status).toBe('duplicate')
    expect(c.reason).toBe(t('students.impReasonNameExists', { name: 'أحمد محمد علي' }))
  })
  it('قاعدة 4: صفان بلا مفتاح بنفس الاسم داخل الملف ⇒ الثاني duplicate', () => {
    const out = classifyRows(
      [
        row({ rowNumber: 1, name: 'مريم حسن' }),
        row({ rowNumber: 2, name: 'مريم  حسن' }),
      ],
      [],
    )
    expect(out.map((c) => c.status)).toEqual(['ready', 'duplicate'])
    expect(out[1].reason).toBe(t('students.impReasonDupNameInFile', { row: 1 }))
  })
  it('قاعدة 4: اسم بلا مفتاح غير موجود ⇒ ready', () => {
    const [c] = classifyRows([row({ rowNumber: 1, name: 'عمر خالد' })], existing)
    expect(c.status).toBe('ready')
  })
  it('قاعدة 4: صف بمفتاح بنفس اسم طالب حالي لا يُعلَّم بالاسم', () => {
    const [c] = classifyRows(
      [row({ rowNumber: 1, name: 'أحمد محمد علي', code: 'ZZ99ZZ99', phone: '01599998888' })],
      existing,
    )
    expect(c.status).toBe('ready')
  })
  it('قاعدة 4: صف بلا مفتاح بنفس اسم صف سابق بمفتاح لا يُعلَّم', () => {
    const out = classifyRows(
      [
        row({ rowNumber: 1, name: 'أحمد محمد علي', phone: '01112223334' }),
        row({ rowNumber: 2, name: 'أحمد محمد علي' }),
      ],
      [],
    )
    expect(out.map((c) => c.status)).toEqual(['ready', 'ready'])
  })
})
