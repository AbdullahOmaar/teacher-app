import { supabase } from './supabase'
import type { PushSubscriptionRow } from '../types/database'

/**
 * عميل Web Push الأساسي (Phase 4 — الخطوة 1: البنية).
 *
 * المسؤولية هنا ضيّقة ومقصودة: تحويل متصفح المستخدم المسجل الحالي
 * لاشتراك Push (طلب الإذن + pushManager.subscribe بمفتاح VAPID العام)
 * وحفظه/إيقافه في push_subscriptions (migration ‏0013) كاشتراك
 * «teacher». الإرسال نفسه لا يحدث من المتصفح أبداً — يتم من Edge
 * Function ‏send-push داخلياً فقط.
 *
 * الخطوات التالية تبني على هذا الأساس: الخطوة 2 أضافت مسار اشتراك
 * البوابات فوق مبادئ المتصفح المشتركة أسفل هذا الملف (RPC بالتوكن —
 * لا وصول مباشر للجدول)، والخطوة 3 تستخدم اشتراك المدرس الجاهز هنا
 * للتنبيهات الفورية والملخص اليومي.
 *
 * المفتاح العام VAPID يأتي من VITE_VAPID_PUBLIC_KEY (متغير بناء عام
 * بطبيعته — نظيره الخاص سرّ في Supabase فقط ولا يصل للمتصفح أبداً).
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined

/** هل ضُبط مفتاح VAPID العام في بناء التطبيق؟ */
export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY)
}

/** هل يدعم هذا المتصفح Web Push أصلاً؟ (iOS: فقط للتطبيق المثبّت 16.4+) */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export type BrowserPushState =
  | 'unsupported'
  | 'unconfigured'
  | 'denied'
  | 'subscribed'
  | 'not-subscribed'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * مهلة جاهزية الـ Service Worker: الوعد `navigator.serviceWorker.ready`
 * لا يُرفض أبداً — يبقى معلّقاً للأبد إن لم يُفعَّل أي SW (بيئة بلا
 * تسجيل/تسجيل فاشل)، فكانت بطاقات فحص الإشعارات تعلق على «جارٍ فحص…»
 * بلا نهاية (تدقيق أول استخدام — L3). السباق بمهلة يعيد null عند
 * التعذّر فتتحول كل الحالات المعلّقة لحالة سقوط واضحة.
 */
const SW_READY_TIMEOUT_MS = 4_000

async function swReadyWithTimeout(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS)
      }),
    ])
  } catch {
    return null
  }
}

async function browserSubscription(): Promise<PushSubscription | null> {
  const reg = await swReadyWithTimeout()
  if (!reg) return null
  return reg.pushManager.getSubscription()
}

// ---------------------------------------------------------------------------
// مبادئ متصفح مشتركة (Phase 4 — الخطوة 2): تستخدمها اشتراكات البوابات
// (ولي الأمر/الطالب عبر RPC بالتوكن) واشتراك المدرس أعلاه معاً — طلب
// الإذن والاشتراك عند خدمة الـ Push نفسه واحد في كل المسارات، والفرق
// الوحيد هو أين يُحفظ الاشتراك (جدول مباشرة للمدرس، RPC للبوابات).
// ---------------------------------------------------------------------------

/** جهاز iOS (آيفون/آيباد — يشمل آيباد الذي يعرف نفسه كماكنتوش لمسي) */
function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return true
  return /macintosh/i.test(ua) && navigator.maxTouchPoints > 1
}

/** هل التطبيق يعمل مثبّتاً على الشاشة الرئيسية (standalone)؟ */
function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/**
 * iOS بلا تثبيت: Web Push لا يعمل إطلاقاً خارج التطبيق المثبّت على
 * الشاشة الرئيسية (16.4+) — الواجهة تعرض إرشادات التثبيت بدل طلب إذن
 * محكوم عليه بالفشل.
 */
export function isIosNotInstalled(): boolean {
  return isIosDevice() && !isStandalonePwa()
}

export interface BrowserPushKeys {
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string
}

/** نقطة نهاية اشتراك المتصفح الحالي إن وُجد (بلا طلب إذن وبلا اشتراك) */
export async function currentPushEndpoint(): Promise<string | null> {
  const sub = await browserSubscription().catch(() => null)
  return sub?.endpoint ?? null
}

/**
 * اشتراك هذا المتصفح عند خدمة الـ Push: يطلب الإذن إن لزم، يعيد
 * الاشتراك القائم أو ينشئ واحداً بمفتاح VAPID العام، ويعيد نقطة
 * النهاية ومفتاحي التشفير جاهزة للحفظ (جدول المدرس أو RPC بوابة).
 */
