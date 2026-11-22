import { describe, expect, it } from 'vitest'
import type { GroupRow } from '../../types/database'
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
  receiptWaUrl,
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
  const group = { days: [1, 3] } as unknown as GroupRow // اثنين + أربعاء
  it('يعدّ أيام الجدول داخل الشهر', () => {
    // نوفمبر 2026: الاثنين 2,9,16,23,30 (5) + الأربعاء 4,11,18,25 (4)
    expect(calendarSessionsInMonth(group, '2026-11-01')).toBe(9)
  })
  it('بلا أيام = صفر', () => {
    expect(calendarSessionsInMonth({ days: [] } as unknown as GroupRow, '2026-11-01')).toBe(0)
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
