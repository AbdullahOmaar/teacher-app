import { describe, expect, it } from 'vitest'
import {
  absenceStreakOf,
  atRiskWaUrl,
  compareAtRisk,
  hiddenByFollowup,
  monthsSpanWord,
  overdueDerivationOf,
  sessionsWord,
  type AtRiskReason,
  type AtRiskStudent,
  type SessionMarkInput,
} from './api'
import type { RosterStudent } from '../attendance/api'

const T = (day: number) => new Date(2026, 10, day, 16, 0).getTime()
const marks = (list: (string | null)[]): SessionMarkInput[] =>
  list.map((mark, i) => ({ at: T(i + 1), mark }))

describe('absenceStreakOf — سلسلة الغياب المتتالي', () => {
  it('يعدّ الغيابات المتتالية من الأحدث', () => {
    expect(absenceStreakOf(marks(['p', 'a', 'a', 'a']))).toEqual({
      streak: 3,
      lastAbsenceAt: T(4),
    })
  })
  it('غير المُعلَّمة تُتخطّى ولا تكسر السلسلة', () => {
    expect(absenceStreakOf(marks(['a', null, 'a', 'a'])).streak).toBe(3)
  })
  it('أول حالة غير غياب من الأحدث تكسر السلسلة فوراً', () => {
    expect(absenceStreakOf(marks(['a', 'a', 'a', 'p'])).streak).toBe(0)
    expect(absenceStreakOf(marks(['a', 'a', 'l', 'a'])).streak).toBe(1)
  })
  it('قائمة فارغة أو بلا غياب = صفر', () => {
    expect(absenceStreakOf([])).toEqual({ streak: 0, lastAbsenceAt: 0 })
    expect(absenceStreakOf(marks(['p', 'm']))).toEqual({ streak: 0, lastAbsenceAt: 0 })
  })
})

describe('overdueDerivationOf — امتداد المتأخرات', () => {
  const currentMonth = '2026-11-01'
  it('فاتورة أكتوبر ونحن في نوفمبر = متأخر شهرين (شاملاً الطرفين)', () => {
    const d = overdueDerivationOf(
      [{ invoice_id: 'i1', period_month: '2026-10-01', balance: 300 }],
      new Map([['i1', new Date(2026, 9, 5).getTime()]]),
      currentMonth,
    )
    expect(d?.monthsSpan).toBe(2)
    expect(d?.amount).toBe(300)
    // الحدث = بداية شهر التأخر (1 نوفمبر) لا إنشاء الفاتورة (5 أكتوبر)
    expect(d?.eventAt).toBe(new Date(2026, 10, 1).getTime())
  })
  it('فاتورة الشهر الماضي وحدها بلا امتداد كافٍ عند شهر واحد فقط', () => {
    // أقدم شهر = أكتوبر والشهر الحالي أكتوبر → الامتداد 1 < 2
    const d = overdueDerivationOf(
      [{ invoice_id: 'i1', period_month: '2026-09-01', balance: 100 }],
      new Map(),
      '2026-09-01',
    )
    expect(d).toBeNull()
  })
  it('يجمع فواتير متعددة ويأخذ أقدم شهر وأحدث حدث', () => {
    const created = new Date(2026, 10, 15).getTime() // فاتورة أُنشئت متأخرة
    const d = overdueDerivationOf(
      [
        { invoice_id: 'i1', period_month: '2026-09-01', balance: '150' },
        { invoice_id: 'i2', period_month: '2026-10-01', balance: 50 },
      ],
      new Map([['i2', created]]),
      currentMonth,
    )
    expect(d?.monthsSpan).toBe(3) // سبتمبر → نوفمبر شاملاً
    expect(d?.amount).toBe(200)
    expect(d?.eventAt).toBe(created)
  })
  it('بلا صفوف = null', () => {
    expect(overdueDerivationOf([], new Map(), currentMonth)).toBeNull()
  })
})

describe('hiddenByFollowup — إخفاء ما بعد المتابعة', () => {
  it('يخفي فقط إن كانت المتابعة أحدث من كل الأحداث', () => {
    expect(hiddenByFollowup([100, 200], 200)).toBe(true)
    expect(hiddenByFollowup([100, 300], 200)).toBe(false)
    expect(hiddenByFollowup([100], null)).toBe(false)
    expect(hiddenByFollowup([100], undefined)).toBe(false)
  })
})

