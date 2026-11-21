// ===========================================================================
// منطق احتفال إكمال حضور مجموعة (خطة الهوية والشخصية P-7 — 3A-305).
//
// آلة حالة نقية بلا أي React: صفحة الحضور تُطعمها ملاحظات (جلسة،
// مكتملة؟) فتقرر متى يظهر شريط الاحتفال. القواعد إلزامية من الخطة:
// ١) عند الانتقال للاكتمال فقط — جلسة تُفتح مكتملة أصلاً لا تحتفل
//    (الملاحظة الأولى لها تُسجَّل ولا تُطلق).
// ٢) مرة واحدة لكل جلسة طوال حياة الصفحة — فكّ آخر طالب وإعادة
//    ترميزه لا يعيد الاحتفال، والعودة لجلسة احتفلنا بها لا تكرره.
// ٣) الشريط يختفي عند فكّ الاكتمال أو تبديل الجلسة أو إخفاء المستخدم.
// «غير جاهز» (بيانات الحصة لم تصل بعد) ليس ملاحظة: لا يُسجَّل ولا
// يُطلق — حتى لا تتسرب حالة «مكتمل عند التحميل» عبر طور التحميل.
// ===========================================================================

export interface CelebrationTracker {
  /** آخر اكتمال ملحوظ لكل جلسة — أساس كشف الانتقال */
  prevComplete: Readonly<Record<string, boolean>>
  /** جلسات احتُفل بها فعلاً — لا تتكرر أبداً في حياة الصفحة */
  celebrated: ReadonlySet<string>
  /** الجلسة التي يظهر شريطها الآن، أو null */
  visibleSessionId: string | null
}

export const initialCelebrationTracker: CelebrationTracker = {
  prevComplete: {},
  celebrated: new Set<string>(),
  visibleSessionId: null,
}

/**
 * إطعام ملاحظة. isComplete = null تعني «لا ملاحظة» (البيانات لم
 * تجهز): لا تسجيل ولا إطلاق — فقط إخفاء شريط لا يخص الجلسة الحالية.
 * تعيد نفس المرجع عند غياب أي تغيير (استقرار اشتقاقي للصفحة).
 */
export function observeCompletion(
  tracker: CelebrationTracker,
  sessionId: string | null,
  isComplete: boolean | null,
): CelebrationTracker {
  if (!sessionId || isComplete === null) {
    return tracker.visibleSessionId !== null && tracker.visibleSessionId !== sessionId
      ? { ...tracker, visibleSessionId: null }
      : tracker
  }

  const prev = tracker.prevComplete[sessionId]
  let celebrated = tracker.celebrated
  let visibleSessionId = tracker.visibleSessionId
  if (visibleSessionId !== null && visibleSessionId !== sessionId) {
    visibleSessionId = null
  }
  if (isComplete && prev === false && !celebrated.has(sessionId)) {
    // الانتقال الوحيد المُطلق: غير مكتمل ← مكتمل، ولأول مرة للجلسة
    const nextCelebrated = new Set(celebrated)
    nextCelebrated.add(sessionId)
    celebrated = nextCelebrated
    visibleSessionId = sessionId
  } else if (!isComplete && visibleSessionId === sessionId) {
    visibleSessionId = null
  }

  if (
    prev === isComplete &&
    celebrated === tracker.celebrated &&
    visibleSessionId === tracker.visibleSessionId
  ) {
    return tracker
  }
  return {
    prevComplete: { ...tracker.prevComplete, [sessionId]: isComplete },
    celebrated,
    visibleSessionId,
  }
}

/** إخفاء المستخدم للشريط — الجلسة تبقى «محتفَلاً بها» فلا يعود */
export function dismissCelebration(tracker: CelebrationTracker): CelebrationTracker {
  return tracker.visibleSessionId === null
    ? tracker
    : { ...tracker, visibleSessionId: null }
}
