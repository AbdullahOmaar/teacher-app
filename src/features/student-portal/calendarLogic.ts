import type { StudentPortalSession } from './api'

/**
 * منطق كاليندر «حصصي القادمة» النقي (ملاحظة المالك 2026-11-28):
 * مفاتيح الشهور وشبكة الشهر وتجميع الحصص بالتاريخ — بلا أي React،
 * فيُختبر وحده وتستهلكه الواجهة كما هو.
 */

/** مفتاح شهر 'YYYY-MM' من تاريخ 'YYYY-MM-DD' */
export function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7)
}

/** إزاحة شهرية على مفتاح 'YYYY-MM' (n قد تكون سالبة) */
export function shiftMonthKey(monthKey: string, n: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * تواريخ شبكة شهر كاملة: 42 خلية (6 أسابيع) تبدأ من الأحد السابق
 * لأول الشهر أو أوله نفسه — بنفس منطق شبكة تقويم الجدول.
 */
export function monthGridDates(monthKey: string): string[] {
  const [y, m] = monthKey.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const start = new Date(y, m - 1, 1 - first.getDay())
  const out: string[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    )
  }
  return out
}

/** تجميع الحصص بالتاريخ، مرتبة داخل اليوم بوقت البدء */
export function groupSessionsByDate(
  sessions: StudentPortalSession[],
): Map<string, StudentPortalSession[]> {
  const map = new Map<string, StudentPortalSession[]>()
  for (const s of sessions) {
    const arr = map.get(s.date)
    if (arr) arr.push(s)
    else map.set(s.date, [s])
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.start_time.localeCompare(b.start_time))
  }
  return map
}
