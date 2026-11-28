import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../../i18n'
import { importStudentsFromFile, type FileImportItem } from './api'
import type { ClassifiedRow, ParsedStudentRow } from './logic'

/**
 * تنفيذ الاستيراد — حارس الأرشفة (عيب سند الحي 2026-11-28):
 * صف يستهدف مجموعة مؤرشفة يفشل وحده برسالة واضحة (الطالب يُنشأ —
 * كسابقة حارس السعة — لكن تسجيله يُرفض ويُسجَّل في ملخص الاستيراد)،
 * وبقية الصفوف تكمل بلا توقف.
 */

const h = vi.hoisted(() => ({
  createdIds: [] as string[],
  enrollCalls: [] as string[],
}))

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    createStudent: async (_teacherId: string, input: { name: string }) => {
      const id = `stu-${input.name}`
      h.createdIds.push(id)
      return { id, name: input.name }
    },
    upsertEnrollment: async (
      _teacherId: string,
      input: { student_id: string; group_id: string },
    ) => {
      h.enrollCalls.push(input.group_id)
      if (input.group_id === 'g-archived') {
        throw new Error(t('students.enrollGroupArchived', { name: 'مجموعة مؤرشفة' }))
      }
      return { id: 'enr-1' }
    },
  }
})

function row(over: Partial<ParsedStudentRow> & { name: string }): ParsedStudentRow {
  return {
    rowNumber: 1,
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
  }
}

function item(name: string): FileImportItem {
  const classified: ClassifiedRow = {
    row: row({ name }),
    status: 'ready',
    reason: '',
    price_override: null,
  }
  return { classified, includeDuplicate: false }
}

beforeEach(() => {
  h.createdIds = []
  h.enrollCalls = []
})

describe('importStudentsFromFile — صف يستهدف مجموعة مؤرشفة', () => {
  it('صفان يستهدفان مجموعة مؤرشفة: كل صف يفشل وحده برسالة الأرشفة ولا يوقف الاستيراد', async () => {
    const result = await importStudentsFromFile(
      't1',
      [item('طالب مؤرشف'), item('طالب مؤرشف ٢')],
      'g-archived',
    )
    // الصفان نُفذا (الاستيراد لا يتوقف عند أول فشل): الطالبان أُنشئا
    // لكن تسجيلهما رُفض، وكل رفض مسجَّل برسالة تسمّي المجموعة المؤرشفة
    expect(result.created).toBe(2)
    expect(result.enrolled).toBe(0)
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]).toContain('مجموعة مؤرشفة')
    expect(result.errors[0]).toContain('طالب مؤرشف')
    expect(result.errors[1]).toContain('طالب مؤرشف ٢')
  })

  it('صف إلى مجموعة نشطة يُسجَّل بنجاح', async () => {
    const result = await importStudentsFromFile('t1', [item('طالب نشط')], 'g-active')
    expect(result.created).toBe(1)
    expect(result.enrolled).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(h.enrollCalls).toContain('g-active')
  })

  it('بلا مجموعة: يُنشأ الطالب بلا تسجيل وبلا خطأ', async () => {
    const result = await importStudentsFromFile('t1', [item('طالب بلا مجموعة')], null)
    expect(result.created).toBe(1)
    expect(result.enrolled).toBe(0)
    expect(result.errors).toHaveLength(0)
  })
})