export async function subscribeBrowserPush(): Promise<BrowserPushKeys> {
  if (!isPushSupported()) {
    throw new Error('المتصفح ده لا يدعم إشعارات Push — على آيفون لازم التطبيق يكون مثبّتاً على الشاشة الرئيسية (iOS 16.4 أو أحدث).')
  }
  if (!isPushConfigured() || !VAPID_PUBLIC_KEY) {
    throw new Error('مفتاح إشعارات Push العام غير مضبوط في هذا البناء بعد.')
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('إذن الإشعارات غير ممنوح — فعّله من إعدادات المتصفح للموقع ثم حاول تاني.')
  }
  const reg = await swReadyWithTimeout()
  if (!reg) {
    throw new Error(
      'تعذّر الوصول لخدمة الإشعارات في المتصفح ده (الـ Service Worker مش جاهز) — حدّث الصفحة وحاول تاني، ولو استمرت جرّب متصفحاً حديثاً.',
    )
  }
  const existing = await reg.pushManager.getSubscription()
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    }))
  const json = sub.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!p256dh || !auth) {
    throw new Error('المتصفح رجّع اشتراكاً ناقص المفاتيح — حدّث الصفحة وحاول تاني.')
  }
  return {
    endpoint: sub.endpoint,
    p256dh,
    auth,
    userAgent: navigator.userAgent.slice(0, 300),
  }
}

/**
 * إلغاء اشتراك هذا المتصفح عند خدمة الـ Push نفسها — يعيد نقطة النهاية
 * التي أُلغيت (أو null إن لم يوجد اشتراك) حتى يعطّل المستدعي صفها.
 */
export async function unsubscribeBrowserPush(): Promise<string | null> {
  const sub = await browserSubscription().catch(() => null)
  if (!sub) return null
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => undefined)
  return endpoint
}

const PUSH_SUB_COLS =
  'id, teacher_id, subscriber_kind, user_id, portal_token_id, guardian_id, student_id, endpoint, p256dh, auth, user_agent, is_active, disabled_at, disabled_reason, failure_count, last_success_at, last_failure_at, created_at, updated_at'

/**
 * حالة اشتراك هذا المتصفح للمستخدم الحالي: «مشترك» تعني أن نقطة نهاية
 * المتصفح الحالية موجودة ونشطة كصف teacher لهذا المستخدم.
 */
export async function getBrowserPushState(userId: string): Promise<BrowserPushState> {
  if (!isPushSupported()) return 'unsupported'
  if (!isPushConfigured()) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  const sub = await browserSubscription()
  if (!sub || !supabase) return 'not-subscribed'
  const { data } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', sub.endpoint)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  return data ? 'subscribed' : 'not-subscribed'
}

/**
 * تفعيل إشعارات هذا المتصفح للمستخدم المسجل: يطلب الإذن إن لزم،
 * يشترك عند خدمة الـ Push بمفتاح VAPID العام، ويحفظ الاشتراك
 * (upsert على endpoint الفريد — إعادة التفعيل بعد إيقاف تُنشّط الصف).
 */
export async function subscribeTeacherPush(params: {
  teacherId: string
  userId: string
}): Promise<PushSubscriptionRow> {
  if (!supabase) throw new Error('الاتصال بقاعدة البيانات غير مضبوط.')
  const keys = await subscribeBrowserPush()
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        teacher_id: params.teacherId,
        subscriber_kind: 'teacher' as const,
        user_id: params.userId,
        endpoint: keys.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: keys.userAgent,
        is_active: true,
        disabled_at: null,
        disabled_reason: null,
      },
      { onConflict: 'endpoint' },
    )
    .select(PUSH_SUB_COLS)
    .single()
  if (error) throw error
  return data as unknown as PushSubscriptionRow
}

/**
 * إيقاف إشعارات هذا المتصفح: يلغي الاشتراك عند خدمة الـ Push نفسها
 * ويعطّل صفه في القاعدة (يبقى الصف وسجلّه — التعطيل لا الحذف).
 */
export async function unsubscribeTeacherPush(): Promise<void> {
  const endpoint = await unsubscribeBrowserPush()
  if (!endpoint) return
  if (supabase) {
    await supabase
      .from('push_subscriptions')
      .update({
        is_active: false,
        disabled_at: new Date().toISOString(),
        disabled_reason: 'unsubscribed by user',
      })
      .eq('endpoint', endpoint)
  }
}
