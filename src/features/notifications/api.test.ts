import { describe, expect, it } from 'vitest'
import type { AppAlert } from './api'
import { overdueListText, prepaidLeft, prepaidZone } from './api'

describe('prepaidLeft — باقي الباقة (§5.7)', () => {
  it('المدفوع مسبقاً ناقص الحضور الفعلي', () => {
    expect(prepaidLeft(8, 5)).toBe(3)
    expect(prepaidLeft(8, 8)).toBe(0)
  })
  it('لا ينزل تحت الصفر أبداً', () => {
    expect(prepaidLeft(4, 9)).toBe(0)
    expect(prepaidLeft(0, 0)).toBe(0)
  })
})

describe('prepaidZone — تصنيف عرض الباقة (W4 — R-7)', () => {
  it('النفاد تنبيه فردي عاجل', () => {
    expect(prepaidZone(0, 8)).toBe('urgent')
    expect(prepaidZone(0, 0)).toBe('urgent')
  })
  it('باقٍ ≥ 1 ونسبته ≤ 25% يدخل منطقة المتابعة المجمّعة', () => {
    expect(prepaidZone(1, 4)).toBe('follow') // 25% بالضبط
    expect(prepaidZone(2, 8)).toBe('follow') // 25%
    expect(prepaidZone(1, 8)).toBe('follow') // 12.5%
  })
  it('فوق 25% لا تنبيه', () => {
    expect(prepaidZone(1, 3)).toBeNull() // 33%
    expect(prepaidZone(3, 8)).toBeNull() // 37.5%
    expect(prepaidZone(5, 8)).toBeNull()
  })
  it('باقة بحجم صفري لا تُقسّم عليها', () => {
    expect(prepaidZone(1, 0)).toBeNull()
  })
})

describe('overdueListText — قائمة المتأخرات كنص قابل للنسخ (§3.13)', () => {
  const alert = (kind: AppAlert['kind'], text: string): AppAlert => ({ kind, text, to: '/x' })

  it('يجمع نصوص تنبيهات fin فقط، سطر لكل تنبيه، بالترتيب', () => {
    expect(
      overdueListText([
        alert('fin', 'أحمد — متأخر 200 ج'),
        alert('att', 'حصة اليوم 10 ص'),
        alert('fin', 'سارة — متأخرة 150 ج'),
        alert('prepaid', 'باقة عمر أوشكت على النفاد'),
      ]),
    ).toBe('أحمد — متأخر 200 ج\nسارة — متأخرة 150 ج')
  })

  it('تنبيه fin واحد = نصه وحده بلا سطر جديد', () => {
    expect(overdueListText([alert('fin', 'متأخر واحد')])).toBe('متأخر واحد')
  })

  it('بلا تنبيهات fin = نص فارغ', () => {
    expect(overdueListText([alert('att', 'حصة'), alert('grade', 'درجة')])).toBe('')
  })

  it('قائمة فارغة = نص فارغ', () => {
    expect(overdueListText([])).toBe('')
  })
})
