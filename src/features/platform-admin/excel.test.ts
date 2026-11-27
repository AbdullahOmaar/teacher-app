import { describe, expect, it, vi } from 'vitest'
import {
  autoMapAllowlistHeaders,
  buildAllowlistTemplateXlsxBlob,
  buildWorkspacesXlsxBlob,
  buildWorkspacesXlsxRows,
  isValidAllowlistEmail,
  logExcelAudit,
  normalizeAllowlistPhone,
  parseAllowlistFile,
  runAllowlistImport,
  validateAllowlistRow,
  type AllowlistImportField,
} from './excel'
import type { PlatformWorkspace } from './panel'

/**
 * اختبارات استيراد/تصدير Excel لأدمن المنصة (مهمة 23 — 3A-898):
 * تطبيع الهاتف والتحقق وخريطة الترويسات وتشغيل الاستيراد صفاً صفاً
 * والتصدير والقالب — كلها نقية بلا اتصال حي؛ db() موهوم بالكامل
 * ونداءات الإدراج تُحقن كدوال وهمية.
 */

const h = vi.hoisted(() => ({
  rpcResult: { data: null as unknown, error: null as unknown },
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
}))

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    rpc: (name: string, args: unknown) => {
      h.rpcCalls.push({ name, args })
      return Promise.resolve(h.rpcResult)
    },
  }),
}))

function workspace(over: Partial<PlatformWorkspace> = {}): PlatformWorkspace {
  return {
    teacherId: 't-1',
    displayName: 'أحمد محمد',
    ownerEmail: 'ahmed@example.com',
    createdAt: '2026-01-15T10:00:00.000Z',
    accountActivated: true,
    planSlug: 'basic',
    subscriptionStatus: 'active',
    trialEndsAt: null,
    studentsCount: 12,
    lastActivityAt: '2026-11-20T08:30:00.000Z',
    ...over,
  }
}

