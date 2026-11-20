import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, CheckCircle2 } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/AuthProvider'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import {
  getBrowserPushState,
  subscribeTeacherPush,
  unsubscribeTeacherPush,
  type BrowserPushState,
} from '../../lib/push'

/**
 * بطاقة «إشعارات Push» في الإعدادات (Phase 4 — الخطوة 1: البنية).
 *
 * ربط تجريبي/أساسي مقصود في هذه الخطوة: تفعيل/إيقاف اشتراك متصفح
 * المدرس الحالي عبر lib/push (يُحفظ في push_subscriptions كاشتراك
 * teacher). التنبيهات الفعلية للمدرس (إثبات دفع/امتحان/ملخص يومي)
 * تُبنى على هذا الاشتراك في الخطوة 3 — البطاقة نفسها لا ترسل شيئاً.
 * بنفس نمط بطاقة التثبيت: لا طلب إذن تلقائي أبداً، التفعيل بضغطة
 * صريحة فقط.
 */
export function PushNotificationsCard() {
  const { user } = useAuth()
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : ''
  const [state, setState] = useState<BrowserPushState | 'loading'>('loading')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) return
    try {
      setState(await getBrowserPushState(user.id))
    } catch {
      setState('not-subscribed')
    }
  }, [user])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!user) {
        if (!cancelled) setState('unsupported')
        return
      }
      try {
        const s = await getBrowserPushState(user.id)
        if (!cancelled) setState(s)
      } catch {
        if (!cancelled) setState('not-subscribed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const handleSubscribe = async () => {
    if (!user || !teacherId) return
    setBusy(true)
    setMsg(null)
    try {
      await subscribeTeacherPush({ teacherId, userId: user.id })
      setMsg('تمام — إشعارات Push مفعّلة على المتصفح ده.')
      await refresh()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'حصلت مشكلة في التفعيل — حاول تاني.')
    } finally {
      setBusy(false)
    }
  }

  const handleUnsubscribe = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await unsubscribeTeacherPush()
      setMsg('اتوقفت إشعارات Push على المتصفح ده.')
      await refresh()
    } catch {
      setMsg('حصلت مشكلة في الإيقاف — حاول تاني.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="type-section mt-0 mb-3 flex items-center gap-2">
        <Bell size={22} className="text-primary" /> إشعارات Push
      </h2>
      <p className="text-muted text-[13.5px] mt-0 mb-3">
        فعّل إشعارات المتصفح على الجهاز ده عشان توصلك تنبيهات التطبيق
        (زي إثباتات الدفع الجديدة ونتائج الامتحانات) حتى والتطبيق مقفول.
      </p>
      {state === 'loading' && (
        <p className="text-muted text-[13.5px] mb-0">جارٍ فحص حالة الإشعارات…</p>
      )}
      {state === 'unsupported' && (
        <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-0">
          المتصفح ده لا يدعم إشعارات Push. على آيفون: ثبّت التطبيق على
          الشاشة الرئيسية الأول (iOS 16.4 أو أحدث) وافتحه من هناك.
        </p>
      )}
      {state === 'unconfigured' && (
        <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-0">
          إشعارات Push لسه مش مضبوطة في نسخة التطبيق دي.
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
            إشعارات Push مفعّلة على المتصفح ده.
          </p>
          <Button full variant="ghost" onClick={handleUnsubscribe} disabled={busy}>
            <BellOff size={20} />
            {busy ? 'جارٍ الإيقاف…' : 'إيقاف إشعارات Push على الجهاز ده'}
          </Button>
        </>
      )}
      {state === 'not-subscribed' && (
        <Button full onClick={handleSubscribe} disabled={busy || !teacherId}>
          <Bell size={20} />
          {busy ? 'جارٍ التفعيل…' : 'تفعيل إشعارات Push على الجهاز ده'}
        </Button>
      )}
      {msg && (
        <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-0 mt-3">{msg}</p>
      )}
    </Card>
  )
}
