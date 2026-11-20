import { useEffect, useState } from 'react'
import { Bell, BellOff, CheckCircle2, Share } from 'lucide-react'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import {
  currentPushEndpoint,
  isIosNotInstalled,
  isPushConfigured,
  isPushSupported,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
  type BrowserPushKeys,
} from '../lib/push'

/**
 * مفتاح «إشعارات Push الفورية» المشترك بين البوابات (Phase 4 — الخطوة 2).
 *
 * مكوّن عرضي بحت: حالة المتصفح (دعم/إذن/اشتراك محلي) من lib/push،
 * والحفظ الخادمي عبر المحوّل (adapter) الذي تمرّره كل بوابة — بوابة
 * ولي الأمر تربط الاشتراك بالطالب ووليّه بتوكنها، وبوابة الطالب
 * بتوكنها (RPC بـ security definer في 0014) — فلا يعرف المكوّن أي
 * توكن ولا يلمس أي جدول.
 *
 * الحالات المعروضة صريحة: غير مدعوم / iOS غير مثبّت (إرشادات تثبيت
 * بدل طلب إذن فاشل — Push في iOS يعمل فقط للتطبيق المثبّت 16.4+) /
 * إذن محظور / مفعّل / غير مفعّل. الإيقاف يعطّل صف الاشتراك خادمياً
 * أولاً ثم يلغي اشتراك المتصفح نفسه، فلا يصل الموقوفَ شيء بأي مسار.
 */
export interface PortalPushAdapter {
  /** هل نقطة النهاية هذه مشتركة ونشطة خادمياً لهذه البوابة؟ */
  status: (endpoint: string) => Promise<boolean>
  /** حفظ اشتراك المتصفح الحالي خادمياً (مرتبطاً بتوكن البوابة) */
  subscribe: (keys: BrowserPushKeys) => Promise<void>
  /** تعطيل صف اشتراك نقطة النهاية خادمياً */
  unsubscribe: (endpoint: string) => Promise<void>
}

type PushUiState =
  | 'loading'
  | 'check-failed'
  | 'ios-install'
  | 'unsupported'
  | 'unconfigured'
  | 'denied'
  | 'subscribed'
  | 'not-subscribed'

