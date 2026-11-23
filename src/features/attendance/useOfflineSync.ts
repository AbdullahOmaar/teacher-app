import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { t } from '../../i18n'
import { INVALIDATION_SETS, invalidatePrefixes } from '../../lib/invalidate'
import { saveAttendance, saveAttendanceBatch } from './api'
import {
  groupItemsBySession,
  isNetworkFailure,
  itemsForTeacher,
  loadQueue,
  markSyncFailure,
  queueSnapshot,
  removeItem,
  resetItemFailure,
  saveQueue,
  subscribeQueue,
  type QueuedAttendanceItem,
} from './offlineQueue'

/**
 * محرك مزامنة قائمة الحضور أوفلاين + هوكس الحالة (Phase 2 — الخطوة 11).
 *
 * المزامنة تُرسل عناصر كل حصة دفعة واحدة بـ saveAttendanceBatch
 * (upsert جماعي + حذف جماعي للقيم الفارغة — أداء 3A-296)، وهي
 * idempotent: تكرار الإرسال لا يغيّر النتيجة. عند فشل دفعة لسبب غير
 * شبكي تهبط المزامنة للمسار الفردي (saveAttendance عنصراً بعنصر)
 * داخل تلك الحصة فقط لعزل العنصر الفاسد. «آخر كتابة تفوز» هي سياسة
 * التعارض الموثقة في offlineQueue.
 *
 * متى تعمل: (1) عند إقلاع التطبيق/تركيب الهوك (شاشة الحضور أو جسر
 * AppShell)، (2) تلقائياً عند عودة الاتصال (حدث online)، (3) يدوياً
 * بزر «مزامنة الآن». بوّابة module-level (inFlight) تمنع تشغيلين
 * متزامنين مهما تعددت نسخ الهوك.
 *
 * فشل شبكي أثناء المزامنة: نتوقف فوراً ونبقي كل العناصر كما هي بلا
 * احتساب محاولات — سنحاول مجدداً عند online/الإقلاع/يدوياً.
 * فشل غير شبكي لعنصر: markSyncFailure (محاولات محدودة ثم failed ظاهر
 * للمستخدم) ونكمل بقية العناصر — عنصر فاسد لا يحجز القائمة كلها.
 */

interface SyncRunResult {
  synced: number
  failedNow: number
  /** توقفنا مبكراً لفشل شبكي — بقيت عناصر تنتظر الاتصال */
  stoppedByNetwork: boolean
}

let inFlight: Promise<SyncRunResult> | null = null

// حالة «جارٍ المزامنة» كمخزن وحدوي صغير يُقرأ بـ useSyncExternalStore —
// هكذا لا يحتاج أي effect إلى setState متزامن لبدء/إنهاء مؤشر المزامنة
let syncingNow = false
const syncingListeners = new Set<() => void>()
function setSyncingNow(v: boolean) {
  if (syncingNow === v) return
  syncingNow = v
  for (const l of syncingListeners) l()
}
function subscribeSyncing(onChange: () => void): () => void {
  syncingListeners.add(onChange)
  return () => {
    syncingListeners.delete(onChange)
  }
}

/**
 * إزالة عنصر من القائمة بعد نجاح إرساله، بحارس سباق «آخر كتابة تفوز»:
 * لو وصل تعديل أحدث لنفس الطالب أثناء الإرسال (queuedAt تغيّر في
 * التخزين) لا نحذف العنصر الأحدث — يبقى معلّقاً لجولة قادمة ويكتب فوق
 * ما أرسلناه الآن. تعيد true إن حُذف العنصر فعلاً.
 */
function removeIfUnchanged(item: QueuedAttendanceItem): boolean {
  const current = loadQueue().find((i) => i.key === item.key)
  if (!current || current.queuedAt === item.queuedAt) {
    saveQueue(removeItem(loadQueue(), item.key))
    return true
  }
  return false
}

function markFailedIfUnchanged(item: QueuedAttendanceItem, message: string): boolean {
  const current = loadQueue().find((i) => i.key === item.key)
  if (current && current.queuedAt === item.queuedAt) {
    saveQueue(markSyncFailure(loadQueue(), item.key, message))
    return true
  }
  return false
}

async function runSync(
  teacherId: string,
  onItemSynced: () => void,
): Promise<SyncRunResult> {
  const result: SyncRunResult = { synced: 0, failedNow: 0, stoppedByNetwork: false }
  const pending = itemsForTeacher(loadQueue(), teacherId).filter((i) => !i.failed)
  // المزامنة المجمّعة (أداء 3A-296): عناصر كل حصة تُرسل دفعة واحدة
  // (saveAttendanceBatch) بدل طلب لكل طالب — نفس عقد القائمة ونفس
  // سياسة الأخطاء؛ وفشل دفعة لسبب غير شبكي يهبط بنا للمسار الفردي
  // داخل نفس الحصة فقط لعزل العنصر الفاسد دون حجز بقية الحصص.
  for (const group of groupItemsBySession(pending)) {
    let batchError: unknown = null
    try {
      await saveAttendanceBatch(
        teacherId,
        group.sessionId,
        group.items.map((i) => ({ studentId: i.studentId, value: i.value })),
      )
    } catch (err) {
      batchError = err
    }
    if (batchError === null) {
      for (const item of group.items) {
        if (removeIfUnchanged(item)) result.synced += 1
      }
      if (group.items.length > 0) onItemSynced()
      continue
    }
    if (isNetworkFailure(batchError)) {
      result.stoppedByNetwork = true
      break
    }
    // مسار فردي احتياطي داخل هذه الحصة: عنصر فاسد لا يحجز الدفعة كلها
    for (const item of group.items) {
      try {
        await saveAttendance(item.teacherId, item.sessionId, item.studentId, item.value)
        if (removeIfUnchanged(item)) {
          result.synced += 1
          onItemSynced()
        }
      } catch (err) {
        if (isNetworkFailure(err)) {
          result.stoppedByNetwork = true
          break
        }
        const message = err instanceof Error ? err.message : t('common.unknownError')
        if (markFailedIfUnchanged(item, message)) result.failedNow += 1
      }
    }
    if (result.stoppedByNetwork) break
  }
  return result
}

