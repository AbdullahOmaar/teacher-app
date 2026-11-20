import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { HOME } from '../home/hooks'
import { SCHED } from '../schedule/hooks'
import { ATT } from './hooks'
import { saveAttendance } from './api'
import {
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
 * المزامنة تُرسل كل عنصر بنفس saveAttendance الحالي حرفياً (upsert على
 * (session_id, student_id) — أو حذف الصف إن كانت القيمة فارغة تماماً)،
 * فهي idempotent: تكرار الإرسال لا يغيّر النتيجة. «آخر كتابة تفوز» هي
 * سياسة التعارض الموثقة في offlineQueue.
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

export interface SyncRunResult {
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

async function runSync(
  teacherId: string,
  onItemSynced: () => void,
): Promise<SyncRunResult> {
  const result: SyncRunResult = { synced: 0, failedNow: 0, stoppedByNetwork: false }
  const pending = itemsForTeacher(loadQueue(), teacherId).filter((i) => !i.failed)
  for (const item of pending) {
    try {
      await saveAttendance(item.teacherId, item.sessionId, item.studentId, item.value)
      // حارس سباق «آخر كتابة تفوز»: لو وصل تعديل أحدث لنفس الطالب أثناء
      // إرسال هذا العنصر (queuedAt تغيّر في التخزين) لا نحذف العنصر
      // الأحدث — يبقى معلّقاً لجولة قادمة ويكتب فوق ما أرسلناه الآن.
      const current = loadQueue().find((i) => i.key === item.key)
      if (!current || current.queuedAt === item.queuedAt) {
        saveQueue(removeItem(loadQueue(), item.key))
        result.synced += 1
        onItemSynced()
      }
    } catch (err) {
      if (isNetworkFailure(err)) {
        result.stoppedByNetwork = true
        break
      }
      const message = err instanceof Error ? err.message : 'خطأ غير معروف'
      const current = loadQueue().find((i) => i.key === item.key)
      if (current && current.queuedAt === item.queuedAt) {
        saveQueue(markSyncFailure(loadQueue(), item.key, message))
        result.failedNow += 1
      }
    }
  }
  return result
}

/** تشغيل المزامنة لمدرس — يعيد نفس الوعد الجاري إن كانت هناك مزامنة تعمل */
export function syncAttendanceQueue(
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
    void qc.invalidateQueries({ queryKey: [ATT] })
    void qc.invalidateQueries({ queryKey: [HOME] })
    void qc.invalidateQueries({ queryKey: [SCHED] })
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
