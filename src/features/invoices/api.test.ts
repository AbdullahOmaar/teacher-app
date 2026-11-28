import { describe, expect, it } from 'vitest'
import type { GroupRow, InvoiceBalanceRow } from '../../types/database'
import {
  baseChargeFor,
  buildReceiptMessage,
  calendarSessionsInMonth,
  clampedDiscount,
  DEFAULT_WA_TEMPLATE,
  isUnpaid,
  payStateOf,
  periodLabel,
  periodYm,
  RECEIPT_TEMPLATE_KEYS,
  receiptWaUrl,
  splitArrears,
  summarizeStudentInvoices,
  summarizeUnpaidByStudent,
  type InvoiceListItem,
} from './api'

describe('isUnpaid — تعريف غير المسدد الموحد (PAT-4)', () => {
  it('رصيد موجب = غير مسدد، صفر أو سالب = مسدد', () => {
    expect(isUnpaid({ balance: 1 })).toBe(true)
    expect(isUnpaid({ balance: 0 })).toBe(false)
    expect(isUnpaid({ balance: -50 })).toBe(false)
  })
})

describe('payStateOf — حالة سداد الفاتورة', () => {
  it('رصيد صفر أو أقل = مسددة', () => {
    expect(payStateOf({ total: 300, paid: 300, balance: 0 })).toBe('paid')
    expect(payStateOf({ total: 0, paid: 0, balance: 0 })).toBe('paid')
  })
  it('رصيد مع دفع جزئي = جزئية، وبلا دفع = مستحقة', () => {
    expect(payStateOf({ total: 300, paid: 100, balance: 200 })).toBe('partial')
    expect(payStateOf({ total: 300, paid: 0, balance: 300 })).toBe('due')
  })
})

describe('تسميات الفترة', () => {
  it('periodYm و periodLabel', () => {
    expect(periodYm('2026-11-01')).toBe('2026-11')
    expect(periodLabel('2026-11-01')).toBe('نوفمبر 2026')
    expect(periodLabel('2026-01-01')).toBe('يناير 2026')
  })
})

describe('calendarSessionsInMonth — البديل التقويمي', () => {
  const group: Pick<GroupRow, 'days'> = { days: [1, 3] } // اثنين + أربعاء
  it('يعدّ أيام الجدول داخل الشهر', () => {
    // نوفمبر 2026: الاثنين 2,9,16,23,30 (5) + الأربعاء 4,11,18,25 (4)
    expect(calendarSessionsInMonth(group, '2026-11-01')).toBe(9)
  })
  it('بلا أيام = صفر', () => {
    expect(calendarSessionsInMonth({ days: [] }, '2026-11-01')).toBe(0)
  })
})

describe('baseChargeFor — البند الأساسي للأنظمة الأربعة (§2.3)', () => {
  const ym = '2026-11'
  it('شهري ثابت: السعر كما هو', () => {
    expect(
      baseChargeFor({ billingType: 'monthly_fixed', price: 300, ym, prepaidQty: 0, attendedCount: 0 }),
    ).toEqual({ amount: 300, desc: 'اشتراك 2026-11' })
  })
  it('باقة أسبوعية: 4 × السعر', () => {
    expect(
      baseChargeFor({ billingType: 'weekly_package', price: 100, ym, prepaidQty: 0, attendedCount: 0 }),
    ).toEqual({ amount: 400, desc: 'باقة شهر 2026-11 (4 أسابيع)' })
  })
  it('مدفوعة مسبقاً: الكمية × السعر', () => {
    expect(
      baseChargeFor({ billingType: 'per_session_prepaid', price: 50, ym, prepaidQty: 8, attendedCount: 0 }),
    ).toEqual({ amount: 400, desc: '8 حصة مدفوعة مسبقاً' })
  })
  it('حسب الحضور: مرات الحضور × السعر — وصفر عند غياب الحضور', () => {
    expect(
      baseChargeFor({ billingType: 'per_session_attended', price: 40, ym, prepaidQty: 0, attendedCount: 5 }),
    ).toEqual({ amount: 200, desc: 'حصص حضرها (5)' })
    expect(
      baseChargeFor({ billingType: 'per_session_attended', price: 40, ym, prepaidQty: 0, attendedCount: 0 }),
    ).toEqual({ amount: 0, desc: 'حصص حضرها (0)' })
  })
})