describe('compareAtRisk — ترتيب القائمة', () => {
  const key = (reasonsCount: number, absenceStreak: number, overdueAmount: number, name: string) => ({
    reasonsCount,
    absenceStreak,
    overdueAmount,
    name,
  })
  it('أسباب أكثر أولاً، ثم غياب أطول، ثم مبلغ أكبر', () => {
    expect(compareAtRisk(key(2, 0, 0, 'ب'), key(1, 9, 900, 'أ'))).toBeLessThan(0)
    expect(compareAtRisk(key(1, 5, 0, 'ب'), key(1, 3, 900, 'أ'))).toBeLessThan(0)
    expect(compareAtRisk(key(1, 3, 500, 'ب'), key(1, 3, 100, 'أ'))).toBeLessThan(0)
  })
})

describe('صيغ الجمع العربية للخطر', () => {
  it('sessionsWord', () => {
    expect(sessionsWord(1)).toBe('1 حصة')
    expect(sessionsWord(4)).toBe('4 حصص')
    expect(sessionsWord(12)).toBe('12 حصة')
  })
  it('monthsSpanWord', () => {
    expect(monthsSpanWord(2)).toBe('شهرين')
    expect(monthsSpanWord(3)).toBe('3 شهور')
    expect(monthsSpanWord(12)).toBe('12 شهراً')
  })
})

describe('atRiskWaUrl — رابط متابعة واتساب (PAT-4أ)', () => {
  const student: RosterStudent = {
    id: 's1',
    name: 'أحمد سمير',
    public_code: 'ST-1',
    phone: '01001234567',
    guardian_name: 'محمد سمير',
    guardian_phone: '01112223334',
  }
  const item = (reasons: AtRiskReason[]): AtRiskStudent => ({
    student,
    reasons,
    absenceStreak: 0,
    overdueAmount: 0,
    contact: undefined,
  })
  const absence: AtRiskReason = {
    kind: 'absence',
    text: '',
    streak: 4,
    groupName: 'السبت',
    eventAt: 0,
  }
  const overdue: AtRiskReason = {
    kind: 'overdue',
    text: '',
    monthsSpan: 2,
    amount: 500,
    eventAt: 0,
  }
  const textOf = (url: string | null): string =>
    decodeURIComponent((url ?? '').split('?text=')[1] ?? '')

  it('سبب الغياب: تحية باسم السنتر + سطر الغياب + ختام', () => {
    const url = atRiskWaUrl(item([absence]), 'سنتر النور')
    expect(url?.startsWith('https://wa.me/201112223334?text=')).toBe(true)
    expect(textOf(url)).toBe(
      [
        'أهلاً محمد سمير، معاكم سنتر النور.',
        'بنطمن على أحمد سمير: غاب عن 4 حصص متتالية في مجموعة السبت، وحابين نتأكد إن مفيش مشكلة وإننا نقدر نساعد بأي شكل.',
        'شكراً لمتابعتكم، ويسعدنا دايماً تواصلكم معانا.',
      ].join('\n'),
    )
  })
  it('سبب المتأخرات: سطر الامتداد والمبلغ المنسّق', () => {
    expect(textOf(atRiskWaUrl(item([overdue]), 'سنتر النور'))).toContain(
      'بنذكّركم إن على أحمد سمير اشتراكاً متأخراً (شهرين) بمبلغ 500\u00A0ج — شاكرين تعاونكم في السداد في أقرب وقت ممكن.',
    )
  })
  it('السببان معاً: سطران بالترتيب', () => {
    const lines = textOf(atRiskWaUrl(item([absence, overdue]), 'سنتر النور')).split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[1]).toContain('غاب عن')
    expect(lines[2]).toContain('اشتراكاً متأخراً')
  })
  it('بلا اسم سنتر: البديل «السنتر»', () => {
    expect(textOf(atRiskWaUrl(item([absence]), null))).toContain('معاكم السنتر.')
    expect(textOf(atRiskWaUrl(item([absence]), '  '))).toContain('معاكم السنتر.')
  })
  it('null عند غياب أي رقم صالح', () => {
    const noPhones: AtRiskStudent = {
      ...item([absence]),
      student: { ...student, guardian_phone: null, phone: null },
    }
    expect(atRiskWaUrl(noPhones, 'سنتر النور')).toBeNull()
  })
})
