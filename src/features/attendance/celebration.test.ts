import { describe, expect, it } from 'vitest'
import {
  dismissCelebration,
  initialCelebrationTracker,
  observeCompletion,
  type CelebrationTracker,
} from './celebration'

const S1 = 'session-1'
const S2 = 'session-2'

function feed(
  steps: [string | null, boolean | null][],
  start: CelebrationTracker = initialCelebrationTracker,
): CelebrationTracker {
  return steps.reduce((t, [sid, complete]) => observeCompletion(t, sid, complete), start)
}

describe('احتفال إكمال الحضور (P-7) — آلة الحالة', () => {
  it('يظهر عند الانتقال من غير مكتمل إلى مكتمل', () => {
    const t = feed([
      [S1, false],
      [S1, true],
    ])
    expect(t.visibleSessionId).toBe(S1)
    expect(t.celebrated.has(S1)).toBe(true)
  })

  it('لا يظهر لجلسة تُفتح مكتملة أصلاً (الملاحظة الأولى تسجيل فقط)', () => {
    const t = feed([[S1, true]])
    expect(t.visibleSessionId).toBeNull()
    expect(t.celebrated.has(S1)).toBe(false)
  })

  it('«غير جاهز» (null) لا يُسجّل ولا يُطلق — اكتمال عند التحميل لا يحتفل', () => {
    const t = feed([
      [S1, null],
      [S1, null],
      [S1, true],
    ])
    expect(t.visibleSessionId).toBeNull()
    // وبعده: فكّ ثم إعادة إكمال = انتقال حقيقي ملحوظ فيحتفل
    const t2 = feed(
      [
        [S1, false],
        [S1, true],
      ],
      t,
    )
    expect(t2.visibleSessionId).toBe(S1)
  })

  it('مرة واحدة لكل جلسة: فكّ الاكتمال يخفي الشريط وإعادة الإكمال لا تعيده', () => {
    const t = feed([
      [S1, false],
      [S1, true], // يظهر
      [S1, false], // يختفي
      [S1, true], // لا يعود
    ])
    expect(t.visibleSessionId).toBeNull()
    expect(t.celebrated.has(S1)).toBe(true)
  })

  it('إخفاء المستخدم نهائي لنفس الجلسة', () => {
    let t = feed([
      [S1, false],
      [S1, true],
    ])
    expect(t.visibleSessionId).toBe(S1)
    t = dismissCelebration(t)
    expect(t.visibleSessionId).toBeNull()
    t = feed(
      [
        [S1, false],
        [S1, true],
      ],
      t,
    )
    expect(t.visibleSessionId).toBeNull()
  })

  it('تبديل الجلسة يخفي شريط الجلسة السابقة ولا يخلط الاحتفالات', () => {
    const t = feed([
      [S1, false],
      [S1, true], // احتفال S1 ظاهر
      [S2, false], // انتقلنا لجلسة أخرى
    ])
    expect(t.visibleSessionId).toBeNull()
    // إكمال الجلسة الثانية احتفال مستقل مشروع
    const t2 = feed([[S2, true]], t)
    expect(t2.visibleSessionId).toBe(S2)
    // والعودة للأولى المكتملة لا تعيد شريطها
    const t3 = feed([[S1, true]], t2)
    expect(t3.visibleSessionId).toBeNull()
  })

  it('حفظ جزئي لا يحتفل أبداً (سلسلة false متصلة)', () => {
    const t = feed([
      [S1, false],
      [S1, false],
      [S1, false],
    ])
    expect(t.visibleSessionId).toBeNull()
    expect(t.celebrated.size).toBe(0)
  })

  it('ملاحظة مكررة بلا تغيير تعيد نفس المرجع (استقرار)', () => {
    const t1 = feed([[S1, false]])
    const t2 = observeCompletion(t1, S1, false)
    expect(t2).toBe(t1)
  })
})