/** تشغيل المزامنة لمدرس — يعيد نفس الوعد الجاري إن كانت هناك مزامنة تعمل */
function syncAttendanceQueue(
  teacherId: string,
  onItemSynced: () => void = () => {},
): Promise<SyncRunResult> {
  if (!inFlight) {
    inFlight = runSync(teacherId, onItemSynced).finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

/** كل عناصر القائمة (كل المدرسين) كحالة تفاعلية ثابتة المرجع */
export function useQueueItems(): QueuedAttendanceItem[] {
  return useSyncExternalStore(subscribeQueue, queueSnapshot, () => [])
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** حالة الاتصال الحالية كقيمة تفاعلية (navigator.onLine + حدثا online/offline) */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}

export interface OfflineSyncState {
  /** عناصر هذا المدرس المعلّقة (تشمل الفاشلة نهائياً) */
  items: QueuedAttendanceItem[]
  pendingCount: number
  failedCount: number
  syncing: boolean
  /** نتيجة آخر مزامنة أكملت شيئاً فعلاً — لعرض «تمت المزامنة» */
  lastSync: { synced: number; at: number } | null
  syncNow: () => void
  /** إعادة محاولة العناصر الفاشلة نهائياً (تصفير عدّاداتها ثم مزامنة) */
  retryFailed: () => void
  /** تجاهل/حذف عنصر من القائمة بيد المستخدم */
  discard: (key: string) => void
}

/**
 * هوك المزامنة الكامل لمدرس: حالة القائمة + محاولات تلقائية عند التركيب
 * وعند عودة الاتصال + إبطال كاشات الحضور/الرئيسية/الجدول بعد كل عنصر
 * يُزامَن (نفس إبطالات الحفظ الأونلاين في hooks.ts).
 */
export function useOfflineSync(teacherId: string | undefined): OfflineSyncState {
  const qc = useQueryClient()
  const allItems = useQueueItems()
  const syncing = useSyncExternalStore(subscribeSyncing, () => syncingNow, () => false)
  const [lastSync, setLastSync] = useState<{ synced: number; at: number } | null>(null)
  const teacherRef = useRef(teacherId)
  useEffect(() => {
    teacherRef.current = teacherId
  })

  const invalidate = useCallback(() => {
    // نفس مجموعة إبطال الحضور المركزية (INVALIDATION_SETS.attendance) —
    // مرة لكل دفعة حصة مُزامَنة لا لكل طالب (PAT-1 + 3A-296)
    void invalidatePrefixes(qc, INVALIDATION_SETS.attendance)
  }, [qc])

  const syncNow = useCallback(() => {
    const tid = teacherRef.current
    if (!tid) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    setSyncingNow(true)
    void syncAttendanceQueue(tid, invalidate)
      .then((r) => {
        if (r.synced > 0) setLastSync({ synced: r.synced, at: Date.now() })
      })
      .catch(() => {
        // runSync لا يرمي عادة (يلتقط أخطاء العناصر) — صمت احترازي
      })
      .finally(() => setSyncingNow(false))
  }, [invalidate])

  // محاولة عند الإقلاع/التركيب + عند كل عودة اتصال
  useEffect(() => {
    syncNow()
    const onOnline = () => syncNow()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [syncNow])

  // تفريغ تلقائي مُهادن (أداء 3A-296): كل حفظ — أونلاين كان أو أوفلاين —
  // يمرّ بالقائمة الآن، فأي عنصر معلّق جديد يطلق مزامنة بعد هدوء قصير؛
  // النقرات المتتالية تتجمّع في دفعة حصة واحدة بدل طلب لكل نقرة.
  const pendingNow = teacherId
    ? itemsForTeacher(allItems, teacherId).filter((i) => !i.failed).length
    : 0
  useEffect(() => {
    if (pendingNow === 0) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const t = setTimeout(() => syncNow(), 700)
    return () => clearTimeout(t)
  }, [pendingNow, syncNow])

  const retryFailed = useCallback(() => {
    const tid = teacherRef.current
    if (!tid) return
    let items = loadQueue()
    for (const item of itemsForTeacher(items, tid)) {
      if (item.failed) items = resetItemFailure(items, item.key)
    }
    saveQueue(items)
    syncNow()
  }, [syncNow])

  const discard = useCallback((key: string) => {
    saveQueue(removeItem(loadQueue(), key))
  }, [])

  const items = teacherId ? itemsForTeacher(allItems, teacherId) : []
  return {
    items,
    pendingCount: items.filter((i) => !i.failed).length,
    failedCount: items.filter((i) => i.failed).length,
    syncing,
    lastSync,
    syncNow,
    retryFailed,
    discard,
  }
}
