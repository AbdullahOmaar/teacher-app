import type { AttendanceValue } from './api'

/**
 * قائمة مزامنة الحضور أوفلاين (Phase 2 — الخطوة 11): منطق نقي معزول
 * (دوال على مصفوفات + طبقة تخزين رفيعة) حتى يُختبَر مستقلاً عن React
 * وعن الشبكة، ونفس القيم الكاملة التي يبنيها changeValue في شاشة الحضور
 * (status + homework_done + starred) هي ما يُخزَّن ويُزامَن.
 *
 * التخزين: localStorage (مفتاح واحد JSON) — اختيار مقصود وموثّق:
 * حجم العنصر ضئيل (حصة × طالب) والعدد الواقعي عشرات، ودمج «آخر كتابة
 * لنفس الطالب» عملية متزامنة بسيطة هنا؛ IndexedDB كانت ستضيف طبقة
 * async ومعاملات بلا أي مقابل عند هذا الحجم. (نفس نمط lib/workspace.)
 *
 * سياسة التعارض — آخر كتابة تفوز (Last-Write-Wins): مفتاح العنصر
 * (teacher_id, session_id, student_id)؛ أي تعديل جديد لنفس الطالب في
 * نفس الحصة يستبدل القيمة المعلّقة كلها، والمزامنة نفسها upsert على
 * (session_id, student_id) — فهي idempotent بطبيعتها: إعادة إرسال نفس
 * العنصر أو إرساله مرتين تعطي نفس النتيجة النهائية في القاعدة.
 *
 * سياسة الأخطاء الدائمة: فشل الشبكة لا يُحتسب محاولة ولا يُعلّم العنصر
 * (العنصر بريء — الاتصال هو المشكلة). فشل غير شبكي (RLS/تحقق/قيد) أثناء
 * المزامنة يزيد عدّاد المحاولات ويحفظ آخر خطأ، وعند بلوغ MAX_ATTEMPTS
 * يُعلَّم العنصر failed فيخرج من المزامنة التلقائية ويظهر للمستخدم
 * (لا دوران صامت للأبد) — ولا يعود للمحاولة إلا بزر «إعادة المحاولة»
 * اليدوي أو بتعديل جديد لنفس الطالب (يصفّر حالته).
 */

export interface QueuedAttendanceItem {
  /** مفتاح الدمج: `${teacherId}:${sessionId}:${studentId}` */
  key: string
  teacherId: string
  sessionId: string
  studentId: string
  /** القيمة الكاملة كما بناها changeValue — تُرسل كما هي عند المزامنة */
  value: AttendanceValue
  /** وقت آخر تعديل محلي (ms) — للعرض/التشخيص */
  queuedAt: number
  /** عدد محاولات المزامنة الفاشلة لسبب غير شبكي فقط */
  attempts: number
  /** آخر خطأ غير شبكي (رسالة) — null إن لم يحدث */
  lastError: string | null
  /** true بعد استنفاد المحاولات: خارج المزامنة التلقائية، ظاهر للمستخدم */
  failed: boolean
}

const MAX_SYNC_ATTEMPTS = 3

const STORAGE_KEY = 'teacher-app-attendance-queue-v1'
const CHANGE_EVENT = 'teacher-attendance-queue-changed'

export function queueKey(teacherId: string, sessionId: string, studentId: string): string {
  return `${teacherId}:${sessionId}:${studentId}`
}

function sameValue(a: AttendanceValue, b: AttendanceValue): boolean {
  return a.status === b.status && a.homework_done === b.homework_done && a.starred === b.starred
}

/**
 * إضافة/دمج تغيير في القائمة (نقية): نفس المفتاح ⇒ استبدال كامل للقيمة
 * (آخر كتابة تفوز) وتصفير حالة الفشل/المحاولات لأن التعديل الجديد قرار
 * مستخدم جديد. قيمة مطابقة تماماً لما هو معلّق أصلاً ⇒ نفس المصفوفة
 * (لا كتابة تخزين زائدة).
 */