export function PortalPushToggle({ adapter }: { adapter: PortalPushAdapter }) {
  const [state, setState] = useState<PushUiState>('loading')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [probeRun, setProbeRun] = useState(0)

  useEffect(() => {
    let cancelled = false
    let finished = false
    // مهلة الفحص (L3): أي خطوة معلّقة — Service Worker لا يجهز أبداً أو
    // استدعاء حالة خادمي لا يرد — تنتهي بحالة «تعذّر الفحص» الصريحة مع
    // زر إعادة، بدل تعليق «جارٍ فحص…» إلى الأبد.
    const timer = setTimeout(() => {
      if (!cancelled && !finished) setState('check-failed')
    }, 6_000)
    const finish = (next: PushUiState) => {
      finished = true
      clearTimeout(timer)
      if (!cancelled) setState(next)
    }
    void (async () => {
      try {
        if (isIosNotInstalled()) return finish('ios-install')
        if (!isPushSupported()) return finish('unsupported')
        if (!isPushConfigured()) return finish('unconfigured')
        if (Notification.permission === 'denied') return finish('denied')
        const endpoint = await currentPushEndpoint()
        if (!endpoint) return finish('not-subscribed')
        const active = await adapter.status(endpoint).catch(() => false)
        finish(active ? 'subscribed' : 'not-subscribed')
      } catch {
        finish('not-subscribed')
      }
    })()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // المحوّل ثابت طوال عمر الصفحة (يُبنى من توكن الرابط) — فحص واحد
    // لكل تشغيل، وإعادة الفحص من زر الحالة عند التعذّر
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeRun])

  const handleSubscribe = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const keys = await subscribeBrowserPush()
      await adapter.subscribe(keys)
      setState('subscribed')
      setMsg('تمام — الإشعارات الفورية مفعّلة على الجهاز ده.')
    } catch (err) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setState('denied')
      }
      setMsg(err instanceof Error ? err.message : 'حصلت مشكلة في التفعيل — حاول تاني.')
    } finally {
      setBusy(false)
    }
  }

  const handleUnsubscribe = async () => {
    setBusy(true)
    setMsg(null)
    try {
      // التعطيل الخادمي أولاً (الصف يُعطَّل فلا يصله شيء حتى لو فشل
      // إلغاء اشتراك المتصفح)، ثم إلغاء اشتراك المتصفح نفسه.
      const endpoint = await currentPushEndpoint()
      if (endpoint) await adapter.unsubscribe(endpoint)
      await unsubscribeBrowserPush()
      setState('not-subscribed')
      setMsg('اتوقفت الإشعارات الفورية على الجهاز ده.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'حصلت مشكلة في الإيقاف — حاول تاني.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h3 className="type-section mt-5 mb-2 flex items-center gap-2">
        <Bell size={22} className="text-primary" />
        إشعارات فورية على الجهاز ده
      </h3>
      <Card>
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          فعّل الإشعارات عشان توصلك تنبيهات الوصول والمغادرة واعتماد
          الدفعات ونتائج الامتحانات فور حدوثها — حتى والبوابة مقفولة.
        </p>

        {state === 'loading' && (
          <p className="text-muted text-[13.5px] mb-0">جارٍ فحص حالة الإشعارات…</p>
        )}

        {state === 'check-failed' && (
          <div className="text-[13.5px] bg-soft rounded-xl px-3 py-2.5">
            <p className="mt-0 mb-2">
              تعذّر فحص حالة الإشعارات على الجهاز ده — خدمة الإشعارات في
              المتصفح مش جاهزة أو الفحص أخذ وقتاً أطول من اللازم.
            </p>
            <Button
              variant="soft"
              onClick={() => {
                setState('loading')
                setProbeRun((n) => n + 1)
              }}
            >
              إعادة الفحص
            </Button>
          </div>
        )}

        {state === 'ios-install' && (
          <div className="text-[13.5px] bg-soft rounded-xl px-3 py-2.5">
            <p className="mt-0 mb-2 font-semibold flex items-center gap-2">
              <Share size={18} className="shrink-0" />
              على آيفون، الإشعارات بتشتغل بس لو البوابة مثبّتة:
            </p>
            <ol className="m-0 ps-5 space-y-1">
              <li>اضغط زر المشاركة في سفاري.</li>
              <li>اختار «إضافة إلى الشاشة الرئيسية».</li>
              <li>افتح البوابة من الأيقونة الجديدة (iOS 16.4 أو أحدث) وفعّل الإشعارات من هنا.</li>
            </ol>
          </div>
        )}

        {state === 'unsupported' && (
          <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-0">
            المتصفح ده لا يدعم إشعارات Push — جرّب متصفحاً حديثاً زي كروم.
          </p>
        )}

        {state === 'unconfigured' && (
          <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-0">
            الإشعارات الفورية لسه مش مضبوطة في نسخة التطبيق دي.
          </p>
        )}

        {state === 'denied' && (
          <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-0">
            إذن الإشعارات مرفوض للموقع ده — فعّله من إعدادات إشعارات
            المتصفح للموقع ثم حدّث الصفحة.
          </p>
        )}

        {state === 'subscribed' && (
          <>
            <p className="text-[13.5px] bg-ok-soft text-ok-text rounded-xl px-3 py-2 mb-3 mt-0 flex items-center gap-2 font-semibold">
              <CheckCircle2 size={18} className="shrink-0" />
              الإشعارات الفورية مفعّلة على الجهاز ده.
            </p>
            <Button full variant="ghost" onClick={handleUnsubscribe} disabled={busy}>
              <BellOff size={20} />
              {busy ? 'جارٍ الإيقاف…' : 'إيقاف الإشعارات على الجهاز ده'}
            </Button>
          </>
        )}

        {state === 'not-subscribed' && (
          <Button full onClick={handleSubscribe} disabled={busy}>
            <Bell size={20} />
            {busy ? 'جارٍ التفعيل…' : 'تفعيل الإشعارات الفورية'}
          </Button>
        )}

        {msg && (
          <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-0 mt-3">{msg}</p>
        )}
      </Card>
    </>
  )
}