describe('clampedDiscount — قصّ الخصم عند البند الأساسي', () => {
  it('خصم أصغر يمر كما هو، وأكبر يُقصّ، وسالب الأساس = صفر', () => {
    expect(clampedDiscount(100, 300)).toBe(100)
    expect(clampedDiscount(500, 300)).toBe(300)
    expect(clampedDiscount(100, 0)).toBe(0)
    expect(clampedDiscount(100, -50)).toBe(0)
  })
})

describe('رسالة الإيصال (§5.6)', () => {
  it('buildReceiptMessage يعوّض كل المتغيرات', () => {
    const msg = buildReceiptMessage(DEFAULT_WA_TEMPLATE, {
      guardian: 'أم أحمد',
      name: 'أحمد',
      periodMonth: '2026-11-01',
      paid: 200,
      total: 300,
      balance: 100,
    })
    expect(msg).toBe(
      'أهلاً أم أحمد، إيصال الطالب أحمد عن 2026-11: المدفوع 200\u00A0ج من 300\u00A0ج، والمتبقي 100\u00A0ج. شكراً لك.',
    )
  })
  it('قائمة RECEIPT_TEMPLATE_KEYS هي نفسها مفاتيح المحرك (مصدر وحيد للحقيقة)', () => {
    // منتقي المفاتيح في محرر القالب بيعرض القائمة دي — أي مفتاح فيها
    // لازم المحرك يعوّضه فعلاً، وأي مفتاح في القالب الافتراضي لازم
    // يكون فيها.
    const tpl = RECEIPT_TEMPLATE_KEYS.map((k) => k.key).join(' ')
    const msg = buildReceiptMessage(tpl, {
      guardian: 'ولي',
      name: 'طالب',
      periodMonth: '2026-11-01',
      paid: 1,
      total: 2,
      balance: 1,
    })
    expect(msg).not.toContain('{')
    for (const { key } of RECEIPT_TEMPLATE_KEYS) {
      expect(DEFAULT_WA_TEMPLATE).toContain(key)
    }
  })
  it('receiptWaUrl يفضّل رقم ولي الأمر ثم رقم الطالب', () => {
    expect(receiptWaUrl({ guardian_phone: '01012345678', phone: '01112345678' }, 'x')).toContain(
      'https://wa.me/201012345678',
    )
    expect(receiptWaUrl({ guardian_phone: null, phone: '01112345678' }, 'x')).toContain(
      'https://wa.me/201112345678',
    )
    expect(receiptWaUrl({ guardian_phone: null, phone: null }, 'x')).toBeNull()
  })
})

describe('splitArrears — تقسيم متأخرات الرئيسية (M4 — 3A-361)', () => {
  const row = (period_month: string, balance: number): InvoiceBalanceRow => ({
    invoice_id: `inv-${period_month}-${balance}`,
    teacher_id: 't1',
    student_id: 's1',
    group_id: 'g1',
    period_month,
    total: 300,
    paid: 300 - balance,
    balance,
    is_paid: balance <= 0,
  })

  it('يقسّم على حدّ الشهر: فترة الشهر الحالي مستحقة، والأقدم متأخرة', () => {
    const rows = [
      row('2026-11-01', 300), // مستحق هذا الشهر
      row('2026-11-01', 150), // مستحق هذا الشهر
      row('2026-10-01', 200), // متأخر
      row('2026-09-01', 100), // متأخر
    ]
    expect(splitArrears(rows, '2026-11-01')).toEqual({
      unpaidCount: 4,
      arrearsTotal: 750,
      dueThisMonthCount: 2,
      dueThisMonthTotal: 450,
      overdueCount: 2,
      overdueTotal: 300,
    })
  })

  it('فواتير أشهر قادمة غير مسددة تدخل الإجمالي فقط — لا المستحق ولا المتأخر', () => {
    const rows = [row('2026-12-01', 300), row('2026-11-01', 100)]
    const split = splitArrears(rows, '2026-11-01')
    expect(split.unpaidCount).toBe(2)
    expect(split.arrearsTotal).toBe(400)
    expect(split.dueThisMonthCount).toBe(1)
    expect(split.overdueCount).toBe(0)
  })

  it('صفوف فارغة = أصفار كلها', () => {
    expect(splitArrears([], '2026-11-01')).toEqual({
      unpaidCount: 0,
      arrearsTotal: 0,
      dueThisMonthCount: 0,
      dueThisMonthTotal: 0,
      overdueCount: 0,
      overdueTotal: 0,
    })
  })

  it('مسدد بالكامل = أصفار حتى مع فواتير في الشهر الحالي وشهور أقدم', () => {
    const rows = [row('2026-11-01', 0), row('2026-10-01', 0), row('2026-09-01', -50)]
    expect(splitArrears(rows, '2026-11-01')).toEqual({
      unpaidCount: 0,
      arrearsTotal: 0,
      dueThisMonthCount: 0,
      dueThisMonthTotal: 0,
      overdueCount: 0,
      overdueTotal: 0,
    })
  })
})

