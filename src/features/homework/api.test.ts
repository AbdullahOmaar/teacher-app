import { describe, expect, it } from 'vitest'
import type { AttendanceStatus } from '../../types/database'
import { summarizeHomework } from './api'

const v = (status: AttendanceStatus | null, homework_done: boolean) => ({ status, homework_done })

describe('summarizeHomework — ملخص واجب من قيم حضور فعّالة', () => {
  it('يحسب الحاضرين فقط (p/l/m) ويسلّم منهم، والغائب وبلا حالة خارج العدّ', () => {
    const summary = summarizeHomework([
      v('p', true),
      v('l', false),
      v('m', true),
      v('a', true), // غائب مع واجب مسلّم — لا يدخل العدّ
      v(null, true), // بلا حالة — لا يدخل العدّ
    ])
    expect(summary).toEqual({ attended: 3, submitted: 2, pending: 1, rate: 67 })
  })

  it('قائمة فارغة = أصفار ونسبة null (لا نخترع صفراً)', () => {
    expect(summarizeHomework([])).toEqual({ attended: 0, submitted: 0, pending: 0, rate: null })
  })

  it('بلا حاضرين إطلاقاً = نسبة null حتى مع واجب مسلّم على الغائبين', () => {
    expect(summarizeHomework([v('a', true), v(null, true)])).toEqual({
      attended: 0,
      submitted: 0,
      pending: 0,
      rate: null,
    })
  })

  it('كل الحاضرين سلّموا = نسبة 100% وpending صفر', () => {
    expect(
      summarizeHomework([v('p', true), v('p', true), v('l', true)]),
    ).toEqual({ attended: 3, submitted: 3, pending: 0, rate: 100 })
  })

  it('لا أحد سلّم = نسبة 0% (حاضرون موجودون)', () => {
    expect(summarizeHomework([v('p', false), v('m', false)])).toEqual({
      attended: 2,
      submitted: 0,
      pending: 2,
      rate: 0,
    })
  })

  it('النسبة تُقرَّب لأقرب عدد صحيح (1 من 3 = 33%)', () => {
    expect(summarizeHomework([v('p', true), v('p', false), v('p', false)])).toEqual({
      attended: 3,
      submitted: 1,
      pending: 2,
      rate: 33,
    })
  })
})