function enqueueItem(
  items: QueuedAttendanceItem[],
  input: {
    teacherId: string
    sessionId: string
    studentId: string
    value: AttendanceValue
    now: number
  },
): QueuedAttendanceItem[] {
  const key = queueKey(input.teacherId, input.sessionId, input.studentId)
  const existing = items.find((i) => i.key === key)
  if (existing && sameValue(existing.value, input.value) && !existing.failed) {
    return items
  }
  const next: QueuedAttendanceItem = {
    key,
    teacherId: input.teacherId,
    sessionId: input.sessionId,
    studentId: input.studentId,
    value: input.value,
    queuedAt: input.now,
    attempts: 0,
    lastError: null,
    failed: false,
  }
  if (!existing) return [...items, next]
  return items.map((i) => (i.key === key ? next : i))
}

/** حذف عنصر بعد نجاح مزامنته (أو تجاهله يدوياً) — نقية */
export function removeItem(items: QueuedAttendanceItem[], key: string): QueuedAttendanceItem[] {
  if (!items.some((i) => i.key === key)) return items
  return items.filter((i) => i.key !== key)
}

/**
 * تسجيل فشل غير شبكي أثناء المزامنة (نقية): attempts+1، وعند بلوغ الحد
 * يُعلَّم failed. فشل الشبكة لا يمرّ من هنا أبداً (انظر محرك المزامنة).
 */
export function markSyncFailure(
  items: QueuedAttendanceItem[],
  key: string,
  errorMessage: string,
): QueuedAttendanceItem[] {
  return items.map((i) => {
    if (i.key !== key) return i
    const attempts = i.attempts + 1
    return {
      ...i,
      attempts,
      lastError: errorMessage,
      failed: attempts >= MAX_SYNC_ATTEMPTS,
    }
  })
}

/** إعادة تعليم عنصر فاشل للمحاولة من جديد (زر يدوي) — نقية */
export function resetItemFailure(
  items: QueuedAttendanceItem[],
  key: string,
): QueuedAttendanceItem[] {
  return items.map((i) =>
    i.key === key ? { ...i, attempts: 0, lastError: null, failed: false } : i,
  )
}

/**
 * تجميع عناصر القائمة بحسب الحصة (نقية) — وحدة المزامنة المجمّعة
 * (أداء 3A-296): عناصر نفس الحصة تُرسل في دفعة واحدة (upsert جماعي +
 * حذف جماعي) بدل طلب لكل طالب. ترتيب المجموعات والعناصر بداخلها هو
 * ترتيب الظهور الأول في القائمة (استقرار يسهّل التتبع والاختبار).
 */
export function groupItemsBySession(
  items: QueuedAttendanceItem[],
): { sessionId: string; items: QueuedAttendanceItem[] }[] {
  const groups: { sessionId: string; items: QueuedAttendanceItem[] }[] = []
  const bySession = new Map<string, { sessionId: string; items: QueuedAttendanceItem[] }>()
  for (const item of items) {
    let g = bySession.get(item.sessionId)
    if (!g) {
      g = { sessionId: item.sessionId, items: [] }
      bySession.set(item.sessionId, g)
      groups.push(g)
    }
    g.items.push(item)
  }
  return groups
}

/** عناصر مدرس واحد — القائمة قد تضم مدرسين (تبديل مساحة عمل/حسابات) */
export function itemsForTeacher(
  items: QueuedAttendanceItem[],
  teacherId: string,
): QueuedAttendanceItem[] {
  return items.filter((i) => i.teacherId === teacherId)
}

/** عناصر حصة واحدة لمدرس — لمؤشرات الصفوف في شاشة الحضور */
export function itemsForSession(
  items: QueuedAttendanceItem[],
  teacherId: string,
  sessionId: string,
): QueuedAttendanceItem[] {
  return items.filter((i) => i.teacherId === teacherId && i.sessionId === sessionId)
}

