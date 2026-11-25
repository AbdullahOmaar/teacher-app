import { describe, expect, it } from 'vitest'
import {
  agingBucket,
  balanceOf,
  daysBetween,
  lineTotal,
  linesError,
  linesTotal,
  round2,
  salePaymentError,
  summarizePayables,
} from './ledgerCalc'

describe('round2 / line totals', () => {
  it('rounds halves up to 2 decimals', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.675)).toBe(2.68)
  })
  it('computes a line total from quantity × unit price', () => {
    expect(lineTotal({ description: 'كتاب', quantity: 12, unit_price: 45.5 })).toBe(546)
  })
  it('sums lines without float drift', () => {
    const total = linesTotal([
      { description: 'a', quantity: 3, unit_price: 0.1 },
      { description: 'b', quantity: 7, unit_price: 0.2 },
    ])
    expect(total).toBe(1.7)
  })
  it('empty lines total zero', () => {
    expect(linesTotal([])).toBe(0)
  })
})

describe('balanceOf', () => {
  it('unpaid when nothing was paid', () => {
    expect(balanceOf(1000, 0)).toEqual({ total: 1000, paid: 0, remaining: 1000, status: 'unpaid' })
  })
  it('partial when some was paid', () => {
    expect(balanceOf(1000, 250).status).toBe('partial')
    expect(balanceOf(1000, 250).remaining).toBe(750)
  })
  it('paid when fully settled', () => {
    expect(balanceOf(1000, 1000).status).toBe('paid')
  })
  it('overpaid when payments exceed the total (reversal pending)', () => {
    const b = balanceOf(1000, 1100)
    expect(b.status).toBe('overpaid')
    expect(b.remaining).toBe(-100)
  })
})

describe('linesError', () => {
  it('rejects an empty list', () => {
    expect(linesError([])).toBe('empty')
  })
  it('rejects blank descriptions, non-positive quantities, negative prices', () => {
    expect(linesError([{ description: '  ', quantity: 1, unit_price: 5 }])).toBe('description')
    expect(linesError([{ description: 'x', quantity: 0, unit_price: 5 }])).toBe('quantity')
    expect(linesError([{ description: 'x', quantity: 1, unit_price: -1 }])).toBe('price')
  })
  it('accepts a free line (price 0) — gifts/samples are legitimate', () => {
    expect(linesError([{ description: 'عينة', quantity: 2, unit_price: 0 }])).toBeNull()
  })
})

describe('salePaymentError', () => {
  it('accepts 0..total and rejects outside', () => {
    expect(salePaymentError(500, 0)).toBeNull()
    expect(salePaymentError(500, 500)).toBeNull()
    expect(salePaymentError(500, -1)).toBe('negative')
    expect(salePaymentError(500, 500.01)).toBe('exceeds')
  })
})

describe('aging', () => {
  it('counts whole days between ISO dates', () => {
    expect(daysBetween('2026-11-01', '2026-11-25')).toBe(24)
    expect(daysBetween('2026-11-25', '2026-11-25')).toBe(0)
  })
  it('buckets by age boundaries', () => {
    const today = '2026-11-25'
    expect(agingBucket('2026-11-25', today)).toBe('d0_30')
    expect(agingBucket('2026-10-26', today)).toBe('d0_30')
    expect(agingBucket('2026-10-25', today)).toBe('d31_60')
    expect(agingBucket('2026-09-25', today)).toBe('d61_90')
    expect(agingBucket('2026-08-26', today)).toBe('over90')
  })
  it('summarizes only outstanding remainders per bucket', () => {
    const out = summarizePayables(
      [
        { purchase_date: '2026-11-20', remaining: 100 },
        { purchase_date: '2026-11-01', remaining: 50 },
        { purchase_date: '2026-09-01', remaining: 200 },
        { purchase_date: '2026-08-01', remaining: 0 },
        { purchase_date: '2026-08-01', remaining: -30 },
      ],
      '2026-11-25',
    )
    expect(out).toEqual({ d0_30: 150, d31_60: 0, d61_90: 200, over90: 0 })
  })
})