// ---------------------------------------------------------------------------
// استخراج PAT-4 (دفعة #10): اختبارات توصيف للدالتين المستخرجتين حرفياً من
// InvoicesPage وStudentPaymentsTab — تثبت السلوك القائم قبل/بعد النقل.
// ---------------------------------------------------------------------------

const invItem = (over: Partial<InvoiceListItem>): InvoiceListItem => ({
  invoice_id: 'inv-1',
  teacher_id: 't1',
  student_id: 's1',
  group_id: 'g1',
  period_month: '2026-11-01',
  total: 300,
  paid: 0,
  balance: 300,
  is_paid: false,
  created_at: '2026-11-01T00:00:00Z',
  student_name: 'أحمد سمير',
  student_code: 'ST-1',
  group_name: 'السبت',
  ...over,
})

describe('summarizeUnpaidByStudent — تجميع غير المسدد لكل طالب', () => {
  const CM = '2026-11'
  it('قائمة فارغة: مجموعتان فارغتان بأصفار', () => {
    expect(summarizeUnpaidByStudent([], CM)).toEqual({
      overdue: { rows: [], total: 0, count: 0 },
      currentDue: { rows: [], total: 0, count: 0 },
    })
  })
  it('يجمّع فواتير الطالب الواحد ويرتّب تنازلياً بالمبلغ', () => {
    const out = summarizeUnpaidByStudent(
      [
        invItem({ invoice_id: 'a', student_id: 's1', balance: 300 }),
        invItem({ invoice_id: 'b', student_id: 's1', balance: 100, period_month: '2026-11-01' }),
        invItem({ invoice_id: 'c', student_id: 's2', student_name: 'خالد', balance: 500 }),
      ],
      CM,
    )
    expect(out.currentDue.rows).toEqual([
      { studentId: 's2', name: 'خالد', total: 500 },
      { studentId: 's1', name: 'أحمد سمير', total: 400 },
    ])
    expect(out.currentDue.total).toBe(900)
    expect(out.currentDue.count).toBe(2)
    expect(out.overdue).toEqual({ rows: [], total: 0, count: 0 })
  })
  it('الحد الفاصل: فترة أقدم = متأخر، والشهر الحالي والأحدث = مستحق حالي', () => {
    const out = summarizeUnpaidByStudent(
      [
        invItem({ invoice_id: 'old', period_month: '2026-10-01', balance: 200 }),
        invItem({ invoice_id: 'cur', period_month: '2026-11-01', balance: 300 }),
        invItem({ invoice_id: 'fut', period_month: '2026-12-01', balance: 400 }),
      ],
      CM,
    )
    expect(out.overdue.rows).toEqual([{ studentId: 's1', name: 'أحمد سمير', total: 200 }])
    expect(out.currentDue.total).toBe(700)
  })
  it('المسددة (رصيد صفر) تُستبعد من المجموعتين', () => {
    const out = summarizeUnpaidByStudent(
      [invItem({ balance: 0, paid: 300, is_paid: true })],
      CM,
    )
    expect(out.currentDue.count).toBe(0)
    expect(out.overdue.count).toBe(0)
  })
})

describe('summarizeStudentInvoices — ملخص فواتير طالب واحد', () => {
  it('المستحق من غير المسدد فقط، والمدفوع من الكل', () => {
    expect(
      summarizeStudentInvoices([
        invItem({ balance: 300, paid: 0 }),
        invItem({ balance: 0, paid: 250, is_paid: true }),
        invItem({ balance: 100, paid: 50 }),
      ]),
    ).toEqual({ dueTotal: 400, dueCount: 2, totalPaid: 300 })
  })
  it('قائمة فارغة: أصفار', () => {
    expect(summarizeStudentInvoices([])).toEqual({ dueTotal: 0, dueCount: 0, totalPaid: 0 })
  })
})
