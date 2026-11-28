import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { createPayment } from './apiPayments'

/**
 * حارس الدفع الزائد (3A-910): ‏createPayment كان يقبل أي مبلغ موجب —
 * دفعة 500 على فاتورة رصيدها 400 كانت تمرّ وتترك الرصيد −100. هذه
 * الاختبارات تثبت العقد الجديد: القراءة الحية من invoice_balances قبل
 * حجز رقم الإيصال، والرفض برسالة عربية ودودة عند التجاوز، والسماح عند
 * المساواة التامة والدفع الجزئي.
 */

const h = vi.hoisted(() => ({
  /** رصيد الـview — ‏null يعني غياب الصف (فاتورة لا تخص المدرس) */
  balance: null as number | null,
  balanceError: null as unknown,
  rpcCalls: 0,
  insertCalls: 0,
  insertedAmount: null as number | null,
}))

vi.mock('../../lib/supabase', () => {
  function balancesChain() {
    const chain: Record<string, unknown> = {}
    chain.select = () => chain
    chain.eq = () => chain
    chain.maybeSingle = async () => ({
      data: h.balance === null ? null : { balance: h.balance },
      error: h.balanceError,
    })
    return chain
  }
  function paymentsChain() {
    const chain: Record<string, unknown> = {}
    chain.insert = (payload: { amount: number }) => {
      h.insertCalls++
      h.insertedAmount = payload.amount
      return chain
    }
    chain.select = () => chain
    chain.single = async () => ({
      data: {
        id: 'pay-1',
        teacher_id: 't1',
        invoice_id: 'inv1',
        amount: h.insertedAmount ?? 0,
        method: 'cash',
        paid_on: '2026-11-27',
        receipt_no: '2026-0001',
        reverses_payment_id: null,
        voided: false,
        created_at: '2026-11-27T00:00:00Z',
      },
      error: null,
    })
    return chain
  }
  return {
    db: () => ({
      from: (table: string) => (table === 'invoice_balances' ? balancesChain() : paymentsChain()),
      rpc: async () => {
        h.rpcCalls++
        return { data: '2026-0001', error: null }
      },
    }),
    supabase: {},
  }
})

vi.mock('../activity/api', () => ({ logActivity: async () => {} }))
vi.mock('../home/api', () => ({ todayStr: () => '2026-11-27' }))

async function catchErr(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
  } catch (e) {
    return e
  }
  throw new Error('expected the promise to reject')
}

const INPUT = { amount: 500, method: 'cash' as const, paid_on: '2026-11-27' }

beforeEach(() => {
  h.balance = null
  h.balanceError = null
  h.rpcCalls = 0
  h.insertCalls = 0
  h.insertedAmount = null
})

describe('createPayment — حارس الدفع الزائد (3A-910)', () => {
  it('مبلغ أكبر من الرصيد يُرفض بالرسالة الودّية — بلا حجز رقم وبلا إدراج', async () => {
    h.balance = 400
    const err = await catchErr(createPayment('t1', 'inv1', INPUT))
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe(t('invoices.apiErrorPaymentExceedsBalance', { balance: 400 }))
    expect(h.rpcCalls).toBe(0)
    expect(h.insertCalls).toBe(0)
  })

  it('مبلغ يساوي الرصيد تماماً يمرّ ويُدرج', async () => {
    h.balance = 400
    const payment = await createPayment('t1', 'inv1', { ...INPUT, amount: 400 })
    expect(payment.receipt_no).toBe('2026-0001')
    expect(payment.amount).toBe(400)
    expect(h.insertCalls).toBe(1)
  })

  it('دفع جزئي أصغر من الرصيد يمرّ ويُدرج', async () => {
    h.balance = 400
    const payment = await createPayment('t1', 'inv1', { ...INPUT, amount: 150 })
    expect(payment.amount).toBe(150)
    expect(h.insertCalls).toBe(1)
  })

  it('فاتورة مسددة (رصيد صفر) ترفض أي دفعة جديدة', async () => {
    h.balance = 0
    const err = await catchErr(createPayment('t1', 'inv1', { ...INPUT, amount: 50 }))
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe(t('invoices.apiErrorPaymentExceedsBalance', { balance: 0 }))
    expect(h.insertCalls).toBe(0)
  })

  it('غياب صف الرصيد (فاتورة لا تخص المدرس) = رفض مغلق الاتجاه', async () => {
    h.balance = null
    const err = await catchErr(createPayment('t1', 'inv1', { ...INPUT, amount: 50 }))
    expect(err).toBeInstanceOf(Error)
    expect(h.insertCalls).toBe(0)
  })

  it('مبلغ صفر أو سالب ما زال يُرفض بالرسالة الأصلية قبل قراءة الرصيد', async () => {
    h.balance = 400
    const err = await catchErr(createPayment('t1', 'inv1', { ...INPUT, amount: 0 }))
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe(t('invoices.apiErrorPaymentAmount'))
    expect(h.rpcCalls).toBe(0)
    expect(h.insertCalls).toBe(0)
  })

  it('خطأ قراءة الرصيد يمرّ كما هو (مصير صريح — لا ابتلاع)', async () => {
    const dbErr = { message: 'boom', code: 'XX000' }
    h.balanceError = dbErr
    const err = await catchErr(createPayment('t1', 'inv1', { ...INPUT, amount: 50 }))
    expect(err).toBe(dbErr)
    expect(h.insertCalls).toBe(0)
  })
})
