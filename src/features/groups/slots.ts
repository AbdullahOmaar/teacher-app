import { shortTime, timeToMin } from '../../lib/format'
import type { GroupSlot } from '../../types/database'

// ===========================================================================
// مواعيد المجموعة الأسبوعية (3A-926) — منطق نقي حول عمود groups.slots
// (0070): التفسير من jsonb الخام مع سقوط للأعمدة القديمة، اشتقاق المرايا
// القديمة من المواعيد، التحقق قبل الحفظ، وكشف التداخل بين موعدين.
// القاعدة الذهبية: slots (حين توجد وعناصرها صالحة) هي مصدر الحقيقة؛
// والأعمدة days/start_time/duration_minutes مرايا للقراء القائمين فقط.
// ===========================================================================

/** الحقول القديمة التي تُشتق منها المواعيد عند غياب slots الصالحة */
export interface LegacySchedule {
  days: number[]
  start_time: string
  duration_minutes: number
}

function isValidSlot(v: unknown): v is GroupSlot {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return (
    typeof s.day === 'number' &&
    Number.isInteger(s.day) &&
    s.day >= 0 &&
    s.day <= 6 &&
    typeof s.start_time === 'string' &&
    /^\d{1,2}:\d{2}/.test(s.start_time) &&
    typeof s.duration_minutes === 'number' &&
    Number.isFinite(s.duration_minutes) &&
    s.duration_minutes > 0
  )
}

/** مواعيد مشتقة من الأعمدة القديمة: موعد لكل يوم بنفس الوقت والمدة */
export function slotsFromLegacy(legacy: LegacySchedule): GroupSlot[] {
  return [...legacy.days]
    .sort((a, b) => a - b)
    .map((day) => ({
      day,
      start_time: shortTime(legacy.start_time),
      duration_minutes: legacy.duration_minutes,
    }))
}

/**
 * تفسير مواعيد مجموعة من قيمتها الخام: عناصر slots الصالحة كما هي
 * (بوقت مقصوص لـ "HH:MM")؛ فإن غابت أو خلت من أي عنصر صالح، تُشتق من
 * الأعمدة القديمة — فمجموعة كتبها عميل أقدم أو لم تُرحَّل بياناتها بعد
 * تظهر مواعيدها صحيحة في كل مكان.
 */
export function parseGroupSlots(raw: unknown, legacy: LegacySchedule): GroupSlot[] {
  if (Array.isArray(raw)) {
    const valid = raw
      .filter(isValidSlot)
      .map((s) => ({ day: s.day, start_time: shortTime(s.start_time), duration_minutes: s.duration_minutes }))
    if (valid.length > 0) return valid
  }
  return slotsFromLegacy(legacy)
}

/** مواعيد صف مجموعة كما تُقرأ من القاعدة (slots + مراياها في نفس الصف) */
export function groupSlotsOf(group: LegacySchedule & { slots?: unknown }): GroupSlot[] {
  return parseGroupSlots(group.slots, group)
}

/**
 * المرايا القديمة المشتقة من المواعيد: days = كل أيام المواعيد مرتبة
 * وفريدة، وstart_time/duration_minutes = أول موعد (بعد ترتيب اليوم ثم
 * الوقت) — تُكتب مع كل حفظ حتى يبقى كل قارئ قديم (بوابات/قوائم) صحيحاً
 * في حدود ما يستطيع عرضه.
 */
export function slotsToMirrors(slots: GroupSlot[]): LegacySchedule {
  const sorted = [...slots].sort(
    (a, b) => a.day - b.day || timeToMin(a.start_time) - timeToMin(b.start_time),
  )
  const days = [...new Set(sorted.map((s) => s.day))]
  return {
    days,
    start_time: sorted[0]?.start_time ?? '15:00',
    duration_minutes: sorted[0]?.duration_minutes ?? 60,
  }
}

/** مشكلة تحقق المواعيد قبل الحفظ — null = سليمة (المدة الدنيا 30 كقاعدة النموذج القائمة) */
export function slotProblem(slots: GroupSlot[]): 'empty' | 'time' | 'duration' | null {
  if (slots.length === 0) return 'empty'
  for (const s of slots) {
    if (!s.start_time || !/^\d{1,2}:\d{2}$/.test(s.start_time)) return 'time'
    if (!Number.isInteger(s.duration_minutes) || s.duration_minutes < 30) return 'duration'
  }
  return null
}

/** تداخل موعدين: نفس اليوم وتقاطع فترتيهما الزمنيتين (بداية/نهاية بالدقائق) */
export function slotsOverlap(a: GroupSlot, b: GroupSlot): boolean {
  if (a.day !== b.day) return false
  const aStart = timeToMin(a.start_time)
  const bStart = timeToMin(b.start_time)
  return aStart < bStart + b.duration_minutes && bStart < aStart + a.duration_minutes
}
