import { describe, expect, it, vi } from 'vitest'
import {
  addVisiblePayableToSelection,
  payableInvoices,
  runBulkPayments,
  selectionTotals,
  type BulkPayDeps,
  type InvoiceListItem,
} from './api'

/**
 * الدفع الجماعي (قرار المدير 2026-11-28): المنطق النقي للتحديد
 * (قابلية الدفع/تحديد الكل/الإجماليات بالقرش) وتنسيق التنفيذ المتسلسل
 * باعتمادات محقونة — إعادة قراءة الرصيد وقت التنفيذ، تخطي المسدّدة،
 * واستمرار الباقي عند فشل واحدة، بملخص صادق بلا ادّعاء ذرّية.
 */

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

describe('payableInvoices — القابل للدفع فقط', () => {
  it('رصيد موجب يمرّ، والمسددة (رصيد صفر) تُستبعد', () => {
    const out = payableInvoices([
      invItem({ invoice_id: 'due', balance: 300 }),
      invItem({ invoice_id: 'partial', balance: 100, paid: 200 }),
      invItem({ invoice_id: 'paid', balance: 0, paid: 300, is_paid: true }),
    ])
    expect(out.map((i) => i.invoice_id)).toEqual(['due', 'partial'])
  })
})

describe('addVisiblePayableToSelection — تحديد الكل على المرئي', () => {
  it('يضيف القابل للدفع من المرئي فقط ويحتفظ بالتحديد السابق (يبقى عبر الفلاتر)', () => {
    const visible = [
      invItem({ invoice_id: 'v-due', balance: 200 }),
      invItem({ invoice_id: 'v-paid', balance: 0, paid: 300, is_paid: true }),
      invItem({ invoice_id: 'v-partial', balance: 50, paid: 250 }),
    ]
    const next = addVisiblePayableToSelection(new Set(['older-hidden']), visible)
    expect([...next].sort()).toEqual(['older-hidden', 'v-due', 'v-partial'])
  })
  it('لا يكرر ولا يمسّ مجموعة الإدخال', () => {
    const current = new Set(['a'])
    const next = addVisiblePayableToSelection(current, [invItem({ invoice_id: 'a' })])
    expect([...next]).toEqual(['a'])
    expect([...current]).toEqual(['a'])
  })
})

describe('selectionTotals — عدّاد الشريط وإجمالي المتبقي', () => {
  it('يجمع بالقرش: 100.10 + 200.20 = 300.30 بلا ضوضاء فاصلة', () => {
    const rows = [
      invItem({ invoice_id: 'a', balance: 100.1 }),
      invItem({ invoice_id: 'b', balance: 200.2 }),
      invItem({ invoice_id: 'c', balance: 999 }),
    ]
    expect(selectionTotals(rows, new Set(['a', 'b']))).toEqual({ count: 2, total: 300.3 })
  })
  it('تحديد فارغ أو معرّفات غائبة: أصفار', () => {
    expect(selectionTotals([invItem({})], new Set())).toEqual({ count: 0, total: 0 })
    expect(selectionTotals([invItem({})], new Set(['missing']))).toEqual({ count: 0, total: 0 })
  })
})

describe('runBulkPayments — التنفيذ المتسلسل الصادق', () => {
  const deps = (over: Partial<BulkPayDeps>): BulkPayDeps => ({
    fetchBalance: async () => 300,
    pay: async () => ({ receiptNo: '2026-0001' }),
    ...over,
  })

  it('نجاح كامل: كل فاتورة تُدفع برصيدها المقروء وبإيصالها، بالترتيب', async () => {
    const balances: Record<string, number> = { a: 300, b: 250.5 }
    const paidCalls: [string, number][] = []
    const summary = await runBulkPayments(
      ['a', 'b'],
      deps({
        fetchBalance: async (id) => balances[id] ?? null,
        pay: async (id, amount) => {
          paidCalls.push([id, amount])
          return { receiptNo: `R-${id}` }
        },
      }),
    )
    expect(paidCalls).toEqual([
      ['a', 300],
      ['b', 250.5],
    ])
    expect(summary.paidCount).toBe(2)
    expect(summary.paidTotal).toBe(550.5)
    expect(summary.skippedCount).toBe(0)
    expect(summary.failedCount).toBe(0)
    expect(summary.results.map((r) => r.receiptNo)).toEqual(['R-a', 'R-b'])
  })

  it('الرصيد يُعاد قراءته وقت التنفيذ: انكماش الرصيد منذ التحديد يدفع المقروء الآن لا القديم', async () => {
    const paidCalls: [string, number][] = []
    const summary = await runBulkPayments(
      ['a'],
      deps({
        fetchBalance: async () => 120, // كان 300 وقت التحديد
        pay: async (id, amount) => {
          paidCalls.push([id, amount])
          return { receiptNo: 'R-1' }
        },
      }),
    )
    expect(paidCalls).toEqual([['a', 120]])
    expect(summary.paidTotal).toBe(120)
  })

  it('مسدّدة منذ التحديد (رصيد صفر) أو بلا صف رصيد: تُتخطّى ولا يُستدعى الدفع لها', async () => {
    const pay = vi.fn(async () => ({ receiptNo: 'R-x' }))
    const summary = await runBulkPayments(
      ['settled', 'missing'],
      deps({
        fetchBalance: async (id) => (id === 'settled' ? 0 : null),
        pay,
      }),
    )
    expect(pay).not.toHaveBeenCalled()
    expect(summary.skippedCount).toBe(2)
    expect(summary.paidCount).toBe(0)
    expect(summary.results.map((r) => r.status)).toEqual(['skipped', 'skipped'])
  })

  it('فشل جزئي: فاتورة ترفض فيكمل الباقي بعدها، والسبب محفوظ في الملخص', async () => {
    const order: string[] = []
    const summary = await runBulkPayments(
      ['a', 'bad', 'c'],
      deps({
        fetchBalance: async () => 100,
        pay: async (id) => {
          order.push(id)
          if (id === 'bad') throw new Error('المبلغ أكبر من المتبقي على الفاتورة')
          return { receiptNo: `R-${id}` }
        },
      }),
    )
    expect(order).toEqual(['a', 'bad', 'c'])
    expect(summary.paidCount).toBe(2)
    expect(summary.failedCount).toBe(1)
    expect(summary.paidTotal).toBe(200)
    const failed = summary.results.find((r) => r.invoiceId === 'bad')
    expect(failed?.status).toBe('failed')
    expect(failed?.reason).toBe('المبلغ أكبر من المتبقي على الفاتورة')
  })

  it('فشل قراءة الرصيد نفسه = فشل مُبلَّغ لفاتورته فقط، والباقي يكمل', async () => {
    const summary = await runBulkPayments(
      ['x', 'y'],
      deps({
        fetchBalance: async (id) => {
          if (id === 'x') throw new Error('network down')
          return 50
        },
        pay: async () => ({ receiptNo: 'R-y' }),
      }),
    )
    expect(summary.failedCount).toBe(1)
    expect(summary.results[0]).toMatchObject({ invoiceId: 'x', status: 'failed', reason: 'network down' })
    expect(summary.paidCount).toBe(1)
  })

  it('قائمة فارغة: ملخص أصفار بلا أي استدعاء', async () => {
    const fetchBalance = vi.fn(async () => 100)
    const summary = await runBulkPayments([], deps({ fetchBalance }))
    expect(fetchBalance).not.toHaveBeenCalled()
    expect(summary).toMatchObject({ paidCount: 0, paidTotal: 0, skippedCount: 0, failedCount: 0 })
  })
})
