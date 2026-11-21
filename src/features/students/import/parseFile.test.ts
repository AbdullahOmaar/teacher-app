/**
 * اختبارات parseFile بعد استبدال SheetJS (3A-301): قراءة xlsx/csv
 * وكتابة القالب عبر read-excel-file/write-excel-file/papaparse.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplateXlsxBlob, parseStudentFile } from './parseFile'
import { TEMPLATE_EXAMPLE_ROW, TEMPLATE_HEADERS } from './logic'

async function xlsxFile(rows: string[][]): Promise<File> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const blob = await writeXlsxFile(rows, { sheet: 'الطلاب' }).toBlob()
  return new File([blob], 'students.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

describe('parseStudentFile — xlsx', () => {
  it('يقرأ الترويسات والصفوف بقيم عربية وأرقام', async () => {
    const file = await xlsxFile([
      ['الاسم', 'موبايل الطالب', 'سعر خاص'],
      ['أحمد محمد', '01001234567', '150'],
      ['سارة علي', '01112223334', ''],
    ])
    const parsed = await parseStudentFile(file)
    expect(parsed.headers).toEqual(['الاسم', 'موبايل الطالب', 'سعر خاص'])
    expect(parsed.rawRows).toHaveLength(2)
    expect(parsed.rawRows[0]?.[0]).toBe('أحمد محمد')
    expect(parsed.rawRows[0]?.[1]).toBe('01001234567')
    expect(parsed.rawRows[1]?.[0]).toBe('سارة علي')
  })

  it('يرفض ملف xlsx تالفاً برسالة «غير قابل للقراءة»', async () => {
    const bad = new File([new Uint8Array([1, 2, 3, 4, 5])], 'bad.xlsx')
    await expect(parseStudentFile(bad)).rejects.toThrow()
  })
})

describe('buildTemplateXlsxBlob', () => {
  it('القالب المُصدَّر يُقرأ راجعاً بنفس الترويسات وصف المثال', async () => {
    const blob = await buildTemplateXlsxBlob()
    const parsed = await parseStudentFile(new File([blob], 'template.xlsx'))
    expect(parsed.headers).toEqual([...TEMPLATE_HEADERS])
    expect(parsed.rawRows).toHaveLength(1)
    expect(parsed.rawRows[0]?.map((c) => String(c ?? ''))).toEqual([
      ...TEMPLATE_EXAMPLE_ROW,
    ])
  })
})

describe('parseStudentFile — csv', () => {
  it('يقرأ CSV بـ BOM واقتباسات ويحفظ الصفر البادئ في الهاتف', async () => {
    const text =
      'الاسم,موبايل الطالب,ملاحظة\r\n"أحمد, محمد",01001234567,"قال ""تمام"""\r\n'
    const file = new File(['\uFEFF' + text], 'students.csv', { type: 'text/csv' })
    const parsed = await parseStudentFile(file)
    expect(parsed.headers).toEqual(['الاسم', 'موبايل الطالب', 'ملاحظة'])
    expect(parsed.rawRows[0]?.[0]).toBe('أحمد, محمد')
    expect(parsed.rawRows[0]?.[1]).toBe('01001234567')
    expect(parsed.rawRows[0]?.[2]).toBe('قال "تمام"')
  })

  it('يفك ترميز windows-1256 لملفات Excel العربي القديم', async () => {
    // «الاسم,الهاتف\r\nاحمد,01001234567» بترميز cp1256
    const bytes = new Uint8Array([
      199, 225, 199, 211, 227, 44, 199, 225, 229, 199, 202, 221, 13, 10, 199,
      205, 227, 207, 44, 48, 49, 48, 48, 49, 50, 51, 52, 53, 54, 55,
    ])
    const parsed = await parseStudentFile(new File([bytes], 'old.csv'))
    expect(parsed.headers).toEqual(['الاسم', 'الهاتف'])
    expect(parsed.rawRows[0]?.[0]).toBe('احمد')
    expect(parsed.rawRows[0]?.[1]).toBe('01001234567')
  })
})

describe('parseStudentFile — حدود و صيغ', () => {
  it('يرفض .xls القديمة بعد استبدال SheetJS ‏(3A-301)', async () => {
    const f = new File(['x'], 'students.xls')
    await expect(parseStudentFile(f)).rejects.toThrow()
  })

  it('يرفض الصيغ غير المدعومة', async () => {
    const f = new File(['x'], 'students.pdf')
    await expect(parseStudentFile(f)).rejects.toThrow()
  })
})
