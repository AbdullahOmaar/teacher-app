import { describe, expect, it } from 'vitest'
import { summarizeDailyAudit, type DailyAuditInput } from './dailyAudit'

// اختبارات تلخيص تدقيق اليوم (مهمة 11 — بند 4): القضايا بترتيب ثابت،
// وفرق الخزنة لا يُحكم عليه بلا إغلاق أصلاً.
describe('تلخيص تدقيق اليوم', () => {
  const clean: DailyAuditInput = {
    closingExists: true,
    cashboxDiffers: false,
    pendingProofs: 0,
    failedNotifications: 0,
  }
  it('يوم نظيف تماماً: لا قضايا', () => {
    expect(summarizeDailyAudit(clean)).toEqual([])
  })
  it('يوم مفتوح: قضية الإغلاق فقط — لا حكم على فرق بلا إغلاق', () => {
    expect(summarizeDailyAudit({ ...clean, closingExists: false, cashboxDiffers: true })).toEqual([
      'day-open',
    ])
  })
  it('إغلاق بفرق: قضية فرق الخزنة', () => {
    expect(summarizeDailyAudit({ ...clean, cashboxDiffers: true })).toEqual(['cashbox-diff'])
  })
  it('إيصالات معلّقة وإشعارات فاشلة تُدرج بعدّاداتها', () => {
    expect(summarizeDailyAudit({ ...clean, pendingProofs: 3, failedNotifications: 2 })).toEqual([
      'pending-proofs',
      'failed-notifications',
    ])
  })
  it('كل القضايا معاً بالترتيب الثابت', () => {
    expect(
      summarizeDailyAudit({
        closingExists: false,
        cashboxDiffers: false,
        pendingProofs: 1,
        failedNotifications: 1,
      }),
    ).toEqual(['day-open', 'pending-proofs', 'failed-notifications'])
  })
})
