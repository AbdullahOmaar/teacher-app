/**
 * خنق محاولات الدخول الفاشلة في العميل (F2 من اختبار سند الأمني —
 * docs/SECURITY-F1-F6.md).
 *
 * حدّ صادق للنطاق: هذا خنق **طبقة عميل** — يبطئ التخمين اليدوي
 * والأدوات البسيطة على نفس الجهاز/المتصفح، وهو ليس بديلاً عن حدود
 * Supabase Auth الخادمية (موثقة كقائمة ضبط إنتاج في وثيقة الأمان).
 * لكنه يضيف كلفة تصاعدية حقيقية لأي محاولة تخمين من الواجهة نفسها،
 * ويُقرأ/يُكتب بلا أي نداء شبكة.
 *
 * السياسة: أول فشلين بلا انتظار؛ من الفشل الثالث قفل تصاعدي
 * 15ث → 30ث → 60ث → 120ث → 240ث (سقف). النجاح يصفّر العدّاد.
 * الحالة لكل بريد (مفتاح مُهشّم التطبيع: trim + lowercase) في
 * localStorage — تبقى بعد إغلاق التبويب، وتُنسى بعد 24 ساعة من آخر
 * فشل حتى لا يعاقَب مالك شرعي على محاولات قديمة.
 */

export interface LoginThrottleState {
  failures: number
  /** طابع ms لانتهاء القفل الحالي (0 = لا قفل) */
  lockedUntil: number
  /** طابع ms لآخر فشل — أساس نسيان الحالة القديمة */
  lastFailureAt: number
}

export const EMPTY_THROTTLE: LoginThrottleState = {
  failures: 0,
  lockedUntil: 0,
  lastFailureAt: 0,
}

const STORAGE_KEY = 'teacher-app-login-throttle-v1'
/** نسيان الحالة بعد 24 ساعة بلا فشل جديد */
export const THROTTLE_FORGET_MS = 24 * 60 * 60 * 1000
/** أول قفل عند الفشل رقم 3 */
const FIRST_LOCK_FAILURES = 3
const BASE_LOCK_SECONDS = 15
const MAX_LOCK_SECONDS = 240

/** مدة القفل (ثوانٍ) بعد عدد فشل معيّن — 0 قبل عتبة القفل. */
export function lockSecondsForFailures(failures: number): number {
  if (failures < FIRST_LOCK_FAILURES) return 0
  const steps = failures - FIRST_LOCK_FAILURES
  return Math.min(BASE_LOCK_SECONDS * 2 ** steps, MAX_LOCK_SECONDS)
}

/** تسجيل فشل جديد على حالة قائمة → الحالة الجديدة (نقية). */
export function recordLoginFailure(
  state: LoginThrottleState,
  now: number,
): LoginThrottleState {
  const failures = state.failures + 1
  const lockSec = lockSecondsForFailures(failures)
  return {
    failures,
    lockedUntil: lockSec > 0 ? now + lockSec * 1000 : 0,
    lastFailureAt: now,
  }
}

/** الثواني المتبقية من القفل (0 = غير مقفل) — تُقرأ قبل كل محاولة. */
export function throttleWaitSeconds(state: LoginThrottleState, now: number): number {
  if (state.lockedUntil <= now) return 0
  return Math.ceil((state.lockedUntil - now) / 1000)
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function readAll(storage: StorageLike): Record<string, LoginThrottleState> {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as Record<string, LoginThrottleState>
  } catch {
    return {}
  }
}

function isValidState(v: unknown): v is LoginThrottleState {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return (
    typeof s.failures === 'number' &&
    typeof s.lockedUntil === 'number' &&
    typeof s.lastFailureAt === 'number'
  )
}

/** حالة بريد معيّن — حالة منسيّة/فاسدة تعني «لا خنق». */
export function getLoginThrottle(
  storage: StorageLike,
  email: string,
  now: number,
): LoginThrottleState {
  const entry = readAll(storage)[normalizeEmail(email)]
  if (!isValidState(entry)) return EMPTY_THROTTLE
  if (entry.lastFailureAt > 0 && now - entry.lastFailureAt > THROTTLE_FORGET_MS) {
    return EMPTY_THROTTLE
  }
  return entry
}

/** حفظ فشل جديد لبريد وإرجاع حالته الجديدة. */
export function saveLoginFailure(
  storage: StorageLike,
  email: string,
  now: number,
): LoginThrottleState {
  const all = readAll(storage)
  const next = recordLoginFailure(getLoginThrottle(storage, email, now), now)
  all[normalizeEmail(email)] = next
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // تخزين ممتلئ/محظور: الخنق يبقى داخل الجلسة فقط عبر الحالة المرجعة
  }
  return next
}

/** النجاح يصفّر عدّاد البريد نهائياً. */
export function clearLoginThrottle(storage: StorageLike, email: string): void {
  const all = readAll(storage)
  delete all[normalizeEmail(email)]
  try {
    if (Object.keys(all).length === 0) storage.removeItem(STORAGE_KEY)
    else storage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // تجاهل: التصفيّر تحسين لا شرط نجاح للدخول
  }
}
