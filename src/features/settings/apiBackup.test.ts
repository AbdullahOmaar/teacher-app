import { describe, expect, it } from 'vitest'
import { parseBackupJson } from './apiBackup'

/** نسخة صالحة دنيا: صيغة + إصدار + قسم واحد بصف واحد */
const validBackup = (data: Record<string, unknown>) =>
  JSON.stringify({ format: 'teacher-app-backup', version: 1, data })

describe('parseBackupJson — التحقق من بنية النسخة قبل أي كتابة', () => {
  it('نسخة صالحة: ok مع عدّادات الأقسام', () => {
    const res = parseBackupJson(
      validBackup({ groups: [{ id: 'g1' }], students: [{ id: 's1' }, { id: 's2' }] }),
    )
    expect(res.ok).toBe(true)
    expect(res.errors).toEqual([])
    expect(res.counts?.groups).toBe(1)
    expect(res.counts?.students).toBe(2)
    expect(res.hasSettings).toBe(false)
    expect(res.backup).toBeDefined()
  })

  it('نسخة بلا صفوف لكن بإعدادات = صالحة (hasSettings)', () => {
    const res = parseBackupJson(validBackup({ teacher_settings: {} }))
    expect(res.ok).toBe(true)
    expect(res.hasSettings).toBe(true)
  })

  it('JSON معطوب = مرفوض برسالة واحدة', () => {
    const res = parseBackupJson('{nope')
    expect(res.ok).toBe(false)
    expect(res.errors).toHaveLength(1)
  })

  it('جذر ليس كائناً (مصفوفة/عدد/فارغ) = مرفوض', () => {
    for (const text of ['[]', '42', '', 'null']) {
      expect(parseBackupJson(text).ok).toBe(false)
    }
  })

  it('نسخة التطبيق المرجعي القديم ({state, extras}) = مرفوضة برسالة واضحة', () => {
    const res = parseBackupJson(JSON.stringify({ state: {}, extras: {} }))
    expect(res.ok).toBe(false)
    expect(res.errors).toHaveLength(1)
  })

  it('صيغة غير معروفة = مرفوضة', () => {
    const res = parseBackupJson(validBackup({}).replace('teacher-app-backup', 'other-format'))
    expect(res.ok).toBe(false)
    expect(res.errors).toHaveLength(1)
  })

  it('إصدار مفقود أو غير صحيح = مرفوض', () => {
    expect(parseBackupJson(JSON.stringify({ format: 'teacher-app-backup', data: {} })).ok).toBe(
      false,
    )
    expect(
      parseBackupJson(JSON.stringify({ format: 'teacher-app-backup', version: 0, data: {} })).ok,
    ).toBe(false)
    expect(
      parseBackupJson(JSON.stringify({ format: 'teacher-app-backup', version: 1.5, data: {} })).ok,
    ).toBe(false)
  })

  it('إصدار أحدث من المدعوم = مرفوض', () => {
    const res = parseBackupJson(
      JSON.stringify({ format: 'teacher-app-backup', version: 99, data: {} }),
    )
    expect(res.ok).toBe(false)
    expect(res.errors).toHaveLength(1)
  })

  it('data مفقودة أو ليست كائناً = مرفوضة', () => {
    expect(
      parseBackupJson(JSON.stringify({ format: 'teacher-app-backup', version: 1 })).ok,
    ).toBe(false)
    expect(
      parseBackupJson(JSON.stringify({ format: 'teacher-app-backup', version: 1, data: [] })).ok,
    ).toBe(false)
  })

  it('قسم ليس قائمة = مرفوض، وصف تالف داخل قائمة = مرفوض', () => {
    expect(parseBackupJson(validBackup({ groups: {} })).ok).toBe(false)
    expect(parseBackupJson(validBackup({ groups: [null] })).ok).toBe(false)
    expect(parseBackupJson(validBackup({ groups: ['g1'] })).ok).toBe(false)
  })

  it('قسم ناقص = صفر (لا يُرفض)، ونسخة بلا صفوف ولا إعدادات = مرفوضة كفارغة', () => {
    const res = parseBackupJson(validBackup({ groups: [{ id: 'g1' }] }))
    expect(res.ok).toBe(true)
    expect(res.counts?.students).toBe(0)
    const empty = parseBackupJson(validBackup({}))
    expect(empty.ok).toBe(false)
    expect(empty.errors).toHaveLength(1)
  })

  it('teacher_settings ليست كائناً = مرفوضة', () => {
    expect(parseBackupJson(validBackup({ teacher_settings: [] })).ok).toBe(false)
  })
})