// ---------------------------------------------------------------------------
// تفريق فشل الشبكة عن غيره — «قدر الإمكان» وموثّق:
// - المتصفح نفسه يقول إنه أوفلاين (navigator.onLine === false) ⇒ شبكي.
// - خطأ يحمل كود Postgres/PostgREST (42501 RLS، 23503 قيد، PGRST…) أو
//   حالة HTTP ‏>= 400 ⇒ الخادم ردّ فعلاً ⇒ غير شبكي (دائم حتى يُراجَع).
// - TypeError من fetch أو رسالة فيها failed to fetch / network / load
//   failed / connection / timeout ⇒ شبكي (هذا شكل فشل fetch في
//   supabase-js: خطأ بلا code ورسالته رسالة المتصفح).
// - أي شيء آخر مجهول: غير شبكي افتراضياً — حتى لا تختفي أخطاء حقيقية
//   داخل القائمة كأنها انقطاع اتصال عابر.
// ---------------------------------------------------------------------------
export function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (error == null) return false
  if (error instanceof TypeError) return true
  const e = error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown }
  if (typeof e.code === 'string' && e.code.length > 0) return false
  if (typeof e.status === 'number' && e.status >= 400) return false
  const text = `${typeof e.name === 'string' ? e.name : ''} ${
    typeof e.message === 'string' ? e.message : ''
  }`.toLowerCase()
  return /failed to fetch|network|load failed|connection|offline|timeout|timed out|aborted/.test(
    text,
  )
}

// ---------------------------------------------------------------------------
// طبقة التخزين (localStorage) + إشعار المشتركين — بنمط lib/workspace:
// حدث مخصص داخل نفس التبويب + حدث storage عبر التبويبات.
// ---------------------------------------------------------------------------

function isValidItem(raw: unknown): raw is QueuedAttendanceItem {
  if (typeof raw !== 'object' || raw === null) return false
  const i = raw as Record<string, unknown>
  const v = i.value as Record<string, unknown> | null
  return (
    typeof i.key === 'string' &&
    typeof i.teacherId === 'string' &&
    typeof i.sessionId === 'string' &&
    typeof i.studentId === 'string' &&
    typeof v === 'object' &&
    v !== null &&
    (v.status === null || typeof v.status === 'string') &&
    typeof v.homework_done === 'boolean' &&
    typeof v.starred === 'boolean'
  )
}

/** قراءة القائمة كاملة — JSON تالف أو تخزين غير متاح ⇒ قائمة فارغة، بلا رمي */
export function loadQueue(): QueuedAttendanceItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidItem)
  } catch {
    return []
  }
}

export function saveQueue(items: QueuedAttendanceItem[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // تجاهل: التخزين ممتلئ/محظور — التغيير يبقى في الذاكرة لهذه الجلسة
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }
}

/** إدخال تغيير واحد في التخزين مباشرة (المسار الذي تستخدمه شاشة الحضور) */
export function enqueueStored(input: {
  teacherId: string
  sessionId: string
  studentId: string
  value: AttendanceValue
}): QueuedAttendanceItem[] {
  const next = enqueueItem(loadQueue(), { ...input, now: Date.now() })
  saveQueue(next)
  return next
}

export function subscribeQueue(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

// نسخة مرجعية ثابتة بين القراءات المتطابقة — useSyncExternalStore يحتاج
// getSnapshot ثابت المرجع ما لم تتغير البيانات فعلاً، وإلا حلقة renders.
let snapshotCache: QueuedAttendanceItem[] = []
let snapshotRaw: string | null | undefined

export function queueSnapshot(): QueuedAttendanceItem[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    raw = null
  }
  if (raw !== snapshotRaw) {
    snapshotRaw = raw
    snapshotCache = loadQueue()
  }
  return snapshotCache
}