async function xlsxFile(rows: string[][], name = 'allowlist.xlsx'): Promise<File> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const blob = await writeXlsxFile(rows, { sheet: 'السماح' }).toBlob()
  return new File([blob], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

describe('normalizeAllowlistPhone — استعادة صفر Excel', () => {
  it('يبقي 010 كما هو', () => {
    expect(normalizeAllowlistPhone('01001234567')).toBe('01001234567')
  })
  it('يستعيد الصفر من خلية رقمية (100… → 0100…)', () => {
    expect(normalizeAllowlistPhone(1001234567)).toBe('01001234567')
  })
  it('يفك +20 و0020 إلى 010', () => {
    expect(normalizeAllowlistPhone('+201001234567')).toBe('01001234567')
    expect(normalizeAllowlistPhone('00201001234567')).toBe('01001234567')
  })
  it('يزيل المسافات والشرطات', () => {
    expect(normalizeAllowlistPhone('0100 123-4567')).toBe('01001234567')
  })
  it('رقم غير مصري يمرّ كما هو فيُرفض عند التحقق', () => {
    expect(normalizeAllowlistPhone('123')).toBe('123')
  })
})

describe('isValidAllowlistEmail', () => {
  it('يقبل بريداً سليماً ويرفض بلا @ أو بلا نطاق', () => {
    expect(isValidAllowlistEmail('Teacher@Example.com')).toBe(true)
    expect(isValidAllowlistEmail('not-an-email')).toBe(false)
    expect(isValidAllowlistEmail('a@b')).toBe(false)
    expect(isValidAllowlistEmail('')).toBe(false)
  })
})

describe('autoMapAllowlistHeaders — ترويسات عربية وإنجليزية', () => {
  it('يرسم الأعمدة الثلاثة من ترويسات عربية', () => {
    expect(
      autoMapAllowlistHeaders(['البريد الإلكتروني', 'الموبايل', 'ملاحظة']),
    ).toEqual(['email', 'phone', 'note'])
  })
  it('يرسم من ترويسات إنجليزية ويتجاهل الأعمدة المجهولة', () => {
    expect(autoMapAllowlistHeaders(['Email', 'Something', 'Phone'])).toEqual([
      'email',
      null,
      'phone',
    ])
  })
  it('أول عمود يفوز عند تنافس عمودين على نفس الحقل', () => {
    expect(autoMapAllowlistHeaders(['email', 'e-mail'])).toEqual([
      'email',
      null,
    ])
  })
})

describe('validateAllowlistRow', () => {
  const mapping: (AllowlistImportField | null)[] = ['email', 'phone', 'note']
  it('بريد فقط — يُخزَّن بصيغة صغيرة', () => {
    const out = validateAllowlistRow(['Teacher@Example.COM', '', 'طيار'], mapping)
    expect(out).toEqual({
      ok: true,
      entry: { email: 'teacher@example.com', phone: null, note: 'طيار' },
    })
  })
  it('موبايل فقط — يستعيد صفر الخلية الرقمية', () => {
    const out = validateAllowlistRow(['', 1001234567, ''], mapping)
    expect(out).toEqual({
      ok: true,
      entry: { email: null, phone: '01001234567', note: null },
    })
  })
  it('صف بلا أي اتصال مرفوض no-contact', () => {
    expect(validateAllowlistRow(['', '', 'ملاحظة'], mapping)).toEqual({
      ok: false,
      reason: 'no-contact',
    })
  })
  it('بريد مشوّه مرفوض bad-email', () => {
    expect(validateAllowlistRow(['not-an-email', '', ''], mapping)).toEqual({
      ok: false,
      reason: 'bad-email',
    })
  })
  it('موبايل غير مصري مرفوض bad-phone', () => {
    expect(validateAllowlistRow(['', '123', ''], mapping)).toEqual({
      ok: false,
      reason: 'bad-phone',
    })
  })
})

describe('buildWorkspacesXlsxRows — صفوف التصدير', () => {
  it('يرسم الأعمدة السبع من بيانات يراها الأدمن أصلاً', () => {
    const { headers, rows } = buildWorkspacesXlsxRows([
      workspace(),
      workspace({
        teacherId: 't-2',
        displayName: 'سارة علي',
        ownerEmail: 'sara@example.com',
        accountActivated: false,
        planSlug: null,
        studentsCount: 0,
        lastActivityAt: null,
      }),
    ])
    expect(headers).toHaveLength(7)
    expect(rows[0]?.[0]).toBe('أحمد محمد')
    expect(rows[0]?.[1]).toBe('ahmed@example.com')
    expect(rows[0]?.[2]).toBe('أساسي')
    expect(rows[0]?.[3]).toBe('مفعّل')
    expect(rows[0]?.[4]).toBe(12)
    expect(rows[1]?.[2]).toBe('بلا اشتراك')
    expect(rows[1]?.[3]).toBe('موقوف')
    expect(rows[1]?.[4]).toBe(0)
    expect(rows[1]?.[5]).toBe('لا نشاط بعد')
  })
  it('تاريخ فاسد يظهر شرطة بدل Invalid Date', () => {
    const { rows } = buildWorkspacesXlsxRows([
      workspace({ createdAt: 'not-a-date' }),
    ])
    expect(rows[0]?.[6]).toBe('—')
  })
})

describe('buildWorkspacesXlsxBlob + القالب — جولة كاملة', () => {
  it('ملف التصدير يُقرأ راجعاً بنفس الترويسات والصفوف', async () => {
    const blob = await buildWorkspacesXlsxBlob([workspace()])
    const { default: readXlsxFile } = await import('read-excel-file/browser')
    const sheets = await readXlsxFile(new File([blob], 'w.xlsx'))
    expect(sheets[0]?.data[0]?.[0]).toBe('الاسم')
    expect(sheets[0]?.data[1]?.[0]).toBe('أحمد محمد')
    expect(sheets[0]?.data[1]?.[4]).toBe(12)
  })
  it('القالب ترويسات فقط بلا صف مثال', async () => {
    const blob = await buildAllowlistTemplateXlsxBlob()
    const parsed = await parseAllowlistFile(new File([blob], 'template.xlsx'))
    expect(parsed.headers).toEqual(['البريد الإلكتروني', 'الموبايل', 'ملاحظة'])
    expect(parsed.rawRows).toHaveLength(0)
  })
})

describe('parseAllowlistFile', () => {
  it('يقرأ xlsx بترويسات عربية وصفوف', async () => {
    const file = await xlsxFile([
      ['البريد الإلكتروني', 'الموبايل', 'ملاحظة'],
      ['a@example.com', '01001234567', 'طيار'],
      ['b@example.com', '', ''],
    ])
    const parsed = await parseAllowlistFile(file)
    expect(parsed.headers).toEqual(['البريد الإلكتروني', 'الموبايل', 'ملاحظة'])
    expect(parsed.rawRows).toHaveLength(2)
    expect(parsed.rawRows[0]?.[0]).toBe('a@example.com')
  })
  it('يقرأ CSV بـ BOM ويحفظ الصفر البادئ', async () => {
    const text = 'البريد الإلكتروني,الموبايل\r\na@example.com,01001234567\r\n'
    const file = new File(['\uFEFF' + text], 'allowlist.csv', { type: 'text/csv' })
    const parsed = await parseAllowlistFile(file)
    expect(parsed.headers).toEqual(['البريد الإلكتروني', 'الموبايل'])
    expect(parsed.rawRows[0]?.[1]).toBe('01001234567')
  })
  it('يرفض صيغة غير مدعومة برسالة قاموس', async () => {
    const file = new File(['x'], 'allowlist.txt', { type: 'text/plain' })
    await expect(parseAllowlistFile(file)).rejects.toThrow(
      'صيغة الملف غير مدعومة',
    )
  })
  it('يرفض ملفاً أكبر من 5MB', async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.xlsx')
    await expect(parseAllowlistFile(big)).rejects.toThrow('أكبر من 5 ميجا')
  })
  it('يرفض ملفاً بأكثر من 1000 صف', async () => {
    const rows = [['البريد الإلكتروني']]
    for (let i = 0; i < 1001; i++) rows.push([`u${i}@example.com`])
    const file = await xlsxFile(rows)
    await expect(parseAllowlistFile(file)).rejects.toThrow('1000')
  })
})

describe('runAllowlistImport — نتيجة لكل صف', () => {
  const headers = ['البريد الإلكتروني', 'الموبايل', 'ملاحظة']
  it('مضاف + مكرر ضد القائمة + مكرر داخل الملف + غير صالح + فاشل', async () => {
    const calls: Array<{ email: string; phone: string; note: string }> = []
    const addEntry = async (input: {
      email: string
      phone: string
      note: string
    }) => {
      if (input.email === 'fail@example.com') {
        throw new Error('boom')
      }
      calls.push(input)
    }
    const summary = await runAllowlistImport(
      {
        fileName: 'a.xlsx',
        headers,
        rawRows: [
          ['new@example.com', '', ''], // مضاف
          ['EXISTING@example.com', '', ''], // مكرر (بلا حساسية حالة)
          ['new@example.com', '', ''], // مكرر داخل الملف
          ['bad-email', '', ''], // غير صالح
          ['', '123', ''], // غير صالح
          ['', '', ''], // فارغ — يُتخطى بصمت
          ['fail@example.com', '', ''], // فشل
        ],
      },
      [{ email: 'existing@example.com', phone: null }],
      addEntry,
    )
    expect(summary.added).toBe(1)
    expect(summary.duplicates).toBe(2)
    expect(summary.invalid).toBe(2)
    expect(summary.failed).toBe(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.email).toBe('new@example.com')
    expect(summary.details).toEqual([
      { row: 3, status: 'duplicate', reason: 'duplicate' },
      { row: 4, status: 'duplicate', reason: 'duplicate' },
      { row: 5, status: 'invalid', reason: 'bad-email' },
      { row: 6, status: 'invalid', reason: 'bad-phone' },
      { row: 8, status: 'failed', reason: 'failed' },
    ])
  })
  it('خطأ 23505 من القاعدة يُصنَّف مكرراً (سباق إضافة موازٍ)', async () => {
    const addEntry = async () => {
      const error = new Error('duplicate key') as Error & { code: string }
      error.code = '23505'
      throw error
    }
    const summary = await runAllowlistImport(
      {
        fileName: 'a.xlsx',
        headers,
        rawRows: [['race@example.com', '', '']],
      },
      [],
      addEntry,
    )
    expect(summary.duplicates).toBe(1)
    expect(summary.failed).toBe(0)
    expect(summary.details).toEqual([
      { row: 2, status: 'duplicate', reason: 'duplicate' },
    ])
  })
  it('مكرر الهاتف ضد القائمة يُكتشف بعد استعادة الصفر', async () => {
    const calls: unknown[] = []
    const summary = await runAllowlistImport(
      {
        fileName: 'a.xlsx',
        headers,
        rawRows: [['', 1001234567, '']],
      },
      [{ email: null, phone: '01001234567' }],
      async () => {
        calls.push(1)
      },
    )
    expect(summary.duplicates).toBe(1)
    expect(calls).toHaveLength(0)
  })
})

describe('logExcelAudit — best-effort لا يرمي أبداً', () => {
  it('فشل RPC يُبتلع بصمت', async () => {
    h.rpcResult = { data: null, error: new Error('function missing') }
    await expect(
      logExcelAudit('workspaces_exported', { rows: 3 }),
    ).resolves.toBeUndefined()
  })
  it('نجاح RPC يمرّر الإجراء والتفاصيل', async () => {
    h.rpcCalls = []
    h.rpcResult = { data: 'id-1', error: null }
    await logExcelAudit('allowlist_imported', { added: 2 })
    expect(h.rpcCalls).toEqual([
      {
        name: 'log_platform_audit',
        args: {
          p_action: 'allowlist_imported',
          p_target_teacher_id: null,
          p_details: { added: 2 },
        },
      },
    ])
  })
})
